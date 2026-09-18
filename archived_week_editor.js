// Commissioner editor for inactive published weeks.
(() => {
  const baseRenderCommissioner = window.renderCommissioner;
  const archiveState = { weekId:null, week:null, questions:[], preview:null };

  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const fmt = v => Number(v||0).toFixed(1).replace(/\.0$/,'');
  const valueText = v => typeof v === 'string' ? v : JSON.stringify(v);

  async function publishedArchiveWeeks(){
    return await db('weeks?status=eq.published&is_active=eq.false&select=*&order=number.desc');
  }

  async function loadArchiveWeekData(id){
    const rows = await db('weeks?id=eq.'+id+'&status=eq.published&select=*');
    if(!rows[0]) throw new Error('That published week could not be loaded.');
    const qs = await db('questions?week_id=eq.'+id+'&select=*&order=position.asc');
    archiveState.weekId=id;
    archiveState.week=rows[0];
    archiveState.questions=qs;
    archiveState.preview=null;
  }

  function archiveEditorHtml(){
    const w=archiveState.week;
    if(!w) return '<div id="archivedEditor"></div>';
    if(w.phase==='playoff') return '<div id="archivedEditor" class="notice"><h3>'+esc(w.name)+'</h3><p>Playoff corrections recalculate the cut and championship totals.</p><button class="btn secondary" data-ps-action="edit-correction" data-week="'+w.id+'">Review playoff correction</button></div>';
    if(window.Postseason?.live()) return '<div id="archivedEditor" class="notice">The regular season is frozen for playoffs.</div>';
    const scored=archiveState.questions.filter(q=>q.counts_for_score!==false);
    const rows=scored.map((q,i)=>{
      const opts=Array.isArray(q.answer_options)?q.answer_options:[];
      const selected=opts.findIndex(v=>same(v,q.result));
      return '<div style="padding:10px 0;border-bottom:1px solid var(--line)">'+
        '<div class="mini">'+esc(q.sport||'Other')+' · Question '+(i+1)+'</div><b>'+esc(q.prompt)+'</b>'+
        '<select id="archiveResult_'+q.id+'" style="margin-top:7px">'+
          '<option value="">Choose official result</option>'+opts.map((v,idx)=>'<option value="'+idx+'" '+(idx===selected?'selected':'')+'>'+esc(valueText(v))+'</option>').join('')+
        '</select></div>';
    }).join('');
    return '<div id="archivedEditor" class="notice" style="margin-top:14px">'+
      '<div class="eyebrow">EDITING ARCHIVE</div><h3 style="margin:4px 0">'+esc(w.name)+'</h3>'+
      '<div class="muted">Correct old official results without making this week active again. A correction can also update the next published week\'s post-perfect streak bonus when necessary.</div>'+rows+
      '<label>Actual tiebreaker result</label><input id="archiveTieResult" type="number" step="any" value="'+esc(w.tiebreaker_result??'')+'">'+
      '<div class="row" style="justify-content:flex-start;flex-wrap:wrap;margin-top:12px">'+
        '<button class="btn secondary" onclick="previewArchivedCorrection()">Preview Recalculation</button>'+
        '<button class="btn secondary" onclick="closeArchivedWeekEditor()">Close</button></div>'+ 
      '<div id="archivedPreview"></div></div>';
  }

  async function archiveCardHtml(){
    const weeks=await publishedArchiveWeeks();
    if(!weeks.length){
      return '<div class="card" id="archivedWeekManager"><div class="eyebrow">PAST WEEKS</div><h2 style="margin:4px 0">Published Week Archive</h2><div class="muted">Once you publish a week and open the next one, old weeks will appear here for safe corrections.</div></div>';
    }
    const selected=archiveState.weekId||'';
    return '<div class="card" id="archivedWeekManager"><div class="eyebrow">PAST WEEKS</div><h2 style="margin:4px 0">Published Week Archive</h2>'+ 
      '<div class="muted">Open any inactive published week to review or correct its official results and tiebreaker.</div>'+ 
      '<div class="row" style="align-items:end;gap:10px;flex-wrap:wrap;margin-top:10px"><div style="flex:1;min-width:210px"><label style="margin-top:0">Week</label><select id="archivedWeekSelect">'+
        '<option value="">Choose a past week</option>'+weeks.map(w=>'<option value="'+w.id+'" '+(w.id===selected?'selected':'')+'>'+esc(w.name)+' · Week '+w.number+'</option>').join('')+
      '</select></div><button class="btn secondary" onclick="openArchivedWeekEditor()">Open Week</button></div>'+archiveEditorHtml()+'</div>';
  }

  window.renderCommissioner = async function(){
    await baseRenderCommissioner();
    if(profile?.role!=='commissioner') return;
    const box=el('commissionerBox');
    if(!box) return;
    el('archivedWeekManager')?.remove();
    try{
      const html=await archiveCardHtml();
      box.insertAdjacentHTML('beforeend',html);
    }catch(e){
      console.debug('Published archive manager skipped',e);
    }
  };

  window.openArchivedWeekEditor=async function(){
    const id=el('archivedWeekSelect')?.value;
    if(!id) return alert('Choose a past published week.');
    try{
      await loadArchiveWeekData(id);
      await renderCommissioner();
      setTimeout(()=>el('archivedEditor')?.scrollIntoView({behavior:'smooth',block:'start'}),80);
    }catch(e){
      console.error(e);
      alert(e.message||'Could not open that week.');
    }
  };

  window.closeArchivedWeekEditor=async function(){
    archiveState.weekId=null;
    archiveState.week=null;
    archiveState.questions=[];
    archiveState.preview=null;
    await renderCommissioner();
  };

  function readArchiveOverrides(){
    const scored=archiveState.questions.filter(q=>q.counts_for_score!==false);
    const results={};
    for(const q of scored){
      const sel=el('archiveResult_'+q.id);
      if(!sel || sel.value==='') throw new Error('Choose a result for every scored question.');
      const opts=Array.isArray(q.answer_options)?q.answer_options:[];
      results[q.id]=opts[Number(sel.value)];
    }
    const tieRaw=el('archiveTieResult')?.value;
    if(tieRaw===''||tieRaw==null) throw new Error('Enter the actual tiebreaker result.');
    return {results,tiebreaker:Number(tieRaw)};
  }

  async function scoringPeople(){
    const profiles=await db('profiles?select=id,display_name,role');
    const slots=await db('player_slots?select=slot,display_name,claimed_by&order=slot.asc');
    const commissioner=profiles.find(p=>p.role==='commissioner');
    const people=[];
    if(commissioner) people.push({id:commissioner.id,name:commissioner.display_name||'Commissioner'});
    for(const s of slots){
      if(!s.claimed_by) throw new Error('All 8 player accounts must be activated.');
      const p=profiles.find(x=>x.id===s.claimed_by);
      if(!p) throw new Error('A player profile is missing.');
      people.push({id:p.id,name:p.display_name||s.display_name||('Player '+s.slot)});
    }
    if(people.length!==8) throw new Error('Scoring requires exactly 8 players.');
    return people;
  }

  async function calculateArchivedWeek(overrides){
    const w=archiveState.week;
    if(!w) throw new Error('That archived week is not loaded.');
    if(w.phase==='playoff') throw new Error('Use playoff corrections.');
    const core=window.RegularScoringCore;
    if(!core) throw new Error('Regular scoring engine did not load.');

    const people=await scoringPeople();
    const submissions=await db('submissions?week_id=eq.'+w.id+'&select=user_id,tiebreaker_answer');
    const picks=await db('picks?week_id=eq.'+w.id+'&select=user_id,question_id,answer');

    let previousScores=[];
    const previousWeeks=await db('weeks?season_id=eq.'+w.season_id+'&number=lt.'+w.number+'&phase=eq.regular&status=eq.published&select=id,number&order=number.desc&limit=1');
    if(previousWeeks[0]){
      previousScores=await db('week_scores?week_id=eq.'+previousWeeks[0].id+'&select=user_id,correct_count,question_count');
    }

    return core.calculate({
      people,
      questions:archiveState.questions,
      picks,
      submissions,
      tiebreakerResult:overrides.tiebreaker,
      previousScores,
      results:overrides.results
    });
  }

  function previewHtml(data){
    const table='<div class="tablewrap" style="margin-top:12px"><table class="table"><thead><tr><th>Place</th><th>Player</th><th>Correct</th><th>TB Diff</th><th>Place Pts</th><th>Bonuses</th><th>Total</th></tr></thead><tbody>'+data.rows.map(r=>{
      const bonuses=[];
      if(r.perfect_bonus) bonuses.push('Perfect +'+fmt(r.perfect_bonus));
      if(r.unicorn_bonus) bonuses.push('Unicorn +'+fmt(r.unicorn_bonus));
      if(r.upset_bonus) bonuses.push('Upset +'+fmt(r.upset_bonus));
      if(r.streak_bonus) bonuses.push('Streak +'+fmt(r.streak_bonus));
      if(r.cold_bonus) bonuses.push('Cold '+fmt(r.cold_bonus));
      return '<tr><td><b>'+(r.golf_tie?'T':'#')+r.placement+'</b></td><td><b>'+esc(r.name)+'</b></td><td>'+r.correct_count+'/'+r.question_count+'</td><td>'+fmt(r.tb_distance)+'</td><td>'+fmt(r.placement_points)+'</td><td>'+(bonuses.join(', ')||'—')+'</td><td><b>'+fmt(r.total_points)+'</b></td></tr>';
    }).join('')+'</tbody></table></div>';
    const tieNotice=data.rows.some(r=>r.golf_tie)?'<div class="notice"><b>Golf-style tie split applied</b><div class="muted">Exact ties share the same place and split the placement points for the tied spots.</div></div>':'';
    return tieNotice+table+'<button class="btn full" onclick="applyArchivedCorrection()">Apply Corrected Official Scores</button><div class="mini">This keeps the week archived and updates season totals automatically.</div>';
  }

  window.previewArchivedCorrection=async function(){
    const out=el('archivedPreview');
    if(out) out.innerHTML='<div class="muted" style="margin-top:12px">Recalculating…</div>';
    try{
      const overrides=readArchiveOverrides();
      const data=await calculateArchivedWeek(overrides);
      archiveState.preview={overrides,data};
      if(out) out.innerHTML=previewHtml(data);
    }catch(e){
      if(out) out.innerHTML='<div class="notice"><b>Cannot recalculate yet.</b><div class="muted">'+esc(e.message||'Check the week data.')+'</div></div>';
    }
  };

  function scorePayload(w,rows){
    return window.RegularScoringCore.scorePayload(w.id,rows);
  }

  async function refreshNextPublishedStreak(targetWeek,targetRows){
    const next=await db('weeks?season_id=eq.'+targetWeek.season_id+'&number=gt.'+targetWeek.number+'&phase=eq.regular&status=eq.published&select=id,number,name&order=number.asc&limit=1');
    if(!next[0]) return null;
    const nw=next[0];
    const qs=window.RegularScoringCore.sortScoredQuestions(
      await db('questions?week_id=eq.'+nw.id+'&counts_for_score=eq.true&select=id,result,position,result_order&order=position.asc')
    );
    const picks=await db('picks?week_id=eq.'+nw.id+'&select=user_id,question_id,answer');
    const pickMap={}; picks.forEach(p=>{(pickMap[p.user_id]??={})[p.question_id]=p.answer;});
    const scores=await db('week_scores?week_id=eq.'+nw.id+'&select=*');
    const prevMap={}; targetRows.forEach(r=>prevMap[r.user_id]=r);
    const updates=[];
    for(const s of scores){
      const prev=prevMap[s.user_id];
      const prevPerfect=!!(prev&&Number(prev.question_count)>0&&Number(prev.correct_count)===Number(prev.question_count));
      let opening=0;
      if(prevPerfect){
        for(const q of qs){ if(window.RegularScoringCore.sameAnswer(pickMap[s.user_id]?.[q.id],q.result)) opening++; else break; }
      }
      const newBonus=opening*0.5, oldBonus=Number(s.streak_bonus||0), total=Number(s.total_points||0)-oldBonus+newBonus;
      updates.push({week_id:nw.id,user_id:s.user_id,opening_streak:opening,streak_bonus:newBonus,total_points:total});
    }
    if(updates.length) await db('week_scores?on_conflict=week_id,user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(updates)});
    return nw;
  }

  window.applyArchivedCorrection=async function(){
    const w=archiveState.week;
    if(!w) return;
    try{
      const overrides=readArchiveOverrides();
      const data=await calculateArchivedWeek(overrides);
      if(!confirm('Apply these corrected official results to '+w.name+'?')) return;
      for(const q of archiveState.questions.filter(q=>q.counts_for_score!==false)){
        await db('questions?id=eq.'+q.id,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({result:overrides.results[q.id]})});
      }
      await db('weeks?id=eq.'+w.id,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({tiebreaker_result:overrides.tiebreaker})});
      await db('week_scores?on_conflict=week_id,user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(scorePayload(w,data.rows))});
      const nextAdjusted=await refreshNextPublishedStreak(w,data.rows);
      await loadArchiveWeekData(w.id);
      renderStandings();
      renderStats();
      await renderCommissioner();
      alert(w.name+' corrected.'+(nextAdjusted?' '+nextAdjusted.name+' post-perfect streak bonuses were checked and updated too.':''));
    }catch(e){
      console.error(e);
      alert('Could not apply archived correction: '+(e.message||'unknown error'));
    }
  };
})();
