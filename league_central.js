// League Central: read-only regular-season story, projections, rivalries and records.
(() => {
  const $ = id => document.getElementById(id);
  const esc2 = v => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&#39;'}[c]));
  const fmt = v => Number(v||0).toFixed(1).replace(/\.0$/,'');
  const css = document.createElement('style');
  css.textContent = `
  .lc-shell{margin:18px 0 24px}.lc-kicker{color:#e9bd70;letter-spacing:.13em;font-size:11px;font-weight:900;text-transform:uppercase}
  .lc-header{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 14px}.lc-header h2{margin:3px 0;font-size:27px}
  .lc-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.lc-tile{background:linear-gradient(155deg,#1a2c46,#101d31);border:1px solid #344861;border-radius:15px;padding:17px;min-width:0}
  .lc-tile strong{display:block;font-size:26px;margin:7px 0;color:#fff;overflow-wrap:anywhere}.lc-tile small{color:#aebfd5}.lc-tile.gold{border-color:#98753d;background:linear-gradient(135deg,#3b3024,#111d30)}.lc-tile.gold strong{color:#f5ca77}
  .lc-section{margin-top:14px;background:#111d30;border:1px solid #2b4160;border-radius:15px;padding:17px}.lc-section h3{margin:0 0 12px;font-size:18px}
  .lc-list{display:grid;gap:9px}.lc-item{display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid #2b4160;align-items:center}.lc-item:last-child{border-bottom:0}
  .lc-sub{font-size:12px;color:#aebfd5;margin-top:4px}.lc-tag{font-size:11px;color:#e9bd70;font-weight:800;letter-spacing:.04em}
  .lc-split{display:grid;grid-template-columns:1.15fr 1fr;gap:14px}.lc-action{border:1px solid #bc9253;border-radius:10px;background:#332c25;color:#f6ca78;padding:9px 12px;cursor:pointer;font-weight:800}
  .lc-bar{height:7px;background:#293a51;border-radius:10px;overflow:hidden;margin-top:6px}.lc-bar span{display:block;height:100%;background:#e8b965}
  .lc-crown{border-color:#97733c;background:linear-gradient(130deg,#302b28,#14223a 75%)}
  .lc-crown-top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
  .lc-crown-top h3{font-size:21px;margin:0;color:#f2c77b}.lc-crown-pill{padding:5px 8px;border:1px solid #97733c;border-radius:6px;font-weight:850;font-size:10px;letter-spacing:.07em;color:#f2cc83}
  .lc-crown-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
  .lc-crown-row{background:#101c2e;border:1px solid #35465c;padding:12px;border-radius:10px;min-width:0}
  .lc-crown-row.mine{border-color:#e0b65d;background:#362e26}
  .lc-crown-line{display:flex;align-items:center;justify-content:space-between;gap:10px}
  .lc-crown-line b{overflow-wrap:anywhere}.lc-crown-rate{font-size:20px;color:#f3ce83;font-weight:950;white-space:nowrap;font-variant-numeric:tabular-nums}
  .lc-crown-note{font-size:12px;line-height:1.55;color:#b8c7dc;margin:13px 0 0}
  @media(max-width:650px){.lc-crown-grid{grid-template-columns:1fr}.lc-crown-row{padding:10px}}
  @media(max-width:650px){.lc-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.lc-split{grid-template-columns:1fr}.lc-tile{padding:13px}.lc-tile strong{font-size:22px}}
  `;
  document.head.append(css);
  let request=0, cache=null;
  const isLogged=()=>!!session?.user?.id && !$('app')?.classList.contains('hidden');
  async function getData(){
    const [weeks,scores,people]=await Promise.all([
      db('weeks?select=id,name,number,phase,status&phase=eq.regular&order=number.asc'),
      db('week_scores?select=week_id,user_id,total_points,correct_count,question_count,placement,weeks!inner(phase)&weeks.phase=eq.regular'),
      db('profiles?select=id,display_name')
    ]);
    const names=Object.fromEntries(people.map(p=>[p.id,p.display_name||'Member']));
    const scoredWeeks=weeks.filter(w=>scores.some(s=>s.week_id===w.id));
    const byWeek=new Map(scoredWeeks.map(w=>[w.id,scores.filter(s=>s.week_id===w.id)]));
    const totals=Object.fromEntries(people.map(p=>[p.id,0]));
    const correct=Object.fromEntries(people.map(p=>[p.id,0]));
    const wins=Object.fromEntries(people.map(p=>[p.id,0]));
    scores.forEach(s=>{
      totals[s.user_id]=(totals[s.user_id]||0)+Number(s.total_points||0);
      correct[s.user_id]=(correct[s.user_id]||0)+Number(s.correct_count||0);
      if(Number(s.placement)===1)wins[s.user_id]=(wins[s.user_id]||0)+1;
    });
    const rank=people.map(p=>({id:p.id,name:names[p.id],total:totals[p.id],correct:correct[p.id],wins:wins[p.id]}))
      .sort((a,b)=>b.total-a.total||b.correct-a.correct||b.wins-a.wins||a.name.localeCompare(b.name));
    // The postseason calendar has 20 regular-season cards, even before they are created.
    const regularWeekCount=20;
    const remainingWeeks=Math.max(0,regularWeekCount-scoredWeeks.length);
    const forecast=window.ChampionshipOddsModel?.estimateRegular({
      players:rank,history:scores,remainingWeeks,samples:3000,
      seedKey:JSON.stringify([week?.season_id||'2026',scores.map(x=>[x.week_id,x.user_id,x.total_points]),remainingWeeks])
    })||{kind:'unavailable',reason:'Championship forecast is loading.'};
    let playoffForecast=null;
    if(window.Postseason?.load&&window.PlayoffAdvancement?.getChampionship){
      try {
        const playoffState=await window.Postseason.load();
        if(['live','complete'].includes(playoffState?.settings?.status))
          playoffForecast=await window.PlayoffAdvancement.getChampionship(playoffState);
      } catch(e) { console.debug('Playoff home forecast temporarily unavailable',e); }
    }
    return {weeks,scoredWeeks,byWeek,names,rank,scores,forecast,playoffForecast,regularWeekCount};
  }
  function probabilityModel(d){
    // Deterministic bootstrap of remaining regular-season cards using each player's historical weekly scores.
    // Illustrative seed estimates, not promises or championship probabilities.
    const remaining=Math.max(0, (d.weeks.length||0)-d.scoredWeeks.length);
    const all=d.rank.map(p=>({id:p.id,history:d.scoredWeeks.map(w=>d.byWeek.get(w.id)?.find(s=>s.user_id===p.id)?.total_points).filter(v=>v!=null).map(Number)}));
    if(!remaining || d.scoredWeeks.length<3 || all.some(p=>p.history.length<2)) return null;
    const samples=1200, counts=Object.fromEntries(d.rank.map(p=>[p.id,Array(d.rank.length).fill(0)]));
    let seed=91763;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    for(let k=0;k<samples;k++){
      const projected=d.rank.map(p=>({id:p.id,total:p.total}));
      for(let w=0;w<remaining;w++)for(const p of projected){const history=all.find(a=>a.id===p.id).history;p.total+=history[Math.floor(rnd()*history.length)];}
      projected.sort((a,b)=>b.total-a.total||a.id.localeCompare(b.id));
      projected.forEach((p,i)=>counts[p.id][i]++);
    }
    return {remaining,counts,samples};
  }
  const item=(left,right,sub='')=>'<div class="lc-item"><div><b>'+esc2(left)+'</b>'+(sub?'<div class="lc-sub">'+esc2(sub)+'</div>':'')+'</div><strong>'+esc2(right)+'</strong></div>';
  function crownHtml(d){
    const playoff=!!d.playoffForecast;
    const f=d.playoffForecast||d.forecast;
    let html='<section class="lc-section lc-crown"><div class="lc-crown-top"><div><div class="lc-kicker">THE ROAD TO THE CROWN</div><h3>🏆 Chance to Win It All</h3></div><span class="lc-crown-pill">'+(playoff?(f.kind==='official'?'OFFICIAL CHAMPION':'LIVE PLAYOFF ODDS'):'SEASON FORECAST')+'</span></div>';
    if(f.kind!=='estimate'&&f.kind!=='official')return html+'<p class="lc-crown-note">'+esc2(f.reason||'Waiting for league data.')+'</p></section>';
    const ranked=d.rank.slice().sort((a,b)=>f.titleOdds[b.id]-f.titleOdds[a.id]||a.name.localeCompare(b.name));
    html+='<div class="lc-crown-grid">'+ranked.map((x,i)=>{
      const pct=Number(f.titleOdds[x.id]||0);
      return '<div class="lc-crown-row'+(x.id===session?.user?.id?' mine':'')+'"><div class="lc-crown-line"><b>#'+(i+1)+' '+esc2(x.name)+(x.id===session?.user?.id?' · YOU':'')+'</b><strong class="lc-crown-rate">'+pct.toFixed(f.kind==='official'?0:1)+'%</strong></div><div class="lc-bar"><span style="width:'+Math.max(0,Math.min(100,pct))+'%"></span></div></div>';
    }).join('')+'</div>';
    if(f.kind==='official')html+='<p class="lc-crown-note">The championship is official. The winner has a 100% chance because the title has been awarded.</p>';
    else if(playoff)html+='<p class="lc-crown-note"><strong>'+f.samples.toLocaleString()+' simulated playoff finishes.</strong> Based on the current playoff totals, completed results, locked picks when available, and the remaining elimination rounds. Future results are estimates.</p>';
    else html+='<p class="lc-crown-note"><strong>'+f.samples.toLocaleString()+' simulated seasons.</strong> All eight reach the playoffs. Each simulation projects the remaining '+f.weeksRemaining+' regular-season card'+(f.weeksRemaining===1?'':'s')+', awards seed bonuses (10/8/7/5/4/3/2/0), then plays out the 8 → 6 → 4 → 2 → 1 championship. Future games and pick accuracy are estimates.</p>';
    return html+'</section>';
  }
  function render(d){
    const root=$('leagueCentral');if(!root)return;
    if(!d.scores.length){
      root.innerHTML='<div class="lc-shell"><div class="lc-header"><div><div class="lc-kicker">2026–27 • Regular season</div><h2>LEAGUE CENTRAL</h2></div><button class="lc-action" id="lcRefresh">↻ Refresh</button></div>'+crownHtml(d)+'<div class="lc-section"><h3>The race is beginning</h3><p class="muted">Standings, headlines and rivalries appear as regular-season weeks are published. Championship odds are available now.</p></div></div>';
      $('lcRefresh')?.addEventListener('click',()=>load(true));return;
    }
    const me=d.rank.find(p=>p.id===session.user.id);
    const leader=d.rank[0];
    const last=d.scoredWeeks.at(-1);
    const latest=last?d.byWeek.get(last.id).slice().sort((a,b)=>Number(b.total_points)-Number(a.total_points)):[];
    const top=latest[0];
    const topScore=Number(top?.total_points||0);
    const winners=latest.filter(s=>Number(s.total_points)===topScore).map(s=>d.names[s.user_id]||'Member');
    const myLast=latest.find(s=>s.user_id===session.user.id);
    const myWeeklyRank=myLast?1+latest.filter(s=>Number(s.total_points)>Number(myLast.total_points)).length:null;
    const oldTotals=Object.fromEntries(d.rank.map(p=>[p.id,p.total-Number(d.byWeek.get(last.id)?.find(s=>s.user_id===p.id)?.total_points||0)]));
    const oldRank=d.rank.slice().sort((a,b)=>oldTotals[b.id]-oldTotals[a.id]||a.name.localeCompare(b.name));
    const movements=d.rank.map((p,i)=>({name:p.name,delta:oldRank.findIndex(x=>x.id===p.id)-i})).sort((a,b)=>b.delta-a.delta);
    const f=d.forecast;
    const p=f?.kind==='estimate'?{
      remaining:f.weeksRemaining,samples:f.samples,
      counts:Object.fromEntries(Object.entries(f.seedOdds).map(([id,chances])=>[id,chances.map(x=>x*f.samples/100)]))
    }:probabilityModel(d);
    const remaining=Math.max(0,d.regularWeekCount-d.scoredWeeks.length);
    let html='<div class="lc-shell"><div class="lc-header"><div><div class="lc-kicker">2026–27 • Regular season</div><h2>LEAGUE CENTRAL</h2><div class="muted">The road to the postseason starts here.</div></div><button class="lc-action" id="lcRefresh">↻ Refresh</button></div>';
    html+='<div class="lc-grid"><div class="lc-tile gold"><small>Championship race leader</small><strong>'+esc2(leader.name)+'</strong><small>'+fmt(leader.total)+' season points</small></div>';
    html+='<div class="lc-tile"><small>Your current seed</small><strong>#'+(d.rank.findIndex(x=>x.id===me?.id)+1)+'</strong><small>'+fmt(me?.total)+' points · '+(me?.total===leader.total?'Tied for the lead':fmt(leader.total-(me?.total||0))+' behind leader')+'</small></div>';
    html+='<div class="lc-tile"><small>Regular-season cards</small><strong>'+d.scoredWeeks.length+' / '+d.regularWeekCount+'</strong><small>'+remaining+' card'+(remaining===1?'':'s')+' remaining</small></div></div>';
    html+=crownHtml(d);
    html+='<div class="lc-split"><section class="lc-section"><h3>🏆 The Championship Race</h3><div class="lc-list">'+d.rank.map((x,i)=>item('#'+(i+1)+' '+x.name,fmt(x.total)+' pts',x.id===session.user.id?'Your position':'')).join('')+'</div></section>';
    html+='<section class="lc-section"><h3>📰 '+esc2(last?.name||'Latest week')+' · League Headlines</h3><div class="lc-list">';
    html+=item('Weekly winner'+(winners.length>1?'s':''),winners.join(', '),fmt(topScore)+' points');
    if(myWeeklyRank)html+=item('Your weekly finish','#'+myWeeklyRank,fmt(myLast.total_points)+' points');
    const mover=movements[0];html+=item('Biggest climb',mover.delta>0?mover.name+' ↑'+mover.delta:'No upward moves',mover.delta>0?'Positions gained':'Standings held steady');
    html+=item('The chase',d.rank.length>1?fmt(leader.total-d.rank[1].total)+' pts':'—','Leader’s advantage over second place');
    html+='</div></section></div>';
    html+='<div class="lc-split"><section class="lc-section"><h3>📊 Projected Seeding</h3>';
    if(p){html+='<p class="lc-sub">Projected regular-season seed probabilities from the same '+p.samples.toLocaleString()+' full-season simulations ('+p.remaining+' unscored cards). All eight make the playoffs.</p>';
      html+=d.rank.map(x=>{const a=p.counts[x.id],first=Math.round(100*a[0]/p.samples),top3=Math.round(100*a.slice(0,3).reduce((s,n)=>s+n,0)/p.samples);return '<div class="lc-item"><div style="flex:1"><b>'+esc2(x.name)+'</b><div class="lc-sub">'+first+'% top seed · '+top3+'% top 3</div><div class="lc-bar"><span style="width:'+top3+'%"></span></div></div></div>';}).join('');
    }else html+='<p class="muted">Seed projections activate after at least three scored regular-season cards and enough historical results. Everyone qualifies for the playoffs; seeding is what matters.</p>';
    html+='</section><section class="lc-section"><h3>⚔️ Rivalries</h3><p class="lc-sub">Head-to-head weekly scores. Ties are recorded as ties; these records do not change league scoring.</p>';
    const rivals=d.rank.filter(x=>x.id!==session.user.id).map(x=>{let wins=0,losses=0,ties=0;for(const w of d.scoredWeeks){const a=d.byWeek.get(w.id).find(s=>s.user_id===session.user.id),b=d.byWeek.get(w.id).find(s=>s.user_id===x.id);if(!a||!b)continue;const delta=Number(a.total_points)-Number(b.total_points);if(delta>0)wins++;else if(delta<0)losses++;else ties++;}return {name:x.name,wins,losses,ties};});
    html+=rivals.map(x=>item(x.name,x.wins+'–'+x.losses+'–'+x.ties,'Your W–L–T in scored weeks')).join('')+'</section></div>';
    const best=d.scores.slice().sort((a,b)=>Number(b.total_points)-Number(a.total_points))[0];
    const wins={};for(const w of d.scoredWeeks){const rows=d.byWeek.get(w.id),max=Math.max(...rows.map(x=>Number(x.total_points)));rows.filter(x=>Number(x.total_points)===max).forEach(x=>wins[x.user_id]=(wins[x.user_id]||0)+1);}
    const mostWins=Object.entries(wins).sort((a,b)=>b[1]-a[1])[0];
    html+='<section class="lc-section"><h3>📚 Record Book</h3><div class="lc-grid"><div class="lc-tile"><small>Best single week</small><strong>'+fmt(best.total_points)+'</strong><small>'+esc2(d.names[best.user_id]||'Member')+'</small></div><div class="lc-tile"><small>Most weekly wins</small><strong>'+esc2(mostWins?d.names[mostWins[0]]:'—')+'</strong><small>'+(mostWins?.[1]||0)+' weekly wins (ties shared)</small></div><div class="lc-tile"><small>Scored regular-season weeks</small><strong>'+d.scoredWeeks.length+'</strong><small>Recorded in this league</small></div></div></section></div>';
    root.innerHTML=html;
    $('lcRefresh')?.addEventListener('click',()=>load(true));
  }
  async function load(force=false){
    if(!isLogged())return;
    const ticket=++request;
    if(!force&&cache&&Date.now()-cache.at<60000){render(cache.data);return;}
    const root=$('leagueCentral');if(root&&!cache)root.innerHTML='<div class="lc-section">Loading League Central…</div>';
    try{const data=await getData();if(ticket!==request)return;cache={at:Date.now(),data};render(data);}
    catch(e){if(root)root.innerHTML='<div class="lc-section"><h3>League Central temporarily unavailable</h3><p class="muted">Your existing picks and standings are unaffected. Try refreshing.</p><button class="lc-action" id="lcRetry">Retry</button></div>'; $('lcRetry')?.addEventListener('click',()=>load(true));}
  }
  const previousHome=window.renderHome;
  window.renderHome=function(){const result=previousHome.apply(this,arguments);load();return result;};
  const previousShow=window.showPage;
  window.showPage=function(id){const result=previousShow.apply(this,arguments);if(id==='home')load();return result;};
  if(isLogged())load();
  // Update championship chances while the home page stays open.
  setInterval(()=>{
    if(isLogged()&&!document.hidden&&!$('home')?.classList.contains('hidden'))load(true);
  },60000);
})();
