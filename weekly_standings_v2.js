// Tiebreaker-aware weekly standings + live pick streaks.
(() => {
  const n=v=>Number(v||0);
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const decided=q=>q.result!==null&&q.result!==undefined;
  const firstName=p=>{
    const raw=String(p?.display_name||p?.username||'Player').trim();
    return raw.includes(' ')?raw.split(/\s+/)[0]:raw;
  };
  const fmt=v=>{
    const x=Number(v);
    return Number.isFinite(x)?x.toFixed(1).replace(/\.0$/,''):'—';
  };

  function resultOrder(a,b){
    const ao=a.result_order==null?999999:Number(a.result_order);
    const bo=b.result_order==null?999999:Number(b.result_order);
    return ao-bo||Number(a.position||0)-Number(b.position||0);
  }

  function currentPickStreak(scoredDecided,picks){
    let streak=0;
    for(let i=scoredDecided.length-1;i>=0;i--){
      const q=scoredDecided[i];
      if(same(picks?.[q.id],q.result)) streak++;
      else break;
    }
    return streak;
  }

  function streakLabel(v){
    if(v>=2) return '🔥 '+v;
    return String(v||0);
  }

  function tbInfo(sub,actual){
    const ans=sub?.tiebreaker_answer;
    if(ans===null||ans===undefined||ans==='') return {answer:null,distance:null,label:'—'};
    const a=Number(ans), act=Number(actual);
    if(actual===null||actual===undefined||actual===''||!Number.isFinite(a)||!Number.isFinite(act)){
      return {answer:ans,distance:null,label:String(ans)};
    }
    const d=Math.abs(a-act);
    return {answer:ans,distance:d,label:String(ans)+' · Δ'+fmt(d)};
  }

  async function selectedWeekId(){
    const sel=document.querySelector('#leagueBox select[onchange*="setLeagueHistoryWeek"]');
    return sel?.value||week?.id||null;
  }

  async function loadStandingData(weekId){
    const [wr,profiles,qs,subs,picks,scores]=await Promise.all([
      db('weeks?id=eq.'+weekId+'&select=*&limit=1'),
      db('profiles?select=id,display_name,username'),
      db('questions?week_id=eq.'+weekId+'&select=*&order=position.asc'),
      db('submissions?week_id=eq.'+weekId+'&select=user_id,tiebreaker_answer,submitted_at'),
      db('picks?week_id=eq.'+weekId+'&select=user_id,question_id,answer'),
      db('week_scores?week_id=eq.'+weekId+'&select=*')
    ]);
    const w=wr[0];
    const pmap=Object.fromEntries(profiles.map(p=>[p.id,p]));
    const subMap=Object.fromEntries(subs.map(s=>[s.user_id,s]));
    const scoreMap=Object.fromEntries(scores.map(s=>[s.user_id,s]));
    const pickMap={};
    picks.forEach(p=>{(pickMap[p.user_id]??={})[p.question_id]=p.answer;});
    const users=subs.map(s=>s.user_id).filter(id=>pmap[id]);
    const scored=qs.filter(q=>q.counts_for_score!==false);
    const scoredDecided=scored.filter(decided).sort(resultOrder);
    return {w,pmap,subMap,scoreMap,pickMap,users,scored,scoredDecided,scores};
  }

  function liveRows(d){
    const actual=d.w?.tiebreaker_result;
    const hasActual=actual!==null&&actual!==undefined&&actual!==''&&Number.isFinite(Number(actual));
    const rows=d.users.map(id=>{
      const correct=d.scoredDecided.filter(q=>same(d.pickMap[id]?.[q.id],q.result)).length;
      const tb=tbInfo(d.subMap[id],actual);
      return {
        id,
        name:firstName(d.pmap[id]),
        correct,
        decided:d.scoredDecided.length,
        streak:currentPickStreak(d.scoredDecided,d.pickMap[id]),
        tb,
        tieDistance:hasActual?(tb.distance==null?Number.POSITIVE_INFINITY:tb.distance):null
      };
    });
    rows.sort((a,b)=>{
      if(b.correct!==a.correct) return b.correct-a.correct;
      if(hasActual && a.tieDistance!==b.tieDistance) return a.tieDistance-b.tieDistance;
      return a.name.localeCompare(b.name);
    });
    let prevKey=null,rank=0;
    rows.forEach((r,i)=>{
      const key=hasActual?r.correct+'|'+r.tieDistance:String(r.correct);
      if(key!==prevKey) rank=i+1;
      r.rank=rank;
      r.exactTbTie=hasActual&&rows.some(o=>o!==r&&o.correct===r.correct&&o.tieDistance===r.tieDistance);
      prevKey=key;
    });
    return {rows,hasActual,actual};
  }

  function finalRows(d){
    const actual=d.w?.tiebreaker_result;
    const rows=d.users.map(id=>{
      const s=d.scoreMap[id];
      const tb=tbInfo(d.subMap[id],actual);
      return {
        id,
        name:firstName(d.pmap[id]),
        rank:s?Number(s.placement||0):999,
        correct:s?Number(s.correct_count||0):d.scoredDecided.filter(q=>same(d.pickMap[id]?.[q.id],q.result)).length,
        questionCount:s?Number(s.question_count||d.scored.length):d.scored.length,
        streak:currentPickStreak(d.scoredDecided,d.pickMap[id]),
        tb,
        points:s?Number(s.total_points||0):null
      };
    }).sort((a,b)=>a.rank-b.rank||((b.points??-Infinity)-(a.points??-Infinity))||a.name.localeCompare(b.name));
    return {rows,actual};
  }

  function standingsHtml(d){
    const isFinal=d.w?.status==='published'&&d.scores.length>0;
    if(!d.users.length) return '<div class="card"><div class="eyebrow">WEEKLY STANDINGS</div><div class="muted" style="margin-top:6px">No submitted players yet.</div></div>';
    if(!d.scoredDecided.length&&!isFinal){
      return '<div class="card"><div class="eyebrow">WEEKLY STANDINGS</div><h2 style="margin:4px 0">Waiting for results</h2><div class="muted">Pick streaks and live positions appear after the first result is entered.</div></div>';
    }

    const out=isFinal?finalRows(d):liveRows(d);
    const actual=out.actual;
    const hasActual=actual!==null&&actual!==undefined&&actual!==''&&Number.isFinite(Number(actual));
    const decidedCount=d.scoredDecided.length;
    const status=isFinal?'Final':'Live';
    let h='<div class="card tablewrap" id="weeklyStandingsV2"><div class="row" style="align-items:flex-end;gap:12px;flex-wrap:wrap"><div><div class="eyebrow">WEEKLY STANDINGS</div><h2 style="margin:4px 0">'+esc(d.w?.name||'Week')+' · '+status+'</h2><div class="muted">'+(hasActual?'Ties are broken by closest tiebreaker answer. Actual: <b>'+esc(fmt(actual))+'</b>.':'Tied records stay tied until the actual tiebreaker is entered.')+'</div></div><div class="pill">'+decidedCount+'/'+d.scored.length+' decided</div></div>';
    h+='<table class="table" style="min-width:720px;margin-top:10px"><thead><tr><th>Place</th><th>Player</th><th>Correct</th><th>Pick Streak</th><th>Tiebreaker</th>'+(isFinal?'<th>Points</th>':'')+'</tr></thead><tbody>';
    h+=out.rows.map(r=>{
      const place=r.rank>=999?'—':'#'+r.rank;
      const correct=isFinal?r.correct+'/'+r.questionCount:r.correct+'/'+r.decided;
      const tieNote=r.exactTbTie?'<div class="mini" style="color:var(--gold)">Exact TB tie</div>':'';
      return '<tr><td><b>'+place+'</b></td><td><button onclick="openPlayerProfile(\''+r.id+'\')" style="border:0;background:transparent;color:inherit;padding:0;font:inherit;font-weight:950;cursor:pointer;text-decoration:underline;text-decoration-color:rgba(56,189,248,.45);text-underline-offset:3px">'+esc(r.name)+'</button></td><td><b>'+correct+'</b></td><td><b>'+streakLabel(r.streak)+'</b></td><td><b>'+esc(r.tb.label)+'</b>'+tieNote+'</td>'+(isFinal?'<td><b>'+fmt(r.points)+'</b></td>':'')+'</tr>';
    }).join('');
    h+='</tbody></table><div class="mini" style="margin-top:8px">Pick Streak = consecutive correct picks ending with the most recently decided result.</div></div>';
    return h;
  }

  async function installWeeklyStandings(){
    const box=el('leagueBox');
    if(!box||box.closest('.hidden')) return;
    try{
      const id=await selectedWeekId();
      if(!id) return;
      const d=await loadStandingData(id);
      const cards=[...box.querySelectorAll('.card')];
      cards.forEach(card=>{
        const eyebrow=card.querySelector('.eyebrow')?.textContent?.trim();
        if(eyebrow==='LIVE WEEK STATS'||eyebrow==='WEEK STATS'||eyebrow==='WEEKLY STANDINGS') card.remove();
      });
      const selector=box.querySelector('select[onchange*="setLeagueHistoryWeek"]')?.closest('.card');
      const anchor=selector?.nextElementSibling;
      const temp=document.createElement('div');
      temp.innerHTML=standingsHtml(d);
      const node=temp.firstElementChild;
      if(anchor) anchor.insertAdjacentElement('afterend',node);
      else box.insertAdjacentElement('afterbegin',node);
    }catch(e){ console.debug('Weekly standings enhancement skipped',e); }
  }

  const baseRenderLeague=window.renderLeague;
  if(baseRenderLeague){
    window.renderLeague=async function(){
      const v=await baseRenderLeague.apply(this,arguments);
      await installWeeklyStandings();
      return v;
    };
  }

  const baseSaveLiveTiebreaker=window.saveLiveTiebreaker;
  if(baseSaveLiveTiebreaker){
    window.saveLiveTiebreaker=async function(){
      const v=await baseSaveLiveTiebreaker.apply(this,arguments);
      if(!el('league')?.classList.contains('hidden')) await renderLeague();
      return v;
    };
  }

  // Quiet tiebreaker watcher: no visual rerender unless the actual TB changes.
  let watchedWeekId=null;
  let watchedTb='__unset__';
  let watchBusy=false;
  setInterval(async()=>{
    if(watchBusy||!session||document.visibilityState==='hidden'||el('league')?.classList.contains('hidden')) return;
    const id=await selectedWeekId();
    if(!id) return;
    watchBusy=true;
    try{
      const rows=await db('weeks?id=eq.'+id+'&select=id,tiebreaker_result&limit=1');
      const w=rows?.[0]; if(!w) return;
      const key=JSON.stringify(w.tiebreaker_result);
      if(watchedWeekId!==id){ watchedWeekId=id; watchedTb=key; return; }
      if(watchedTb!==key){
        watchedTb=key;
        const y=window.scrollY;
        await renderLeague();
        requestAnimationFrame(()=>window.scrollTo(0,y));
      }
    }catch(e){ console.debug('Tiebreaker change check skipped',e); }
    finally{ watchBusy=false; }
  },5000);
})();
