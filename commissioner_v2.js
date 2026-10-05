// Commissioner Week 2 workflow: results, scoring, publish, and create-next-week.
(() => {
  const baseRenderCommissioner = window.renderCommissioner;
  function sameAnswer(a,b){ return JSON.stringify(a) === JSON.stringify(b); }
  function fmtNum(v){
    const n=Number(v||0);
    return n.toFixed(1).replace(/\.0$/,'');
  }
  function resultIndex(q){
    const opts=Array.isArray(q.answer_options)?q.answer_options:[];
    return opts.findIndex(v=>sameAnswer(v,q.result));
  }
  function resultPanelHtml(){
    if(!week || week.phase==='playoff') return '';
    if(week.status==='published'){
      const next=Number(week.number)+1;
      return '<div class="card"><div class="eyebrow">WEEK COMPLETE</div><h2>'+esc(week.name)+' is published</h2><p class="muted">Scores are official and visible in Standings and Stats.</p></div>'+nextWeekHtml(next);
    }
    if(!locked()){
      return '<div class="card"><div class="eyebrow">WEEK WORKFLOW</div><h2>Results & Scoring</h2><p class="muted">Winner entry opens automatically after this week locks. You can still edit questions and the deadline while the week is open.</p></div>';
    }
    const rows=questions.map((q,i)=>{
      const opts=Array.isArray(q.answer_options)?q.answer_options:[];
      const selected=resultIndex(q);
      const options=['<option value="">Select winner / result</option>'].concat(opts.map((v,idx)=>'<option value="'+idx+'" '+(idx===selected?'selected':'')+'>'+esc(typeof v==='string'?v:JSON.stringify(v))+'</option>')).join('');
      return '<div style="padding:12px 0;border-bottom:1px solid var(--line)"><div class="mini">'+esc(q.sport||'Other')+' · Question '+(i+1)+'</div><b>'+esc(q.prompt)+'</b><select id="result_'+q.id+'" style="margin-top:8px">'+options+'</select></div>';
    }).join('');
    return '<div class="card"><div class="eyebrow">COMMISSIONER RESULTS</div><h2>Enter Results</h2><p class="muted">Choose the correct answer for every scored question, then enter the actual tiebreaker result.</p>'+rows+'<label>Actual tiebreaker result</label><input id="actualTiebreaker" type="number" step="any" value="'+esc(week.tiebreaker_result??'')+'" placeholder="Final number"><div class="row" style="margin-top:14px;justify-content:flex-start;flex-wrap:wrap"><button class="btn" onclick="saveWeekResults()">Save Results</button><button class="btn secondary" onclick="previewWeekScores()">Calculate Scores</button></div><div id="scorePreview"></div></div>';
  }
  function nextWeekHtml(next){
    return '<div class="card" id="nextWeekLauncher"><div class="eyebrow">START NEXT WEEK</div><h2>Week '+next+' — whenever you’re ready</h2><p class="muted">The weekly schedule is only a blueprint. Start this next card on any day you choose. The playoff schedule is fixed and is not changed by this.</p><div class="pill">Next regular-season week · '+next+'</div><label>Week name</label><input id="nextWeekName" value="Week '+next+'" placeholder="Week '+next+'"><label>Pick lock date & time</label><input id="nextWeekLock" type="datetime-local"><label>Tiebreaker prompt</label><input id="nextWeekTie" value="Total points in the final game?"><button class="btn full" onclick="createNextWeek()">Start Week '+next+'</button></div>';
  }

  window.renderCommissioner = async function(){
    await baseRenderCommissioner();
    if(profile?.role!=='commissioner') return;
    const box=el('commissionerBox');
    if(!box) return;
    box.insertAdjacentHTML('afterbegin',resultPanelHtml());
  };

  window.saveWeekResults = async function(){
    if(!week || week.status==='published') return;
    const scored=questions.filter(q=>q.counts_for_score!==false);
    const updates=[];
    for(const q of scored){
      const sel=el('result_'+q.id);
      if(!sel || sel.value==='') return alert('Choose a result for every scored question.');
      const opts=Array.isArray(q.answer_options)?q.answer_options:[];
      updates.push([q.id,opts[Number(sel.value)]]);
    }
    const tb=el('actualTiebreaker')?.value;
    if(tb==='' || tb==null) return alert('Enter the actual tiebreaker result.');
    try{
      for(const [id,result] of updates){
        await db('questions?id=eq.'+id,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({result})});
      }
      await db('weeks?id=eq.'+week.id,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({tiebreaker_result:Number(tb)})});
      await loadData();
      await renderCommissioner();
      alert('Results saved.');
    }catch(e){
      console.error(e);
      alert('Could not save results.');
    }
  };

  async function buildScoreData(){
    if(!week) throw new Error('No active week.');
    if(week.phase==='playoff') throw new Error('Use Calculate playoff standings to finalize this round.');
    const core=window.RegularScoringCore;
    if(!core) throw new Error('Regular scoring engine did not load.');

    const profiles=await db('profiles?select=id,display_name,role');
    const slots=await db('player_slots?select=slot,display_name,claimed_by&order=slot.asc');
    const commissioner=profiles.find(p=>p.role==='commissioner');
    const people=[];
    if(commissioner) people.push({id:commissioner.id,name:commissioner.display_name||'Commissioner'});
    for(const slot of slots){
      if(!slot.claimed_by) throw new Error('All 8 player accounts must be activated before publishing.');
      const p=profiles.find(x=>x.id===slot.claimed_by);
      if(!p) throw new Error('A player account is missing its profile.');
      people.push({id:p.id,name:p.display_name||slot.display_name||('Player '+slot.slot)});
    }

    const submissions=await db('submissions?week_id=eq.'+week.id+'&select=user_id,tiebreaker_answer');
    const picks=await db('picks?week_id=eq.'+week.id+'&select=user_id,question_id,answer');

    let previousScores=[];
    const previousWeeks=await db('weeks?season_id=eq.'+week.season_id+'&number=lt.'+week.number+'&phase=eq.regular&status=eq.published&select=id,number&order=number.desc&limit=1');
    if(previousWeeks[0]){
      previousScores=await db('week_scores?week_id=eq.'+previousWeeks[0].id+'&select=user_id,correct_count,question_count');
    }

    return core.calculate({
      people,
      questions,
      picks,
      submissions,
      tiebreakerResult:week.tiebreaker_result,
      previousScores
    });
  }

  window.previewWeekScores = async function(){
    const out=el('scorePreview');
    if(out) out.innerHTML='<div class="muted" style="margin-top:14px">Calculating…</div>';
    try{
      const {rows,unresolved}=await buildScoreData();
      const table='<div class="tablewrap" style="margin-top:14px"><table class="table"><thead><tr><th>Place</th><th>Player</th><th>Correct</th><th>TB Diff</th><th>Place Pts</th><th>Bonuses</th><th>Total</th></tr></thead><tbody>'+rows.map(r=>{
        const bonuses=[];
        if(r.perfect_bonus) bonuses.push('Perfect +'+fmtNum(r.perfect_bonus));
        if(r.unicorn_bonus) bonuses.push('Unicorn +'+fmtNum(r.unicorn_bonus));
        if(r.upset_bonus) bonuses.push('Upset +'+fmtNum(r.upset_bonus));
        if(r.streak_bonus) bonuses.push('Streak +'+fmtNum(r.streak_bonus));
        if(r.cold_bonus) bonuses.push('Cold '+fmtNum(r.cold_bonus));
        return '<tr><td><b>'+(r.golf_tie?'T':'#')+r.placement+'</b></td><td><b>'+esc(r.name)+'</b></td><td>'+r.correct_count+'/'+r.question_count+'</td><td>'+fmtNum(r.tb_distance)+'</td><td>'+fmtNum(r.placement_points)+'</td><td>'+(bonuses.join(', ')||'—')+'</td><td><b>'+fmtNum(r.total_points)+'</b></td></tr>';
      }).join('')+'</tbody></table></div>';
      const resolver=rows.some(r=>r.golf_tie)?'<div class="notice"><b>Golf-style tie split applied</b><div class="muted">Players exactly tied on correct picks and tiebreaker distance share the same place and split the placement points for the tied spots.</div></div>':'';
      const publish='<button class="btn full" '+(unresolved.length?'disabled':'')+' onclick="publishCurrentWeek()">Publish '+esc(week.name)+'</button><div class="mini">Publishing makes the scores visible to everyone and unlocks Create Next Week.</div>';
      if(out) out.innerHTML=resolver+table+publish;
      return {rows,unresolved};
    }catch(e){
      if(out) out.innerHTML='<div class="notice"><b>Cannot calculate yet.</b><div class="muted">'+esc(e.message||'Check the results and submissions.')+'</div></div>';
      return null;
    }
  };

  window.publishCurrentWeek = async function(){
    try{
      const data=await buildScoreData();
      if(data.unresolved.length) return alert('Resolve the exact tiebreaker tie before publishing.');
      if(!confirm('Publish '+week.name+'? Scores will become visible to the league.')) return;
      const payload=window.RegularScoringCore.scorePayload(week.id,data.rows);
      await db('week_scores?on_conflict=week_id,user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(payload)});
      await db('weeks?id=eq.'+week.id,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:'published',published_at:new Date().toISOString()})});
      await loadData();
      renderHome();
      renderStandings();
      renderStats();
      await renderCommissioner();
      alert(week.name+' published!');
    }catch(e){
      console.error(e);
      alert('Could not publish: '+(e.message||'unknown error'));
    }
  };

  window.createNextWeek = async function(){
    if(!week || week.status!=='published') return alert('Publish the current week first.');
    const number=Number(week.number)+1;
    const name=(el('nextWeekName')?.value||'').trim();
    const lock=el('nextWeekLock')?.value;
    const tie=(el('nextWeekTie')?.value||'').trim();

    if(!Number.isInteger(number)||number<1) return alert('Could not determine the next week number.');
    if(!name) return alert('Enter a name for the new week.');
    if(!lock) return alert('Choose the new week lock date and time.');
    const lockDate=new Date(lock);
    if(!Number.isFinite(lockDate.getTime()) || lockDate.getTime()<=Date.now()) return alert('The new week lock must be in the future.');
    if(!tie) return alert('Enter a tiebreaker prompt.');

    if(!window.Postseason?.createNext) return alert('Please refresh Pick’em and try again.');
    if(!confirm('Start '+name+' now? The current published week will remain in the history and this will become the active week.')) return;

    try{
      await window.Postseason.createNext({
        name,
        lock_at:lockDate.toISOString(),
        tiebreaker_prompt:tie
      });
      alert(name+' is now open.');
    }catch(e){
      console.error(e);
      alert(e.message||'Could not start the next week.');
    }
  };;
})();
