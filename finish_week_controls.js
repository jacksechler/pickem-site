// Clear end-of-week commissioner controls.
(() => {
  function isDecided(q){ return q?.result !== null && q?.result !== undefined; }
  function isLockedWeek(){
    if(!week) return false;
    return week.status === 'published' || !!week.auto_locked_at || Date.now() >= new Date(week.lock_at).getTime();
  }

  async function submissionCount(){
    if(!week) return 0;
    try{
      const rows = await db('submissions?week_id=eq.'+week.id+'&select=user_id');
      return Array.isArray(rows) ? rows.length : 0;
    }catch{
      return 0;
    }
  }

  function checklistRow(ok,label,detail){
    return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)">'+
      '<div style="width:22px;text-align:center;font-weight:950;color:'+(ok?'var(--green)':'var(--gold)')+'">'+(ok?'✓':'•')+'</div>'+
      '<div style="flex:1"><b>'+esc(label)+'</b><div class="mini">'+esc(detail)+'</div></div></div>';
  }

  async function buildFinishWeekCard(){
    if(week?.phase==='playoff') return '';
    if(profile?.role !== 'commissioner' || !week || week.status === 'published' || !isLockedWeek()) return '';

    const scored = questions.filter(q => q.counts_for_score !== false);
    const decided = scored.filter(isDecided).length;
    const allResults = scored.length > 0 && decided === scored.length;
    const tbSaved = week.tiebreaker_result !== null && week.tiebreaker_result !== undefined && week.tiebreaker_result !== '';
    const subs = await submissionCount();
    const allSubs = subs === 8;
    const ready = allResults && allSubs;

    let h = '<div class="card" id="finishWeekCard" style="border-color:#38bdf8;box-shadow:0 10px 30px rgba(0,0,0,.16)">'+
      '<div class="eyebrow">FINISH WEEK</div><h2 style="margin:4px 0">Finalize '+esc(week.name)+'</h2>'+
      '<div class="muted">When everything below is ready, calculate the final standings, review them, then publish the week.</div>'+
      '<div style="margin-top:12px">'+
        checklistRow(allResults,'Results',decided+'/'+scored.length+' scored results entered')+
        checklistRow(allSubs,'Player entries',subs+'/8 submitted')+
        checklistRow(tbSaved,'Actual tiebreaker',tbSaved?('Saved: '+String(week.tiebreaker_result)):'Enter the final number below')+
      '</div>'+
      '<label style="margin-top:14px">Actual tiebreaker result</label>'+
      '<div class="row" style="align-items:stretch;gap:8px">'+
        '<input id="finishWeekTiebreaker" type="number" step="any" value="'+esc(week.tiebreaker_result??'')+'" placeholder="Final number">'+
        '<button class="btn secondary" style="width:auto;white-space:nowrap" onclick="saveFinishWeekTiebreaker()">Save</button>'+
      '</div>';

    if(!allResults){
      h += '<div class="notice" style="margin-top:14px"><b>'+ (scored.length-decided) +' result'+((scored.length-decided)===1?'':'s')+' left.</b><div class="muted">Enter the remaining result'+((scored.length-decided)===1?'':'s')+' in Live Result Entry first.</div></div>';
    }else if(!allSubs){
      h += '<div class="notice" style="margin-top:14px"><b>Waiting on submitted entries.</b><div class="muted">All 8 players must have a submitted entry before the week can be published.</div></div>';
    }

    h += '<button id="finishWeekCalculateBtn" class="btn full" '+(!ready?'disabled':'')+' onclick="calculateFinishWeek()">Calculate Final Scores</button>'+
      '<div class="mini">The tiebreaker will be saved automatically from the field above before calculation.</div>'+
      '<div id="finishWeekPreview"></div></div>';
    return h;
  }

  async function injectFinishWeekCard(){
    const box = el('commissionerBox');
    if(!box || profile?.role !== 'commissioner') return;
    document.getElementById('finishWeekCard')?.remove();
    const html = await buildFinishWeekCard();
    if(html) box.insertAdjacentHTML('afterbegin',html);
  }

  window.saveFinishWeekTiebreaker = async function(silent=false){
    if(!week || week.status === 'published') return false;
    const input = el('finishWeekTiebreaker');
    if(!input) return false;
    const raw = input.value;
    if(raw === '' || raw == null){
      if(!silent) alert('Enter the actual tiebreaker result.');
      return false;
    }
    const value = Number(raw);
    if(!Number.isFinite(value)){
      if(!silent) alert('Enter a valid tiebreaker number.');
      return false;
    }
    try{
      await db('weeks?id=eq.'+week.id,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({tiebreaker_result:value})});
      week.tiebreaker_result = value;
      const old = el('actualTiebreaker');
      if(old) old.value = String(value);
      if(!silent){
        await loadData();
        await renderCommissioner();
      }
      return true;
    }catch(e){
      console.error(e);
      if(!silent) alert('Could not save the tiebreaker.');
      return false;
    }
  };

  window.calculateFinishWeek = async function(){
    const btn = el('finishWeekCalculateBtn');
    if(btn){ btn.disabled=true; btn.textContent='Calculating…'; }
    try{
      const saved = await saveFinishWeekTiebreaker(true);
      if(!saved){
        alert('Enter the actual tiebreaker result first.');
        return;
      }
      // Keep the old scoring panel in sync, since commissioner_v2 writes its preview there.
      await loadData();
      const oldTb = el('actualTiebreaker');
      if(oldTb) oldTb.value = String(week.tiebreaker_result ?? '');
      const data = await window.previewWeekScores();
      const source = el('scorePreview');
      const target = el('finishWeekPreview');
      if(target){
        target.innerHTML = source?.innerHTML || '<div class="notice">Could not build the score preview.</div>';
        if(data && !data.unresolved?.length){
          const publish = target.querySelector('button[onclick="publishCurrentWeek()"]');
          if(publish){
            publish.textContent = 'Publish '+week.name+' & Continue';
            publish.style.marginTop = '14px';
          }
        }
        target.scrollIntoView({behavior:'smooth',block:'nearest'});
      }
    }catch(e){
      console.error(e);
      alert('Could not calculate final scores.');
    }finally{
      if(btn && document.body.contains(btn)){ btn.disabled=false; btn.textContent='Calculate Final Scores'; }
    }
  };

  const baseRenderCommissioner = window.renderCommissioner;
  if(baseRenderCommissioner){
    window.renderCommissioner = async function(){
      const out = await baseRenderCommissioner.apply(this,arguments);
      await injectFinishWeekCard();
      return out;
    };
  }

  const basePublish = window.publishCurrentWeek;
  if(basePublish){
    window.publishCurrentWeek = async function(){
      const beforeId = week?.id;
      const out = await basePublish.apply(this,arguments);
      if(beforeId && week?.id === beforeId && week?.status === 'published'){
        // commissioner_v2 already renders Create Next Week; keep it at the very top after publish.
        await renderCommissioner();
      }
      return out;
    };
  }
})();
