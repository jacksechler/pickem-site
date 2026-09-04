// Weekend safety, tiebreaker transparency, mobile polish, and commissioner activity log.
(() => {
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const valueText=v=>v==null?'Undecided':(typeof v==='string'?v:JSON.stringify(v));
  const fmt=v=>Number(v||0).toFixed(1).replace(/\.0$/,'');

  function firstName(p){
    const raw=String(p?.display_name||p?.username||'Player').trim();
    return raw.split(/\s+/)[0]||'Player';
  }

  async function logActivity(actionType,summary,details={},weekId=null){
    if(profile?.role!=='commissioner'||!session?.user?.id) return;
    try{
      await db('commissioner_activity_log',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({actor_id:session.user.id,week_id:weekId||null,action_type:actionType,summary,details:details||{}})});
      if(!el('commissioner')?.classList.contains('hidden')) injectActivityLog().catch(()=>{});
    }catch(e){ console.debug('Activity log skipped',e); }
  }
  window.logCommissionerActivity=logActivity;

  function installPolishCss(){
    if(document.getElementById('pickemQualityCss')) return;
    const s=document.createElement('style');
    s.id='pickemQualityCss';
    s.textContent=`
      .result-guard-overlay{position:fixed;inset:0;z-index:20000;background:rgba(1,8,18,.78);backdrop-filter:blur(7px);display:flex;align-items:center;justify-content:center;padding:18px}
      .result-guard-card{width:min(560px,100%);max-height:84vh;overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:18px;box-shadow:0 24px 70px rgba(0,0,0,.55)}
      .result-impact{padding:9px 10px;margin:7px 0;border-radius:10px;background:var(--panel2);border:1px solid var(--line)}
      .mobile-summary-cards{display:none}
      .quality-tie-card .tie-line{padding:9px 0;border-bottom:1px solid var(--line)}
      #historyBox .tablewrap,#leagueBox .tablewrap,#playerBox .tablewrap{-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;scrollbar-width:thin}
      #historyBox .table thead th,#leagueBox .table thead th{position:sticky;top:0;background:var(--panel);z-index:4}
      @media(max-width:760px){
        #playerBox .grid.three{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px}
        #playerBox .grid.three .card{padding:12px;margin:0;min-width:0}
        #playerBox .grid.three .big{font-size:24px}
        #historyBox> .card:first-child,#leagueBox> .card:first-child{padding:10px 12px;margin:7px 0}
        #historyBox> .card:first-child label,#leagueBox> .card:first-child label{margin-top:0}
        #historyBox select,#leagueBox select{font-size:16px;padding:10px}
        .desktop-summary-table{display:none!important}
        .mobile-summary-cards{display:grid;gap:8px;margin-top:10px}
        .mobile-summary-row{border:1px solid var(--line);background:var(--panel2);border-radius:12px;padding:10px}
        .mobile-summary-row .ms-title{font-weight:950;font-size:16px;margin-bottom:6px}
        .mobile-summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 10px}
        .mobile-summary-field{min-width:0}
        .mobile-summary-label{font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);font-weight:850}
        .mobile-summary-value{font-weight:850;overflow-wrap:anywhere}
        #historyBox .table td:first-child,#historyBox .table th:first-child,#leagueBox .table td:first-child,#leagueBox .table th:first-child{position:static!important;left:auto!important}
        .result-guard-card{padding:15px;border-radius:16px}
      }
    `;
    document.head.appendChild(s);
  }

  function showResultGuard(title,resultLabel,items){
    return new Promise(resolve=>{
      document.querySelector('.result-guard-overlay')?.remove();
      const overlay=document.createElement('div');
      overlay.className='result-guard-overlay';
      overlay.innerHTML='<div class="result-guard-card"><div class="eyebrow">CHECK RESULT</div><h2 style="margin:5px 0">'+esc(title)+'</h2><div class="notice"><b>Save as: '+esc(resultLabel)+'</b></div><div>'+items.map(x=>'<div class="result-impact">'+esc(x)+'</div>').join('')+'</div><div class="row" style="justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:14px"><button class="btn secondary" id="resultGuardCancel">Cancel</button><button class="btn" id="resultGuardConfirm">Confirm Result</button></div></div>';
      document.body.appendChild(overlay);
      const finish=v=>{overlay.remove();resolve(v);};
      overlay.querySelector('#resultGuardCancel').onclick=()=>finish(false);
      overlay.querySelector('#resultGuardConfirm').onclick=()=>finish(true);
      overlay.onclick=e=>{if(e.target===overlay)finish(false);};
    });
  }

  async function resultImpact(questionId,newResult){
    const q=questions.find(x=>x.id===questionId);
    if(!q) return ['Result impact could not be calculated.'];
    const [profiles,subs,picks,prevWeeks]=await Promise.all([
      db('profiles?select=id,display_name,username'),
      db('submissions?week_id=eq.'+week.id+'&select=user_id'),
      db('picks?week_id=eq.'+week.id+'&select=user_id,question_id,answer'),
      db('weeks?season_id=eq.'+week.season_id+'&number=lt.'+week.number+'&status=eq.published&select=id,number&order=number.desc&limit=1')
    ]);
    const ids=subs.map(s=>s.user_id);
    const names=Object.fromEntries(profiles.map(p=>[p.id,firstName(p)]));
    const pm={}; picks.forEach(p=>{(pm[p.user_id]??={})[p.question_id]=p.answer;});
    const correctIds=ids.filter(id=>same(pm[id]?.[q.id],newResult));
    const items=[correctIds.length+'/'+ids.length+' submitted players would be correct on this result.'];
    if(correctIds.length===1) items.push('🦄 Unicorn: '+(names[correctIds[0]]||'One player')+' would be the only correct picker (+3).');
    else if(correctIds.length===2) items.push('Two players would be correct, so each receives the +0.5 Upset bonus.');

    function leaders(override){
      const scored=questions.filter(x=>x.counts_for_score!==false);
      const usable=scored.filter(x=>x.id===q.id ? (override!==undefined || (x.result!==null&&x.result!==undefined)) : (x.result!==null&&x.result!==undefined));
      if(!usable.length) return [];
      const rows=ids.map(id=>({id,c:usable.reduce((n,x)=>{
        const r=x.id===q.id&&override!==undefined?override:x.result;
        return n+(same(pm[id]?.[x.id],r)?1:0);
      },0)}));
      const top=Math.max(...rows.map(r=>r.c));
      return rows.filter(r=>r.c===top).map(r=>names[r.id]||'Player').sort();
    }
    const before=leaders(undefined), after=leaders(newResult);
    const b=before.join(', '), a=after.join(', ');
    if(a&&a!==b){
      if(!b) items.push('Live lead starts with '+a+'.');
      else items.push('Live leader changes: '+b+' → '+a+'.');
    }

    if(prevWeeks[0]){
      const prevScores=await db('week_scores?week_id=eq.'+prevWeeks[0].id+'&select=user_id,correct_count,question_count');
      const perfect=new Set(prevScores.filter(s=>Number(s.question_count)>0&&Number(s.correct_count)===Number(s.question_count)).map(s=>s.user_id));
      const order=q.result_order==null?Math.max(0,...questions.map(x=>Number(x.result_order||0)))+1:Number(q.result_order);
      const prior=questions.filter(x=>x.counts_for_score!==false&&x.id!==q.id&&x.result!==null&&x.result!==undefined&&Number(x.result_order||999999)<order).sort((a,b)=>Number(a.result_order||999999)-Number(b.result_order||999999));
      for(const id of ids){
        if(!perfect.has(id)) continue;
        const alive=prior.every(x=>same(pm[id]?.[x.id],x.result));
        if(!alive) continue;
        if(!same(pm[id]?.[q.id],newResult)) items.push('🔥 '+(names[id]||'Player')+'\'s post-perfect streak would end at '+prior.length+' straight correct (+'+fmt(prior.length*0.5)+').');
      }
    }
    return items;
  }

  const baseSaveSingleResult=window.saveSingleResult;
  if(baseSaveSingleResult){
    window.saveSingleResult=async function(questionId){
      const q=questions.find(x=>x.id===questionId), sel=el('live_result_'+questionId);
      if(!q||!sel||sel.value==='') return alert('Choose the result first.');
      const opts=Array.isArray(q.answer_options)?q.answer_options:[];
      const next=opts[Number(sel.value)], old=q.result, wId=week.id, wName=week.name;
      let impacts;
      try{impacts=await resultImpact(questionId,next);}catch(e){console.debug(e);impacts=['Pick impact could not be fully calculated. Double-check the selected result before saving.'];}
      if(same(old,next)) impacts.unshift('This is already the saved result, so scoring should not change.');
      const ok=await showResultGuard(q.prompt,valueText(next),impacts);
      if(!ok) return;
      await baseSaveSingleResult(questionId);
      const fresh=questions.find(x=>x.id===questionId);
      if(fresh&&same(fresh.result,next)&&!same(old,next)){
        await logActivity('result_change',wName+' · Q'+(q.position||'?')+' result '+valueText(old)+' → '+valueText(next),{question_id:questionId,prompt:q.prompt,old_result:old,new_result:next,result_order:fresh.result_order},wId);
      }
    };
  }

  const baseSaveLiveTiebreaker=window.saveLiveTiebreaker;
  if(baseSaveLiveTiebreaker){
    window.saveLiveTiebreaker=async function(){
      const raw=el('liveActualTiebreaker')?.value;
      const old=week?.tiebreaker_result,wId=week?.id,wName=week?.name;
      await baseSaveLiveTiebreaker();
      if(raw!==''&&wId&&Number(old)!==Number(raw)) await logActivity('tiebreaker_result',wName+' tiebreaker result '+valueText(old)+' → '+raw,{old_result:old,new_result:Number(raw)},wId);
    };
  }

  const baseSaveFinalCorrections=window.saveFinalCorrections;
  if(baseSaveFinalCorrections){
    window.saveFinalCorrections=async function(){
      const wId=week?.id,wName=week?.name,oldTie=week?.tiebreaker_result;
      const oldResults=Object.fromEntries(questions.map(q=>[q.id,q.result]));
      await baseSaveFinalCorrections();
      if(!wId) return;
      try{
        const [wr,qs]=await Promise.all([db('weeks?id=eq.'+wId+'&select=tiebreaker_result'),db('questions?week_id=eq.'+wId+'&select=id,result')]);
        const changed=qs.filter(q=>!same(oldResults[q.id],q.result)).map(q=>({question_id:q.id,old_result:oldResults[q.id],new_result:q.result}));
        if(changed.length||Number(oldTie)!==Number(wr[0]?.tiebreaker_result)) await logActivity('final_recalculation','Edited official results and recalculated '+wName,{result_changes:changed,old_tiebreaker:oldTie,new_tiebreaker:wr[0]?.tiebreaker_result},wId);
      }catch{}
    };
  }

  const baseArchived=window.applyArchivedCorrection;
  if(baseArchived){
    window.applyArchivedCorrection=async function(){
      const wId=el('archivedWeekSelect')?.value;
      let beforeWeek=null,beforeQs=[];
      if(wId){
        try{[beforeWeek,beforeQs]=await Promise.all([db('weeks?id=eq.'+wId+'&select=id,name,tiebreaker_result'),db('questions?week_id=eq.'+wId+'&select=id,result,prompt')]);}catch{}
      }
      await baseArchived();
      if(!wId||!beforeWeek?.[0]) return;
      try{
        const [afterWeek,afterQs]=await Promise.all([db('weeks?id=eq.'+wId+'&select=id,name,tiebreaker_result'),db('questions?week_id=eq.'+wId+'&select=id,result,prompt')]);
        const oldMap=Object.fromEntries(beforeQs.map(q=>[q.id,q.result]));
        const changes=afterQs.filter(q=>!same(oldMap[q.id],q.result)).map(q=>({question_id:q.id,prompt:q.prompt,old_result:oldMap[q.id],new_result:q.result}));
        if(changes.length||Number(beforeWeek[0].tiebreaker_result)!==Number(afterWeek[0]?.tiebreaker_result)) await logActivity('archive_recalculation','Corrected archived '+beforeWeek[0].name+' and recalculated official scores',{result_changes:changes,old_tiebreaker:beforeWeek[0].tiebreaker_result,new_tiebreaker:afterWeek[0]?.tiebreaker_result},wId);
      }catch{}
    };
  }

  const baseEditQuestion=window.saveQuestionEditor;
  if(baseEditQuestion){
    window.saveQuestionEditor=async function(id){
      const q=questions.find(x=>x.id===id), old=q?{prompt:q.prompt,sport:q.sport,answer_options:q.answer_options,position:q.position}:null;
      const wId=week?.id,wName=week?.name;
      await baseEditQuestion(id);
      const fresh=questions.find(x=>x.id===id);
      if(old&&fresh&&(!same(old.answer_options,fresh.answer_options)||old.prompt!==fresh.prompt||old.sport!==fresh.sport)) await logActivity('question_edit',wName+' · edited Q'+(fresh.position||old.position),{question_id:id,before:old,after:{prompt:fresh.prompt,sport:fresh.sport,answer_options:fresh.answer_options,position:fresh.position}},wId);
    };
  }

  const baseDeleteQuestion=window.deleteQuestionSafe;
  if(baseDeleteQuestion){
    window.deleteQuestionSafe=async function(id){
      const q=questions.find(x=>x.id===id),wId=week?.id,wName=week?.name;
      await baseDeleteQuestion(id);
      if(q&&!questions.some(x=>x.id===id)) await logActivity('question_delete',wName+' · deleted Q'+(q.position||'?')+': '+q.prompt,{question_id:id,prompt:q.prompt,position:q.position},wId);
    };
  }

  const baseMoveQuestion=window.moveQuestionSafe;
  if(baseMoveQuestion){
    window.moveQuestionSafe=async function(id,direction){
      const q=questions.find(x=>x.id===id),oldPos=q?.position,wId=week?.id,wName=week?.name;
      await baseMoveQuestion(id,direction);
      const fresh=questions.find(x=>x.id===id);
      if(q&&fresh&&Number(oldPos)!==Number(fresh.position)) await logActivity('question_reorder',wName+' · moved “'+q.prompt+'” from Q'+oldPos+' to Q'+fresh.position,{question_id:id,old_position:oldPos,new_position:fresh.position},wId);
    };
  }

  const basePublish=window.publishCurrentWeek;
  if(basePublish){
    window.publishCurrentWeek=async function(){
      const wId=week?.id,wName=week?.name,was=week?.status;
      await basePublish();
      if(wId&&was!=='published'&&week?.id===wId&&week?.status==='published') await logActivity('week_publish','Published '+wName+' and updated official standings',{week_id:wId},wId);
    };
  }

  async function activityCardHtml(){
    const rows=await db('commissioner_activity_log?select=id,week_id,action_type,summary,created_at,details&order=created_at.desc&limit=30');
    return '<div class="card" id="commissionerActivityCard"><div class="row" style="gap:10px;align-items:flex-end;flex-wrap:wrap"><div style="flex:1"><div class="eyebrow">COMMISSIONER LOG</div><h2 style="margin:4px 0">What Changed?</h2><div class="muted">A timestamped record of result corrections, recalculations, question changes, publishes, and notification tests.</div></div><button class="btn secondary" onclick="refreshCommissionerActivity()">Refresh</button></div><div style="margin-top:10px">'+(rows.length?rows.map(r=>'<div style="padding:10px 0;border-bottom:1px solid var(--line)"><div class="row" style="gap:10px;align-items:flex-start"><div style="min-width:0;flex:1"><b>'+esc(r.summary)+'</b><div class="mini">'+esc(new Date(r.created_at).toLocaleString())+'</div></div><span class="pill">'+esc(String(r.action_type||'change').replace(/_/g,' '))+'</span></div></div>').join(''):'<div class="muted" style="padding:10px 0">No commissioner changes have been recorded yet.</div>')+'</div></div>';
  }

  async function injectActivityLog(){
    if(profile?.role!=='commissioner') return;
    const box=el('commissionerBox'); if(!box) return;
    el('commissionerActivityCard')?.remove();
    try{box.insertAdjacentHTML('beforeend',await activityCardHtml());}catch(e){console.debug('Activity log unavailable',e);}
  }
  window.refreshCommissionerActivity=injectActivityLog;

  const baseCommissioner=window.renderCommissioner;
  if(baseCommissioner){
    window.renderCommissioner=async function(){
      await baseCommissioner();
      await injectActivityLog();
    };
  }

  async function tiebreakerExplanationHtml(weekId){
    const [wr,scores,profiles]=await Promise.all([
      db('weeks?id=eq.'+weekId+'&status=eq.published&select=id,name,tiebreaker_result'),
      db('week_scores?week_id=eq.'+weekId+'&select=user_id,placement,correct_count,tiebreaker_answer'),
      db('profiles?select=id,display_name,username')
    ]);
    const w=wr[0]; if(!w||w.tiebreaker_result==null||!scores.length) return '';
    const names=Object.fromEntries(profiles.map(p=>[p.id,firstName(p)]));
    const groups={}; scores.forEach(s=>(groups[String(s.correct_count)]??=[]).push(s));
    const tied=Object.values(groups).filter(g=>g.length>1);
    if(!tied.length) return '';
    const actual=Number(w.tiebreaker_result);
    const lines=tied.map(group=>{
      const rows=[...group].sort((a,b)=>Number(a.placement)-Number(b.placement)).map(s=>({name:names[s.user_id]||'Player',answer:Number(s.tiebreaker_answer),distance:Math.abs(Number(s.tiebreaker_answer)-actual),placement:Number(s.placement)}));
      const duplicateDistance=new Set(rows.map(r=>r.distance)).size<rows.length;
      const order=rows.map(r=>r.name+' '+fmt(r.answer)+' ('+fmt(r.distance)+' away)').join(' → ');
      return '<div class="tie-line"><b>'+(duplicateDistance?'Exact-distance tie resolved by commissioner':'Tiebreaker decided tied records')+'</b><div class="mini" style="margin-top:3px">'+esc(order)+' · Actual: '+esc(fmt(actual))+'</div></div>';
    }).join('');
    return '<div class="card quality-tie-card"><div class="eyebrow">WHY THE ORDER?</div><h2 style="margin:4px 0">Tiebreaker Breakdown</h2><div class="muted">The tiebreaker only separates players with the same number of correct picks; it is never scored as a pick.</div>'+lines+'</div>';
  }

  async function injectTiebreaker(containerId,weekId){
    const box=el(containerId); if(!box||!weekId) return;
    box.querySelector('.quality-tie-card')?.remove();
    try{
      const html=await tiebreakerExplanationHtml(weekId); if(!html) return;
      const cards=[...box.querySelectorAll('.card')];
      const scoreCard=cards.find(c=>c.querySelector('.eyebrow')?.textContent?.trim()==='WEEK STATS');
      if(scoreCard) scoreCard.insertAdjacentHTML('afterend',html); else box.insertAdjacentHTML('beforeend',html);
    }catch(e){console.debug('Tiebreaker explanation skipped',e);}
  }

  function mobileCardsFromTable(card){
    if(!card||card.querySelector('.mobile-summary-cards')) return;
    const table=card.querySelector('table'); if(!table) return;
    const headers=[...table.querySelectorAll('thead th')].map(x=>(x.textContent||'').trim());
    const rows=[...table.querySelectorAll('tbody tr')]; if(!rows.length) return;
    table.classList.add('desktop-summary-table');
    const out=document.createElement('div'); out.className='mobile-summary-cards';
    out.innerHTML=rows.map(tr=>{
      const cells=[...tr.querySelectorAll('td')].map(x=>(x.textContent||'').trim());
      const primaryIndex=headers[0]==='Week'?0:(headers[1]==='Player'?1:(cells[1]?1:0));
      const title=cells[primaryIndex]||cells[0]||'Result';
      const fields=cells.map((v,i)=>({label:headers[i]||'',value:v})).filter((x,i)=>x.value&&i!==primaryIndex&&x.label);
      return '<div class="mobile-summary-row"><div class="ms-title">'+esc(title)+'</div><div class="mobile-summary-grid">'+fields.map(f=>'<div class="mobile-summary-field"><div class="mobile-summary-label">'+esc(f.label)+'</div><div class="mobile-summary-value">'+esc(f.value)+'</div></div>').join('')+'</div></div>';
    }).join('');
    table.insertAdjacentElement('afterend',out);
  }

  function polishHistoryLike(containerId){
    const box=el(containerId); if(!box) return;
    const scoreCard=[...box.querySelectorAll('.card')].find(c=>c.querySelector('.eyebrow')?.textContent?.trim()==='WEEK STATS');
    mobileCardsFromTable(scoreCard);
  }

  function polishPlayer(){
    const box=el('playerBox'); if(!box) return;
    const logCard=[...box.querySelectorAll('.card')].find(c=>c.querySelector('.eyebrow')?.textContent?.trim()==='WEEK-BY-WEEK');
    mobileCardsFromTable(logCard);
  }

  const baseHistory=window.renderHistory;
  if(baseHistory){
    window.renderHistory=async function(){
      await baseHistory();
      polishHistoryLike('historyBox');
      const id=el('historyBox')?.querySelector('select[onchange*="setHistoryWeek"]')?.value;
      if(id) await injectTiebreaker('historyBox',id);
    };
  }

  const baseLeague=window.renderLeague;
  if(baseLeague){
    window.renderLeague=async function(){
      await baseLeague();
      polishHistoryLike('leagueBox');
      const id=el('leagueBox')?.querySelector('select[onchange*="setLeagueHistoryWeek"]')?.value || week?.id;
      if(id) await injectTiebreaker('leagueBox',id);
    };
  }

  const basePlayer=window.renderPlayerProfile;
  if(basePlayer){
    window.renderPlayerProfile=async function(id){
      await basePlayer(id);
      polishPlayer();
    };
  }

  installPolishCss();
})();
