// Copy-friendly weekly and season standings.
(() => {
  const n=v=>Number(v||0);
  const fmt=v=>n(v).toFixed(1).replace(/\.0$/,'');
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const decided=q=>q.result!==null&&q.result!==undefined;
  const name=p=>String(p?.display_name||p?.username||'Player').trim();
  const firstName=p=>name(p).split(/\s+/)[0]||'Player';

  function resultOrder(a,b){
    const ao=a.result_order==null?999999:Number(a.result_order);
    const bo=b.result_order==null?999999:Number(b.result_order);
    return ao-bo||Number(a.position||0)-Number(b.position||0);
  }

  function currentStreak(qs,pm){
    let s=0;
    for(let i=qs.length-1;i>=0;i--){
      if(same(pm?.[qs[i].id],qs[i].result)) s++;
      else break;
    }
    return s;
  }

  async function writeClipboard(text,buttonId){
    let ok=false;
    try{
      if(navigator.clipboard?.writeText){ await navigator.clipboard.writeText(text); ok=true; }
    }catch{}
    if(!ok){
      try{
        const ta=document.createElement('textarea');
        ta.value=text;
        ta.setAttribute('readonly','');
        ta.style.position='fixed'; ta.style.opacity='0'; ta.style.pointerEvents='none';
        document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0,ta.value.length);
        ok=document.execCommand('copy'); ta.remove();
      }catch{}
    }
    const b=document.getElementById(buttonId);
    if(b){
      const original=b.dataset.original||b.textContent;
      b.dataset.original=original;
      b.textContent=ok?'Copied ✓':'Copy failed';
      setTimeout(()=>{ if(document.body.contains(b)) b.textContent=original; },1400);
    }
    if(!ok) alert('Could not copy automatically. Try again from Safari.');
  }

  function selectedLeagueWeekId(){
    return document.querySelector('#leagueBox select[onchange*="setLeagueHistoryWeek"]')?.value||week?.id||null;
  }

  async function weeklyText(){
    const id=selectedLeagueWeekId();
    if(!id) throw new Error('No week selected');
    const [wr,profiles,qs,subs,picks,scores]=await Promise.all([
      db('weeks?id=eq.'+id+'&select=*&limit=1'),
      db('profiles?select=id,display_name,username'),
      db('questions?week_id=eq.'+id+'&select=*&order=position.asc'),
      db('submissions?week_id=eq.'+id+'&select=user_id,tiebreaker_answer'),
      db('picks?week_id=eq.'+id+'&select=user_id,question_id,answer'),
      db('week_scores?week_id=eq.'+id+'&select=*')
    ]);
    const w=wr[0]; if(!w) throw new Error('Week unavailable');
    const pmap=Object.fromEntries(profiles.map(p=>[p.id,p]));
    const subMap=Object.fromEntries(subs.map(s=>[s.user_id,s]));
    const scoreMap=Object.fromEntries(scores.map(s=>[s.user_id,s]));
    const pm={}; picks.forEach(p=>{(pm[p.user_id]??={})[p.question_id]=p.answer;});
    const scored=qs.filter(q=>q.counts_for_score!==false);
    const dq=scored.filter(decided).sort(resultOrder);
    const actual=w.tiebreaker_result;
    const hasActual=actual!==null&&actual!==undefined&&actual!==''&&Number.isFinite(Number(actual));
    const isFinal=w.status==='published'&&scores.length>0;

    const rows=subs.map(s=>{
      const id=s.user_id;
      const sc=scoreMap[id];
      const correct=isFinal&&sc?Number(sc.correct_count||0):dq.filter(q=>same(pm[id]?.[q.id],q.result)).length;
      const total=isFinal&&sc?Number(sc.question_count||scored.length):dq.length;
      const ans=s.tiebreaker_answer;
      const a=Number(ans), act=Number(actual);
      const dist=hasActual&&ans!==null&&ans!==''&&Number.isFinite(a)&&Number.isFinite(act)?Math.abs(a-act):null;
      return {
        id,name:firstName(pmap[id]),correct,total,streak:currentStreak(dq,pm[id]),
        answer:ans,dist,points:isFinal&&sc?Number(sc.total_points||0):null,
        storedPlace:isFinal&&sc?Number(sc.placement||999):null
      };
    });

    if(isFinal){
      rows.sort((a,b)=>a.storedPlace-b.storedPlace||((b.points??0)-(a.points??0))||a.name.localeCompare(b.name));
      rows.forEach(r=>r.rank=r.storedPlace);
    }else{
      rows.sort((a,b)=>b.correct-a.correct||(hasActual?((a.dist??Infinity)-(b.dist??Infinity)):0)||a.name.localeCompare(b.name));
      let prev=null,rank=0;
      rows.forEach((r,i)=>{
        const key=r.correct+'|'+(hasActual?(r.dist??Infinity):'pending');
        if(key!==prev) rank=i+1;
        r.rank=rank; prev=key;
      });
    }

    const lines=[
      "🏆 PICK'EM — "+(w.name||('Week '+w.number))+' STANDINGS',
      (isFinal?'Final':'Live')+' • '+dq.length+'/'+scored.length+' results decided',
      'Tiebreaker: '+(hasActual?'Actual '+fmt(actual):'Actual pending'),
      ''
    ];
    rows.forEach(r=>{
      const streak=r.streak>=2?'🔥'+r.streak:String(r.streak);
      let tb='—';
      if(r.answer!==null&&r.answer!==undefined&&r.answer!=='') tb=String(r.answer)+(r.dist!=null?' ('+fmt(r.dist)+' away)':'');
      lines.push('#'+r.rank+' '+r.name+' — '+r.correct+'/'+r.total+' correct'+(isFinal?' • '+fmt(r.points)+' pts':''));
      lines.push('   Pick streak: '+streak+' • TB: '+tb);
    });
    return lines.join('\n');
  }

  async function seasonText(){
    const [profiles,weeks,allScores]=await Promise.all([
      db('profiles?select=id,display_name,username'),
      db('weeks?status=eq.published&select=id,number,name&order=number.asc'),
      db('week_scores?select=*')
    ]);
    if(!weeks.length) throw new Error('No published standings');
    const ids=new Set(weeks.map(w=>w.id));
    const scores=allScores.filter(s=>ids.has(s.week_id));
    const pmap=Object.fromEntries(profiles.map(p=>[p.id,p]));
    const latest=weeks[weeks.length-1];
    const priorIds=new Set(weeks.slice(0,-1).map(w=>w.id));
    const totals={},correct={},questions={},latestScore={},priorTotals={};
    scores.forEach(s=>{
      totals[s.user_id]=(totals[s.user_id]||0)+n(s.total_points);
      correct[s.user_id]=(correct[s.user_id]||0)+n(s.correct_count);
      questions[s.user_id]=(questions[s.user_id]||0)+n(s.question_count);
      if(s.week_id===latest.id) latestScore[s.user_id]=s;
      if(priorIds.has(s.week_id)) priorTotals[s.user_id]=(priorTotals[s.user_id]||0)+n(s.total_points);
    });
    const nm=id=>name(pmap[id]);
    const current=Object.keys(totals).sort((a,b)=>totals[b]-totals[a]||nm(a).localeCompare(nm(b)));
    const prev=Object.keys(priorTotals).sort((a,b)=>priorTotals[b]-priorTotals[a]||nm(a).localeCompare(nm(b)));
    const prevRank=Object.fromEntries(prev.map((id,i)=>[id,i+1]));

    const running={},history=Object.fromEntries(current.map(id=>[id,[]]));
    weeks.forEach(w=>{
      scores.filter(s=>s.week_id===w.id).forEach(s=>running[s.user_id]=(running[s.user_id]||0)+n(s.total_points));
      const r=Object.keys(running).sort((a,b)=>running[b]-running[a]||nm(a).localeCompare(nm(b)));
      const ranks=Object.fromEntries(r.map((id,i)=>[id,i+1]));
      current.forEach(id=>history[id].push(ranks[id]||null));
    });

    const lines=["🏆 PICK'EM — 2026 SEASON STANDINGS",'Through '+(latest.name||('Week '+latest.number)),''];
    current.forEach((id,i)=>{
      const rank=i+1;
      const lp=latestScore[id]?.placement?'#'+latestScore[id].placement:'—';
      const pct=questions[id]?correct[id]/questions[id]*100:0;
      let move='—';
      if(weeks.length>=2&&prevRank[id]){
        const d=prevRank[id]-rank;
        move=d>0?'↑'+d:d<0?'↓'+Math.abs(d):'—';
      }
      const hist=history[id].map((r,j)=>'W'+weeks[j].number+' '+(r?'#'+r:'—')).join(' → ');
      lines.push('#'+rank+' '+nm(id)+' — '+fmt(totals[id])+' pts');
      lines.push('   Pick %: '+pct.toFixed(1)+'% • Last week: '+lp+' • Movement: '+move);
      lines.push('   Rank history: '+hist);
    });
    return lines.join('\n');
  }

  window.copyWeeklyStandings=async function(){
    try{ await writeClipboard(await weeklyText(),'copyWeeklyStandingsBtn'); }
    catch(e){ console.error(e); alert('Could not build the weekly standings text.'); }
  };

  window.copySeasonStandings=async function(){
    try{ await writeClipboard(await seasonText(),'copySeasonStandingsBtn'); }
    catch(e){ console.error(e); alert('Could not build the season standings text.'); }
  };

  function injectWeekly(){
    const card=document.getElementById('weeklyStandingsV2');
    if(!card||document.getElementById('copyWeeklyStandingsBtn')) return;
    const row=card.querySelector('.row'); if(!row) return;
    const b=document.createElement('button');
    b.id='copyWeeklyStandingsBtn'; b.className='btn secondary'; b.textContent='Copy Weekly Standings';
    b.style.padding='8px 10px'; b.onclick=window.copyWeeklyStandings;
    row.appendChild(b);
  }

  function injectSeason(){
    const box=el('standingsBox');
    if(!box||document.getElementById('copySeasonStandingsBtn')) return;
    if(!box.querySelector('.card')&&!box.querySelector('.notice')) return;
    const holder=document.createElement('div');
    holder.style.cssText='display:flex;justify-content:flex-end;margin:0 0 10px';
    holder.innerHTML='<button id="copySeasonStandingsBtn" class="btn secondary" style="padding:9px 11px">Copy Season Standings</button>';
    holder.querySelector('button').onclick=window.copySeasonStandings;
    box.insertAdjacentElement('afterbegin',holder);
  }

  const baseLeague=window.renderLeague;
  if(baseLeague) window.renderLeague=async function(){ const v=await baseLeague.apply(this,arguments); injectWeekly(); return v; };
  const baseStandings=window.renderStandings;
  if(baseStandings) window.renderStandings=async function(){ const v=await baseStandings.apply(this,arguments); injectSeason(); return v; };

  const baseShowPage=window.showPage;
  if(baseShowPage) window.showPage=function(id){
    const v=baseShowPage.apply(this,arguments);
    setTimeout(()=>{ if(id==='league') injectWeekly(); if(id==='standings') injectSeason(); },250);
    return v;
  };

  setTimeout(()=>{ injectWeekly(); injectSeason(); },1600);
})();
