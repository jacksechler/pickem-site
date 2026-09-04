// Safer commissioner tools: final-week corrections + edit/delete/reorder questions.
(() => {
  const baseRenderCommissioner = window.renderCommissioner;
  let finalCorrectionMode = false;

  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const fmt = v => Number(v||0).toFixed(1).replace(/\.0$/,'');

  async function rpc(name,body){
    return await db('rpc/'+name,{method:'POST',body:JSON.stringify(body)});
  }

  function questionManagerHtml(){
    if(!week || week.status==='published' || locked()) return '';
    const rows=questions.map((q,i)=>{
      const opts=Array.isArray(q.answer_options)?q.answer_options:[];
      return '<div style="padding:11px 0;border-bottom:1px solid var(--line)">'+
        '<div class="row" style="align-items:flex-start;gap:10px;flex-wrap:wrap">'+
          '<div style="flex:1;min-width:220px"><div class="mini">'+esc(q.sport||'Other')+' · Question '+(i+1)+'</div><b>'+esc(q.prompt)+'</b><div class="mini">'+esc(opts.join(' · '))+'</div></div>'+
          '<div style="display:flex;gap:6px;flex-wrap:wrap">'+
            '<button class="btn secondary" '+(i===0?'disabled':'')+' onclick="moveQuestionSafe(\''+q.id+'\',-1)">↑</button>'+
            '<button class="btn secondary" '+(i===questions.length-1?'disabled':'')+' onclick="moveQuestionSafe(\''+q.id+'\',1)">↓</button>'+
            '<button class="btn secondary" onclick="openQuestionEditor(\''+q.id+'\')">Edit</button>'+
            '<button class="btn secondary" onclick="deleteQuestionSafe(\''+q.id+'\')">Delete</button>'+
          '</div>'+
        '</div></div>';
    }).join('');
    return '<div class="card" id="questionManager"><div class="eyebrow">WEEK SETUP</div><h2 style="margin:4px 0">Question Manager</h2><div class="muted">Edit, delete, or reorder before the week locks. If changing choices would invalidate saved picks, Pick\'em will warn you and force affected players to re-submit.</div>'+rows+'<div id="questionEditBox"></div></div>';
  }

  function finalCorrectionHtml(){
    if(!week || week.status!=='published') return '';
    if(!finalCorrectionMode){
      return '<div class="card" id="finalCorrectionCard"><div class="eyebrow">FINAL CORRECTIONS</div><h2 style="margin:4px 0">Edit & Recalculate '+esc(week.name)+'</h2><div class="muted">Fix an entered result or tiebreaker after publishing, then recalculate the official scores without deleting the week.</div><button class="btn secondary" style="margin-top:12px" onclick="toggleFinalCorrectionMode(true)">Edit Final Week</button></div>';
    }
    const scored=questions.filter(q=>q.counts_for_score!==false).sort((a,b)=>Number(a.position||0)-Number(b.position||0));
    const rows=scored.map((q,i)=>{
      const opts=Array.isArray(q.answer_options)?q.answer_options:[];
      const selected=opts.findIndex(v=>same(v,q.result));
      const choices='<option value="">Choose corrected result</option>'+opts.map((v,idx)=>'<option value="'+idx+'" '+(idx===selected?'selected':'')+'>'+esc(typeof v==='string'?v:JSON.stringify(v))+'</option>').join('');
      return '<div style="padding:10px 0;border-bottom:1px solid var(--line)"><div class="mini">Question '+(i+1)+'</div><b>'+esc(q.prompt)+'</b><select id="finalResult_'+q.id+'" style="margin-top:7px">'+choices+'</select></div>';
    }).join('');
    return '<div class="card" id="finalCorrectionCard"><div class="eyebrow">FINAL CORRECTIONS</div><h2 style="margin:4px 0">Correct '+esc(week.name)+'</h2><div class="notice"><b>This changes official results.</b><div class="muted">The app will recalculate placements, bonuses, season standings, and stats from the corrected results.</div></div>'+rows+'<label>Actual tiebreaker result</label><input id="finalTieResult" type="number" step="any" value="'+esc(week.tiebreaker_result??'')+'"><div class="row" style="justify-content:flex-start;flex-wrap:wrap;margin-top:12px"><button class="btn" onclick="saveFinalCorrections()">Save & Recalculate</button><button class="btn secondary" onclick="toggleFinalCorrectionMode(false)">Cancel</button></div><div id="scorePreview"></div></div>';
  }

  window.renderCommissioner = async function(){
    await baseRenderCommissioner();
    if(profile?.role!=='commissioner') return;
    const box=el('commissionerBox');
    if(!box) return;

    if(week && !locked() && week.status!=='published'){
      [...box.querySelectorAll('.card')].forEach(card=>{
        const h=card.querySelector('h2');
        if(h && h.textContent.trim()==='Questions') card.remove();
      });
      const addCard=[...box.querySelectorAll('.card')].find(card=>card.querySelector('h2')?.textContent.trim()==='Add Question');
      const html=questionManagerHtml();
      if(addCard) addCard.insertAdjacentHTML('afterend',html);
      else box.insertAdjacentHTML('afterbegin',html);
    }

    if(week?.status==='published') box.insertAdjacentHTML('afterbegin',finalCorrectionHtml());
  };

  window.openQuestionEditor=function(id){
    const q=questions.find(x=>x.id===id);
    const out=el('questionEditBox');
    if(!q||!out) return;
    const opts=Array.isArray(q.answer_options)?q.answer_options:[];
    out.innerHTML='<div class="notice" style="margin-top:14px"><div class="eyebrow">EDIT QUESTION</div><label>Sport</label><input id="editQuestionSport" value="'+esc(q.sport||'Other')+'"><label>Question</label><input id="editQuestionPrompt" value="'+esc(q.prompt||'')+'"><label>Choices (comma separated)</label><input id="editQuestionOptions" value="'+esc(opts.join(', '))+'"><div class="row" style="justify-content:flex-start;flex-wrap:wrap;margin-top:10px"><button class="btn" onclick="saveQuestionEditor(\''+id+'\')">Save Changes</button><button class="btn secondary" onclick="cancelQuestionEditor()">Cancel</button></div></div>';
    out.scrollIntoView({behavior:'smooth',block:'nearest'});
  };

  window.cancelQuestionEditor=function(){ if(el('questionEditBox')) el('questionEditBox').innerHTML=''; };

  window.saveQuestionEditor=async function(id){
    const prompt=(el('editQuestionPrompt')?.value||'').trim();
    const sport=(el('editQuestionSport')?.value||'Other').trim()||'Other';
    const opts=(el('editQuestionOptions')?.value||'').split(',').map(x=>x.trim()).filter(Boolean);
    if(!prompt) return alert('Enter the question.');
    if(opts.length<2) return alert('Enter at least two choices.');
    const payload={p_question_id:id,p_prompt:prompt,p_sport:sport,p_answer_options:opts,p_reset_existing:false};
    try{
      let result=await rpc('commissioner_update_question',payload);
      if(result?.needs_reset){
        const msg='Changing these choices affects '+Number(result.pick_count||0)+' saved pick'+(Number(result.pick_count||0)===1?'':'s')+'. To keep the week fair, those picks will be cleared and any submitted entries will need to be submitted again. Continue?';
        if(!confirm(msg)) return;
        result=await rpc('commissioner_update_question',{...payload,p_reset_existing:true});
      }
      await loadData();
      renderHome();
      await renderCommissioner();
      alert(result?.reset?'Question saved. Affected picks were cleared and players must re-submit.':'Question saved.');
    }catch(e){
      console.error(e);
      alert('Could not edit question: '+(e.message||'unknown error'));
    }
  };

  window.deleteQuestionSafe=async function(id){
    const q=questions.find(x=>x.id===id);
    if(!q) return;
    if(!confirm('Delete “'+q.prompt+'”?')) return;
    try{
      let result=await rpc('commissioner_delete_question',{p_question_id:id,p_reset_existing:false});
      if(result?.needs_reset){
        const msg='This question already has saved activity. Deleting it will remove its picks and clear submitted entries so everyone can re-submit the updated week. Continue?';
        if(!confirm(msg)) return;
        result=await rpc('commissioner_delete_question',{p_question_id:id,p_reset_existing:true});
      }
      await loadData();
      renderHome();
      await renderCommissioner();
      alert(result?.reset?'Question deleted. Submitted entries were reset so players can re-submit.':'Question deleted.');
    }catch(e){
      console.error(e);
      alert('Could not delete question: '+(e.message||'unknown error'));
    }
  };

  window.moveQuestionSafe=async function(id,direction){
    try{
      await rpc('commissioner_move_question',{p_question_id:id,p_direction:Number(direction)});
      await loadData();
      await renderCommissioner();
    }catch(e){
      console.error(e);
      alert('Could not reorder that question.');
    }
  };

  window.toggleFinalCorrectionMode=async function(on){
    finalCorrectionMode=!!on;
    await renderCommissioner();
  };

  function scorePayload(rows){
    return rows.map(r=>({
      week_id:week.id,user_id:r.user_id,placement:r.placement,correct_count:r.correct_count,question_count:r.question_count,
      pick_percentage:r.pick_percentage,placement_points:r.placement_points,perfect_bonus:r.perfect_bonus,
      unicorn_bonus:r.unicorn_bonus,upset_bonus:r.upset_bonus,streak_bonus:r.streak_bonus,cold_bonus:r.cold_bonus,
      total_points:r.total_points,unicorn_count:r.unicorn_count,upset_count:r.upset_count,opening_streak:r.opening_streak,
      tiebreaker_answer:r.tiebreaker_answer
    }));
  }

  window.saveFinalCorrections=async function(){
    if(!week || week.status!=='published') return;
    const scored=questions.filter(q=>q.counts_for_score!==false);
    const updates=[];
    for(const q of scored){
      const sel=el('finalResult_'+q.id);
      if(!sel || sel.value==='') return alert('Choose a result for every scored question.');
      const opts=Array.isArray(q.answer_options)?q.answer_options:[];
      updates.push([q.id,opts[Number(sel.value)]]);
    }
    const tb=el('finalTieResult')?.value;
    if(tb===''||tb==null) return alert('Enter the actual tiebreaker result.');
    if(!confirm('Save these corrected official results and recalculate '+week.name+'?')) return;
    try{
      for(const [id,result] of updates){
        await db('questions?id=eq.'+id,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({result})});
      }
      await db('weeks?id=eq.'+week.id,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({tiebreaker_result:Number(tb)})});
      await loadData();
      await renderCommissioner();
      const preview=await window.previewWeekScores?.();
      if(!preview) throw new Error('Could not recalculate scores.');
      if(preview.unresolved?.length){
        alert('Corrections are saved. There is an exact tiebreaker tie — resolve the order in the panel below, then use the Publish button to apply the recalculated scores.');
        return;
      }
      await db('week_scores?on_conflict=week_id,user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(scorePayload(preview.rows))});
      finalCorrectionMode=false;
      await loadData();
      renderHome();
      renderStandings();
      renderStats();
      await renderCommissioner();
      alert(week.name+' corrected. Official scores, standings, and stats were recalculated.');
    }catch(e){
      console.error(e);
      alert('Could not apply final corrections: '+(e.message||'unknown error'));
    }
  };
})();
