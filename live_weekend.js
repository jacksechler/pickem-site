// Live weekend scoring, League Picks scoreboard, and richer Home dashboard.
(() => {
  let leagueView = 'all';

  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const num = v => Number(v || 0);
  const fmt = v => num(v).toFixed(1).replace(/\.0$/, '');
  const pname = p => p?.display_name || p?.username || 'Player';
  const decided = q => q.result !== null && q.result !== undefined;

  function resultSort(a,b){
    const ao = a.result_order == null ? 999999 : Number(a.result_order);
    const bo = b.result_order == null ? 999999 : Number(b.result_order);
    return ao - bo || Number(a.position||0) - Number(b.position||0);
  }

  window.setLeagueView = function(v){
    leagueView = v || 'all';
    renderLeague();
  };

  async function loadLeagueWeekendData(){
    const [profiles,subs,picks] = await Promise.all([
      db('profiles?select=id,display_name,username,role'),
      db('submissions?week_id=eq.'+week.id+'&select=user_id,tiebreaker_answer'),
      db('picks?week_id=eq.'+week.id+'&select=user_id,question_id,answer')
    ]);
    const users = subs.map(s=>s.user_id);
    const names = Object.fromEntries(profiles.map(p=>[p.id,pname(p)]));
    const pickMap = {};
    picks.forEach(p=>{ (pickMap[p.user_id]??={})[p.question_id]=p.answer; });
    const orderedQuestions = [...questions].sort(resultSort);
    const decidedQs = orderedQuestions.filter(decided);
    const live = users.map(id=>{
      let correct=0;
      decidedQs.forEach(q=>{ if(same(pickMap[id]?.[q.id],q.result)) correct++; });
      return {id,name:names[id]||'Player',correct,decided:decidedQs.length};
    }).sort((a,b)=>b.correct-a.correct || a.name.localeCompare(b.name));
    return {profiles,subs,users,names,pickMap,orderedQuestions,decidedQs,live};
  }

  function livePlaceRows(live){
    let lastCorrect=null, rank=0;
    return live.map((r,i)=>{
      if(lastCorrect===null || r.correct!==lastCorrect) rank=i+1;
      lastCorrect=r.correct;
      return {...r,rank};
    });
  }

  function podiumHtml(rows){
    if(!rows.length || rows[0].decided===0){
      return '<div class="card"><div class="eyebrow">LIVE WEEK STANDINGS</div><h2 style="margin:5px 0">Waiting for results</h2><div class="muted">The weekly race appears here as soon as the first result is entered.</div></div>';
    }
    const top = rows.slice(0,3);
    const medal = ['🥇','🥈','🥉'];
    const tone = ['#fbbf24','#cbd5e1','#fb923c'];
    let h='<div class="card"><div class="eyebrow">LIVE WEEK STANDINGS</div><div class="row" style="align-items:flex-end;gap:12px;margin-top:10px;flex-wrap:wrap"><div><h2 style="margin:0">Weekend Race</h2><div class="muted">Provisional · ranked by correct picks so far</div></div><div class="pill">'+rows[0].decided+'/'+questions.filter(q=>q.counts_for_score!==false).length+' decided</div></div>';
    h+='<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:14px">'+top.map((r,i)=>
      '<div style="background:var(--panel2);border:1px solid var(--line);border-radius:13px;padding:13px;text-align:center">'+
        '<div style="font-size:24px">'+medal[i]+'</div><div style="font-weight:950;color:'+tone[i]+';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(r.name)+'</div>'+
        '<div style="font-size:24px;font-weight:950;margin-top:4px">'+r.correct+'/'+r.decided+'</div><div class="mini">correct so far</div></div>'
    ).join('')+'</div>';
    h+='<div style="margin-top:12px;border-top:1px solid var(--line)">'+rows.map(r=>{
      const mark=r.rank===1?'🥇':r.rank===2?'🥈':r.rank===3?'🥉':'#'+r.rank;
      return '<div class="row" style="padding:8px 2px;border-bottom:1px solid var(--line)"><div><b>'+mark+' '+esc(r.name)+'</b></div><div style="font-weight:950">'+r.correct+'/'+r.decided+'</div></div>';
    }).join('')+'</div><div class="mini" style="margin-top:9px">Ties are provisional until the week is complete and the tiebreaker is applied.</div></div>';
    return h;
  }

  window.renderLeague = async function(){
    const box=el('leagueBox');
    if(!week){ box.innerHTML='<div class="card">No active week.</div>'; return; }
    if(!locked()){
      box.innerHTML='<div class="notice"><b>🔒 Everyone\'s picks stay private until this week locks.</b></div>';
      return;
    }
    box.innerHTML='<div class="card muted">Loading live scoreboard…</div>';
    try{
      const d=await loadLeagueWeekendData();
      const rows=livePlaceRows(d.live);
      const visibleUsers = leagueView==='all' ? d.users : d.users.filter(id=>id===leagueView);
      if(leagueView!=='all' && !visibleUsers.length) leagueView='all';

      let h=podiumHtml(rows);
      h+='<div class="card"><div class="row" style="gap:12px;align-items:end;flex-wrap:wrap"><div style="flex:1;min-width:220px"><div class="eyebrow">LEAGUE PICKS</div><h2 style="margin:4px 0">Live Pick Board</h2><div class="muted">Green = correct · Red = wrong · undecided picks stay neutral.</div></div><div style="min-width:230px"><label style="margin-top:0">View picks</label><select onchange="setLeagueView(this.value)"><option value="all" '+(leagueView==='all'?'selected':'')+'>Everyone</option>'+d.users.map(id=>'<option value="'+id+'" '+(leagueView===id?'selected':'')+'>'+esc(d.names[id]||'Player')+'</option>').join('')+'</select></div></div></div>';

      if(!visibleUsers.length){ box.innerHTML=h+'<div class="card muted">No submitted picks yet.</div>'; return; }

      const liveMap=Object.fromEntries(rows.map(r=>[r.id,r]));
      h+='<div class="card tablewrap" style="padding:0"><table class="table" style="min-width:'+(leagueView==='all'?'1050':'560')+'px"><thead><tr><th style="position:sticky;left:0;background:var(--panel);z-index:2">Question</th>'+visibleUsers.map(id=>{
        const r=liveMap[id]||{correct:0,decided:d.decidedQs.length};
        return '<th><div style="font-weight:950">'+esc(d.names[id]||'Player')+'</div><div style="color:var(--accent);font-size:17px;font-weight:950;margin-top:2px">'+r.correct+'/'+r.decided+'</div><div class="mini">live score</div></th>';
      }).join('')+'</tr></thead><tbody>';

      const displayQs=[...questions].sort((a,b)=>Number(a.position||0)-Number(b.position||0));
      displayQs.forEach(q=>{
        const isDone=decided(q);
        const resultLabel=isDone?'<div class="mini good">✓ Result: '+esc(typeof q.result==='string'?q.result:JSON.stringify(q.result))+'</div>':'';
        h+='<tr><td style="position:sticky;left:0;background:var(--panel);z-index:1"><b>'+esc(q.prompt)+'</b>'+resultLabel+'</td>';
        visibleUsers.forEach(id=>{
          const a=d.pickMap[id]?.[q.id];
          let style='', icon='';
          if(isDone){
            const ok=same(a,q.result);
            style=ok?'background:#0b2a25;color:var(--green);font-weight:900':'background:#32131b;color:var(--red);font-weight:900';
            icon=ok?'✓ ':'✕ ';
          }
          h+='<td style="'+style+'">'+icon+esc(a??'—')+'</td>';
        });
        h+='</tr>';
      });
      h+='</tbody></table></div>';
      box.innerHTML=h;
    }catch(e){
      console.error(e);
      box.innerHTML='<div class="notice">Could not load live league picks.</div>';
    }
  };

  function liveResultsPanel(){
    if(!week || profile?.role!=='commissioner' || week.status==='published' || !locked()) return '';
    const scored=[...questions].filter(q=>q.counts_for_score!==false).sort((a,b)=>Number(a.position||0)-Number(b.position||0));
    const completed=scored.filter(decided).length;
    let h='<div class="card" id="liveResultEntry"><div class="eyebrow">LIVE RESULT ENTRY</div><div class="row" style="align-items:flex-end;gap:12px;flex-wrap:wrap"><div><h2 style="margin:4px 0">Update the Weekend Live</h2><div class="muted">Save one result at a time. The order you first save them becomes the opening-streak bonus order.</div></div><div class="pill">'+completed+'/'+scored.length+' decided</div></div>';
    scored.forEach((q,i)=>{
      const opts=Array.isArray(q.answer_options)?q.answer_options:[];
      const current=opts.findIndex(v=>same(v,q.result));
      const order=q.result_order?'<span class="pill good">Result #'+q.result_order+'</span>':'<span class="pill">Pending</span>';
      h+='<div style="padding:12px 0;border-bottom:1px solid var(--line)"><div class="row" style="gap:12px;align-items:center"><div style="min-width:0"><div class="mini">'+esc(q.sport||'Other')+' · Q'+(i+1)+'</div><b>'+esc(q.prompt)+'</b></div>'+order+'</div><div style="display:grid;grid-template-columns:1fr auto;gap:9px;margin-top:8px"><select id="live_result_'+q.id+'"><option value="">Select result</option>'+opts.map((v,idx)=>'<option value="'+idx+'" '+(idx===current?'selected':'')+'>'+esc(typeof v==='string'?v:JSON.stringify(v))+'</option>').join('')+'</select><button class="btn" onclick="saveSingleResult(\''+q.id+'\')">Save</button></div></div>';
    });
    h+='<div style="margin-top:14px"><label>Actual tiebreaker result <span class="muted">(can be saved whenever it is known)</span></label><div style="display:grid;grid-template-columns:1fr auto;gap:9px"><input id="liveActualTiebreaker" type="number" step="any" value="'+esc(week.tiebreaker_result??'')+'" placeholder="Final number"><button class="btn secondary" onclick="saveLiveTiebreaker()">Save</button></div></div></div>';
    return h;
  }

  window.saveSingleResult = async function(questionId){
    if(profile?.role!=='commissioner' || !week || week.status==='published' || !locked()) return;
    const q=questions.find(x=>x.id===questionId);
    const sel=el('live_result_'+questionId);
    if(!q || !sel || sel.value==='') return alert('Choose the result first.');
    const opts=Array.isArray(q.answer_options)?q.answer_options:[];
    const result=opts[Number(sel.value)];
    const existingOrder=q.result_order==null?null:Number(q.result_order);
    let order=existingOrder;
    if(order==null){
      const used=questions.map(x=>Number(x.result_order||0));
      order=Math.max(0,...used)+1;
    }
    try{
      await db('questions?id=eq.'+questionId,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({result,result_order:order,result_entered_at:q.result_entered_at||new Date().toISOString()})});
      await loadData();
      renderHome();
      await renderCommissioner();
    }catch(e){
      console.error(e);
      alert('Could not save that result.');
    }
  };

  window.saveLiveTiebreaker = async function(){
    const v=el('liveActualTiebreaker')?.value;
    if(v==='' || v==null) return alert('Enter the actual tiebreaker result.');
    try{
      await db('weeks?id=eq.'+week.id,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({tiebreaker_result:Number(v)})});
      await loadData();
      await renderCommissioner();
    }catch(e){ alert('Could not save the tiebreaker.'); }
  };

  const commissionerBeforeLive = window.renderCommissioner;
  window.renderCommissioner = async function(){
    await commissionerBeforeLive();
    if(profile?.role!=='commissioner') return;
    const box=el('commissionerBox');
    if(!box) return;
    // Hide the old all-at-once result card so live one-by-one entry is the primary workflow.
    [...box.querySelectorAll('.card')].forEach(card=>{
      if(card.querySelector('.eyebrow')?.textContent?.trim()==='COMMISSIONER RESULTS') card.style.display='none';
    });
    const panel=liveResultsPanel();
    if(panel) box.insertAdjacentHTML('afterbegin',panel);
  };

  async function getHomeDashboard(){
    if(!session || !profile) return '';
    const [publishedWeeks,allScores,profiles] = await Promise.all([
      db('weeks?status=eq.published&select=id,number,name&order=number.asc'),
      db('week_scores?select=*'),
      db('profiles?select=id,display_name,username')
    ]);
    const pubIds=new Set(publishedWeeks.map(w=>w.id));
    const scores=allScores.filter(s=>pubIds.has(s.week_id));
    const names=Object.fromEntries(profiles.map(p=>[p.id,pname(p)]));
    const totals={},correct={},qcount={};
    scores.forEach(s=>{
      totals[s.user_id]=(totals[s.user_id]||0)+num(s.total_points);
      correct[s.user_id]=(correct[s.user_id]||0)+num(s.correct_count);
      qcount[s.user_id]=(qcount[s.user_id]||0)+num(s.question_count);
    });
    const ranked=Object.keys(totals).sort((a,b)=>totals[b]-totals[a] || (names[a]||'').localeCompare(names[b]||''));
    const myRank=ranked.indexOf(session.user.id)+1;
    const latest=publishedWeeks[publishedWeeks.length-1];
    const lastScore=latest?scores.find(s=>s.week_id===latest.id&&s.user_id===session.user.id):null;

    let liveCorrect=0,liveDecided=0;
    if(week && locked()){
      const my=await db('picks?week_id=eq.'+week.id+'&user_id=eq.'+session.user.id+'&select=question_id,answer');
      const pm=Object.fromEntries(my.map(p=>[p.question_id,p.answer]));
      const dq=questions.filter(q=>q.counts_for_score!==false&&decided(q));
      liveDecided=dq.length;
      liveCorrect=dq.filter(q=>same(pm[q.id],q.result)).length;
    }
    const seasonPct=qcount[session.user.id]?correct[session.user.id]/qcount[session.user.id]*100:0;
    const top5=ranked.slice(0,5);
    let h='<div id="homeDashboardExtra">';
    h+='<div class="eyebrow" style="margin-top:24px">SEASON DASHBOARD</div><div class="grid three">'+
      '<div class="card"><div class="muted">Season Rank</div><div class="big">'+(myRank?'#'+myRank:'—')+'</div></div>'+
      '<div class="card"><div class="muted">Season Points</div><div class="big">'+fmt(totals[session.user.id]||0)+'</div></div>'+
      '<div class="card"><div class="muted">Season Pick %</div><div class="big">'+seasonPct.toFixed(1)+'%</div></div>'+
      '<div class="card"><div class="muted">Live This Week</div><div class="big">'+(locked()?(liveCorrect+'/'+liveDecided):'🔒')+'</div><div class="mini">correct / decided</div></div>'+
      '<div class="card"><div class="muted">Last Week Finish</div><div class="big">'+(lastScore?.placement?'#'+lastScore.placement:'—')+'</div></div>'+
      '<div class="card"><div class="muted">Last Week Points</div><div class="big">'+(lastScore?fmt(lastScore.total_points):'—')+'</div></div></div>';
    h+='<div class="card"><div class="row" style="align-items:flex-end"><div><div class="eyebrow">STANDINGS SNAPSHOT</div><h2 style="margin:4px 0">Top of the Table</h2></div><button class="btn secondary" onclick="showPage(\'standings\',document.querySelector(\'[data-page=standings]\'))">Full Standings</button></div><div style="margin-top:10px">'+top5.map((id,i)=>{
      const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':'#'+(i+1);
      return '<div class="row" style="padding:10px 0;border-bottom:1px solid var(--line)"><div><b>'+medal+' '+esc(names[id]||'Player')+'</b></div><div style="font-size:18px;font-weight:950;color:var(--accent)">'+fmt(totals[id])+' pts</div></div>';
    }).join('')+'</div></div></div>';
    return h;
  }

  const homeBeforeLive = window.renderHome;
  window.renderHome = function(){
    homeBeforeLive();
    const home=el('home');
    if(!home) return;
    const old=el('homeDashboardExtra');
    if(old) old.remove();
    getHomeDashboard().then(html=>{
      const again=el('homeDashboardExtra'); if(again) again.remove();
      home.insertAdjacentHTML('beforeend',html);
    }).catch(console.error);
  };
})();
