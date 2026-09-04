// League history, historical pick grids, clickable player profiles, and tiebreaker rows.
(() => {
  let selectedLeagueWeekId = null;
  let historyWeekId = null;
  let selectedPlayerId = null;
  let playerReturnPage = 'home';

  const num = v => Number(v || 0);
  const fmt = v => num(v).toFixed(1).replace(/\.0$/, '');
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const decided = q => q.result !== null && q.result !== undefined;
  const knownFirstNames = {
    jacksechler:'Jack', cadechristy:'Cade', brodyravenstahl:'Brody', chasecarulli:'Chase',
    evanlewis:'Evan', jacksongraham:'Jackson', klayfunovits:'Klay', lincolnconstant:'Lincoln'
  };

  function prettyName(p){
    const u=String(p?.username||'').toLowerCase();
    if(knownFirstNames[u]) return knownFirstNames[u];
    const raw=String(p?.display_name||p?.username||'Player').trim();
    return raw.includes(' ') ? raw.split(/\s+/)[0] : raw;
  }

  function fullName(p){ return p?.display_name || p?.username || 'Player'; }

  function profileButton(id,name,extra=''){
    return '<button onclick="openPlayerProfile(\''+id+'\')" '+extra+' style="border:0;background:transparent;color:inherit;padding:0;font:inherit;font-weight:950;cursor:pointer;text-decoration:underline;text-decoration-color:rgba(56,189,248,.45);text-underline-offset:3px">'+esc(name)+'</button>';
  }

  async function allProfiles(){
    return await db('profiles?select=id,display_name,username,role&order=display_name.asc');
  }

  async function availableWeeks(){
    const rows=await db('weeks?select=*&order=number.desc');
    return rows.filter(w => w.status==='published' || (w.is_active && (w.status==='published' || Date.now()>=new Date(w.lock_at).getTime() || !!w.auto_locked_at)));
  }

  async function loadWeekBundle(weekId){
    const [weekRows,profiles,qs,subs,picks,scores] = await Promise.all([
      db('weeks?id=eq.'+weekId+'&select=*&limit=1'),
      allProfiles(),
      db('questions?week_id=eq.'+weekId+'&select=*&order=position.asc'),
      db('submissions?week_id=eq.'+weekId+'&select=*'),
      db('picks?week_id=eq.'+weekId+'&select=*'),
      db('week_scores?week_id=eq.'+weekId+'&select=*')
    ]);
    const w=weekRows[0];
    const pmap=Object.fromEntries(profiles.map(p=>[p.id,p]));
    const users=subs.map(s=>s.user_id).filter(id=>pmap[id]).sort((a,b)=>prettyName(pmap[a]).localeCompare(prettyName(pmap[b])));
    const pickMap={};
    picks.forEach(p=>{ (pickMap[p.user_id]??={})[p.question_id]=p.answer; });
    const subMap=Object.fromEntries(subs.map(s=>[s.user_id,s]));
    const scoreMap=Object.fromEntries(scores.map(s=>[s.user_id,s]));
    return {week:w,profiles,pmap,questions:qs,subs,picks,scores,users,pickMap,subMap,scoreMap};
  }

  function bonusText(s){
    if(!s) return '—';
    const parts=[];
    if(num(s.perfect_bonus)) parts.push('Perfect +'+fmt(s.perfect_bonus));
    if(num(s.unicorn_bonus)) parts.push('Unicorn +'+fmt(s.unicorn_bonus));
    if(num(s.upset_bonus)) parts.push('Upset +'+fmt(s.upset_bonus));
    if(num(s.streak_bonus)) parts.push('Streak +'+fmt(s.streak_bonus));
    if(num(s.cold_bonus)) parts.push('Cold '+fmt(s.cold_bonus));
    return parts.join(' · ') || '—';
  }

  function weekScoreSummary(d){
    if(!d.scores.length){
      const done=d.questions.filter(q=>q.counts_for_score!==false&&decided(q));
      if(!done.length) return '<div class="card"><div class="muted">No results have been entered yet.</div></div>';
      const rows=d.users.map(id=>({id,correct:done.filter(q=>same(d.pickMap[id]?.[q.id],q.result)).length})).sort((a,b)=>b.correct-a.correct||prettyName(d.pmap[a.id]).localeCompare(prettyName(d.pmap[b.id])));
      return '<div class="card"><div class="eyebrow">LIVE WEEK STATS</div><h2 style="margin:4px 0">'+done.length+'/'+d.questions.filter(q=>q.counts_for_score!==false).length+' decided</h2>'+rows.map((r,i)=>'<div class="row" style="padding:9px 0;border-bottom:1px solid var(--line)"><div><b>#'+(i+1)+' '+profileButton(r.id,prettyName(d.pmap[r.id]))+'</b></div><b>'+r.correct+'/'+done.length+'</b></div>').join('')+'</div>';
    }
    const rows=[...d.scores].sort((a,b)=>num(a.placement)-num(b.placement)||num(b.total_points)-num(a.total_points));
    return '<div class="card tablewrap"><div class="eyebrow">WEEK STATS</div><h2 style="margin:4px 0 12px">Final Results</h2><table class="table" style="min-width:920px"><thead><tr><th>Finish</th><th>Player</th><th>Correct</th><th>Pick %</th><th>Placement Pts</th><th>Bonuses</th><th>Unicorns</th><th>Upsets</th><th>Opening Streak</th><th>Total</th></tr></thead><tbody>'+rows.map(s=>{
      const p=d.pmap[s.user_id];
      const pc=s.pick_percentage!=null?num(s.pick_percentage):(num(s.question_count)?num(s.correct_count)/num(s.question_count)*100:0);
      return '<tr><td><b>#'+num(s.placement)+'</b></td><td>'+profileButton(s.user_id,prettyName(p))+'</td><td>'+num(s.correct_count)+'/'+num(s.question_count)+'</td><td>'+pc.toFixed(1)+'%</td><td>'+fmt(s.placement_points)+'</td><td>'+esc(bonusText(s))+'</td><td>'+num(s.unicorn_count)+'</td><td>'+num(s.upset_count)+'</td><td>'+num(s.opening_streak)+'</td><td><b>'+fmt(s.total_points)+'</b></td></tr>';
    }).join('')+'</tbody></table></div>';
  }

  function fullGridHtml(d){
    if(!d.users.length) return '<div class="card muted">No submitted picks for this week.</div>';
    const qs=[...d.questions].sort((a,b)=>num(a.position)-num(b.position));
    let h='<div class="card tablewrap" style="padding:0"><table class="table" style="min-width:1100px"><thead><tr><th style="position:sticky;left:0;background:var(--panel);z-index:3">Question</th>'+d.users.map(id=>'<th>'+profileButton(id,prettyName(d.pmap[id]))+'</th>').join('')+'</tr></thead><tbody>';
    qs.forEach(q=>{
      const done=decided(q);
      const result=done?'<div class="mini good">✓ '+esc(typeof q.result==='string'?q.result:JSON.stringify(q.result))+(q.result_order?' · Result #'+q.result_order:'')+'</div>':'';
      h+='<tr><td style="position:sticky;left:0;background:var(--panel);z-index:2"><b>'+esc(q.prompt)+'</b>'+result+'</td>';
      d.users.forEach(id=>{
        const a=d.pickMap[id]?.[q.id];
        let style='';
        if(done){ const ok=same(a,q.result); style=ok?'background:#0b2a25;color:var(--green);font-weight:900':'background:#32131b;color:var(--red);font-weight:900'; }
        h+='<td style="'+style+'">'+(done?(same(a,q.result)?'✓ ':'✕ '):'')+esc(a??'—')+'</td>';
      });
      h+='</tr>';
    });
    const actual=d.week?.tiebreaker_result;
    h+='<tr><td style="position:sticky;left:0;background:var(--panel);z-index:2"><b>Tiebreaker</b><div class="mini">'+esc(d.week?.tiebreaker_prompt||'Tiebreaker')+(actual!=null?' · Actual: '+esc(actual):'')+'</div></td>'+d.users.map(id=>'<td style="font-weight:950;color:var(--accent)">'+esc(d.subMap[id]?.tiebreaker_answer??'—')+'</td>').join('')+'</tr>';
    h+='</tbody></table></div>';
    return h;
  }

  function screenshotGridHtml(d){
    if(!d.users.length) return '';
    const qs=d.questions.filter(q=>q.counts_for_score!==false).sort((a,b)=>num(a.position)-num(b.position));
    const users=d.users.slice(0,8);
    let h='<div class="card" style="padding:12px;overflow:hidden"><div style="display:flex;justify-content:space-between;align-items:flex-end;gap:8px;margin-bottom:9px"><div><div class="eyebrow">SCREENSHOT GRID</div><div style="font-size:17px;font-weight:950;margin-top:2px">'+esc(d.week?.name||'Week')+' Picks</div></div><div class="mini" style="text-align:right">Final row = TB</div></div>';
    h+='<div style="display:grid;grid-template-columns:repeat('+users.length+',minmax(0,1fr));gap:3px;width:100%">';
    users.forEach(id=>{ const name=prettyName(d.pmap[id]); const size=name.length>=7?'7.5':name.length>=6?'8.5':'9.5'; h+='<div onclick="openPlayerProfile(\''+id+'\')" style="text-align:center;font-size:'+size+'px;font-weight:950;padding:4px 0 5px;white-space:nowrap;overflow:hidden;cursor:pointer">'+esc(name)+'</div>'; });
    qs.forEach(q=>{
      users.forEach(id=>{
        const a=d.pickMap[id]?.[q.id]; let bg='#223247',border='#304965',symbol='';
        if(decided(q)){ const ok=same(a,q.result); bg=ok?'#0f513f':'#5a1f2b'; border=ok?'#2f9f7b':'#b94a61'; symbol=ok?'✓':'×'; }
        h+='<div style="height:19px;border-radius:5px;background:'+bg+';border:1px solid '+border+';display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:950;color:#fff">'+symbol+'</div>';
      });
    });
    users.forEach(id=>{ const tb=d.subMap[id]?.tiebreaker_answer; h+='<div style="height:22px;border-radius:5px;background:#102b41;border:1px solid #245271;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:950;color:var(--accent)">'+esc(tb??'—')+'</div>'; });
    h+='</div><div class="mini" style="margin-top:8px;text-align:center">Green = right · Red = wrong · Gray = undecided · Blue final row = tiebreaker</div></div>';
    return h;
  }

  function weekSelectorHtml(weeks,value,onchange){
    return '<div class="card"><label style="margin-top:0">Week</label><select onchange="'+onchange+'(this.value)">'+weeks.map(w=>'<option value="'+w.id+'" '+(w.id===value?'selected':'')+'>'+esc(w.name||('Week '+w.number))+(w.status==='published'?' · Final':' · Live')+'</option>').join('')+'</select></div>';
  }

  window.setLeagueHistoryWeek=async function(id){ selectedLeagueWeekId=id; await renderLeague(); };

  window.renderLeague=async function(){
    const box=el('leagueBox'); if(!box) return;
    box.innerHTML='<div class="card muted">Loading league picks…</div>';
    try{
      const weeks=await availableWeeks();
      const activeId=week?.id||null;
      if(!selectedLeagueWeekId) selectedLeagueWeekId=activeId || weeks[0]?.id || null;
      if(selectedLeagueWeekId && !weeks.some(w=>w.id===selectedLeagueWeekId) && selectedLeagueWeekId!==activeId) selectedLeagueWeekId=weeks[0]?.id||activeId;

      let h='';
      const options=[...weeks];
      if(week && !options.some(w=>w.id===week.id)) options.unshift(week);
      if(options.length) h+=weekSelectorHtml(options,selectedLeagueWeekId,'setLeagueHistoryWeek');

      if(selectedLeagueWeekId===activeId && week && !locked()){
        h+='<div class="notice"><b>🔒 Everyone\'s '+esc(week.name)+' picks stay private until this week locks.</b><div class="muted">You can still use the Week menu above to view past published weeks.</div></div>';
        box.innerHTML=h; return;
      }
      if(!selectedLeagueWeekId){ box.innerHTML=h+'<div class="card muted">No viewable weeks yet.</div>'; return; }
      const d=await loadWeekBundle(selectedLeagueWeekId);
      h+='<div class="card"><div class="eyebrow">'+(d.week?.status==='published'?'FINAL WEEK':'LIVE WEEK')+'</div><div class="row" style="align-items:flex-end;gap:12px;flex-wrap:wrap"><div><h2 style="margin:4px 0">'+esc(d.week?.name||'Week')+'</h2><div class="muted">Every pick, result, tiebreaker, and weekly stat in one place.</div></div><button class="btn secondary" onclick="openHistoryWeek(\''+selectedLeagueWeekId+'\')">Open Full Week History</button></div></div>';
      h+=weekScoreSummary(d)+fullGridHtml(d)+screenshotGridHtml(d);
      box.innerHTML=h;
    }catch(e){ console.error(e); box.innerHTML='<div class="notice">Could not load league history.</div>'; }
  };

  function ensurePages(){
    const main=document.querySelector('main.wrap'); if(!main) return;
    if(!el('history')) main.insertAdjacentHTML('beforeend','<section id="history" class="page hidden"><div class="hero"><div><div class="eyebrow">LEAGUE ARCHIVE</div><h1>History</h1><div class="muted">Go back to every finished week, grid, pick, tiebreaker and stat.</div></div></div><div id="historyBox"></div></section>');
    if(!el('player')) main.insertAdjacentHTML('beforeend','<section id="player" class="page hidden"><div id="playerBox"></div></section>');
    const nav=document.querySelector('nav');
    if(nav && !nav.querySelector('[data-page="history"]')){
      const stats=nav.querySelector('[data-page="stats"]');
      const b=document.createElement('button'); b.className='navbtn'; b.dataset.page='history'; b.textContent='History'; b.onclick=()=>showPage('history',b);
      if(stats?.nextSibling) nav.insertBefore(b,stats.nextSibling); else nav.appendChild(b);
    }
  }

  window.setHistoryWeek=async function(id){ historyWeekId=id; await renderHistory(); };
  window.openHistoryWeek=function(id){ historyWeekId=id; const b=document.querySelector('[data-page="history"]'); showPage('history',b); };

  window.renderHistory=async function(){
    ensurePages(); const box=el('historyBox'); if(!box) return; box.innerHTML='<div class="card muted">Loading history…</div>';
    try{
      const weeks=(await db('weeks?status=eq.published&select=*&order=number.desc'));
      if(!weeks.length){ box.innerHTML='<div class="card muted">No published weeks yet.</div>'; return; }
      if(!historyWeekId || !weeks.some(w=>w.id===historyWeekId)) historyWeekId=weeks[0].id;
      const d=await loadWeekBundle(historyWeekId);
      box.innerHTML=weekSelectorHtml(weeks,historyWeekId,'setHistoryWeek')+
        '<div class="card"><div class="eyebrow">WEEK ARCHIVE</div><h2 style="margin:4px 0">'+esc(d.week?.name||'Week')+'</h2><div class="muted">Published '+(d.week?.published_at?esc(new Date(d.week.published_at).toLocaleString()):'')+'</div></div>'+
        weekScoreSummary(d)+fullGridHtml(d)+screenshotGridHtml(d);
    }catch(e){ console.error(e); box.innerHTML='<div class="notice">Could not load week history.</div>'; }
  };

  function seasonRank(scores,userId){
    const totals={}; scores.forEach(s=>totals[s.user_id]=(totals[s.user_id]||0)+num(s.total_points));
    const ids=Object.keys(totals).sort((a,b)=>totals[b]-totals[a]); return {rank:ids.indexOf(userId)+1,total:totals[userId]||0};
  }

  window.openPlayerProfile=function(id){
    const active=[...document.querySelectorAll('.page')].find(x=>!x.classList.contains('hidden'))?.id;
    if(active && active!=='player') playerReturnPage=active;
    selectedPlayerId=id; ensurePages(); showPage('player',null); renderPlayerProfile(id);
  };
  window.returnFromPlayerProfile=function(){ const b=document.querySelector('[data-page="'+playerReturnPage+'"]'); showPage(playerReturnPage,b||null); };

  window.renderPlayerProfile=async function(id=selectedPlayerId){
    ensurePages(); const box=el('playerBox'); if(!box||!id) return; box.innerHTML='<div class="card muted">Loading player…</div>';
    try{
      const [profiles,weeks,scores]=await Promise.all([
        allProfiles(),
        db('weeks?status=eq.published&select=id,number,name,published_at&order=number.asc'),
        db('week_scores?select=*')
      ]);
      const p=profiles.find(x=>x.id===id); if(!p){ box.innerHTML='<div class="notice">Player not found.</div>'; return; }
      const pubIds=new Set(weeks.map(w=>w.id)); const allScores=scores.filter(s=>pubIds.has(s.week_id)); const ps=allScores.filter(s=>s.user_id===id);
      const sr=seasonRank(allScores,id); const correct=ps.reduce((a,s)=>a+num(s.correct_count),0), q=ps.reduce((a,s)=>a+num(s.question_count),0);
      const wins=ps.filter(s=>num(s.placement)===1).length, perfect=ps.filter(s=>num(s.question_count)>0&&num(s.correct_count)===num(s.question_count)).length;
      const unicorns=ps.reduce((a,s)=>a+num(s.unicorn_count),0), upsets=ps.reduce((a,s)=>a+num(s.upset_count),0), streak=Math.max(0,...ps.map(s=>num(s.opening_streak)));
      const pct=q?correct/q*100:0;
      let h='<div class="hero"><div><div class="eyebrow">PLAYER PROFILE</div><h1>'+esc(prettyName(p))+'</h1><div class="muted">@'+esc(p.username||fullName(p))+'</div></div><button class="btn secondary" onclick="returnFromPlayerProfile()">← Back</button></div>';
      h+='<div class="grid three"><div class="card"><div class="muted">Season Rank</div><div class="big">'+(sr.rank?'#'+sr.rank:'—')+'</div></div><div class="card"><div class="muted">Season Points</div><div class="big">'+fmt(sr.total)+'</div></div><div class="card"><div class="muted">Pick %</div><div class="big">'+pct.toFixed(1)+'%</div></div><div class="card"><div class="muted">Correct Picks</div><div class="big">'+correct+'/'+q+'</div></div><div class="card"><div class="muted">Weekly Wins</div><div class="big">'+wins+'</div></div><div class="card"><div class="muted">Perfect Weeks</div><div class="big">'+perfect+'</div></div><div class="card"><div class="muted">Unicorns</div><div class="big">'+unicorns+'</div></div><div class="card"><div class="muted">Upsets</div><div class="big">'+upsets+'</div></div><div class="card"><div class="muted">Longest Post-Perfect Streak</div><div class="big">'+streak+'</div></div></div>';
      h+='<div class="card tablewrap"><div class="eyebrow">WEEK-BY-WEEK</div><h2 style="margin:4px 0 12px">Season Log</h2><table class="table"><thead><tr><th>Week</th><th>Finish</th><th>Correct</th><th>Pick %</th><th>Bonuses</th><th>Points</th><th></th></tr></thead><tbody>'+weeks.map(w=>{
        const s=ps.find(x=>x.week_id===w.id); if(!s) return '';
        const pc=s.pick_percentage!=null?num(s.pick_percentage):(num(s.question_count)?num(s.correct_count)/num(s.question_count)*100:0);
        return '<tr><td><b>'+esc(w.name||('Week '+w.number))+'</b></td><td>#'+num(s.placement)+'</td><td>'+num(s.correct_count)+'/'+num(s.question_count)+'</td><td>'+pc.toFixed(1)+'%</td><td>'+esc(bonusText(s))+'</td><td><b>'+fmt(s.total_points)+'</b></td><td><button class="btn secondary" style="padding:7px 9px" onclick="openHistoryWeek(\''+w.id+'\')">View Week</button></td></tr>';
      }).join('')+'</tbody></table></div>';
      box.innerHTML=h;
    }catch(e){ console.error(e); box.innerHTML='<div class="notice">Could not load player profile.</div>'; }
  };

  async function playerDirectoryHtml(){
    const profiles=await allProfiles();
    return '<div class="card" id="playerDirectoryCard"><div class="eyebrow">PLAYER ACCOUNTS</div><h2 style="margin:4px 0 10px">League Players</h2><div style="display:flex;flex-wrap:wrap;gap:8px">'+profiles.map(p=>'<button class="btn secondary" style="padding:8px 11px" onclick="openPlayerProfile(\''+p.id+'\')">'+esc(prettyName(p))+'</button>').join('')+'</div></div>';
  }

  const beforeHome=window.renderHome;
  window.renderHome=function(){
    beforeHome();
    const home=el('home'); if(!home) return;
    el('playerDirectoryCard')?.remove();
    playerDirectoryHtml().then(html=>{ el('playerDirectoryCard')?.remove(); home.insertAdjacentHTML('beforeend',html); }).catch(()=>{});
  };

  async function decoratePlayerNames(containerId){
    const box=el(containerId); if(!box) return;
    const profiles=await allProfiles();
    box.querySelectorAll('b,span,div,td').forEach(node=>{
      if(node.children.length) return;
      const txt=(node.textContent||'').trim();
      const p=profiles.find(x=>txt===fullName(x)||txt===prettyName(x));
      if(!p || node.dataset.playerLinked) return;
      node.dataset.playerLinked='1'; node.style.cursor='pointer'; node.style.textDecoration='underline'; node.style.textDecorationColor='rgba(56,189,248,.45)'; node.style.textUnderlineOffset='3px';
      node.onclick=()=>openPlayerProfile(p.id);
    });
  }

  const beforeStandings=window.renderStandings;
  window.renderStandings=async function(){ await beforeStandings(); decoratePlayerNames('standingsBox').catch(()=>{}); };
  const beforeStats=window.renderStats;
  window.renderStats=async function(){ await beforeStats(); decoratePlayerNames('statsBox').catch(()=>{}); };

  const beforeShowPage=window.showPage;
  window.showPage=function(id,btn){
    ensurePages(); beforeShowPage(id,btn);
    if(id==='history') renderHistory();
    if(id==='player' && selectedPlayerId) renderPlayerProfile(selectedPlayerId);
  };

  ensurePages();
})();
