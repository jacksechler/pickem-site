// Trophy Case, This Week in Pick'em, Season Records, and live activity feed.
(() => {
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const n = v => Number(v || 0);
  const fmt = v => n(v).toFixed(1).replace(/\.0$/, '');
  const nameOfProfile = p => p?.display_name || p?.username || 'Player';
  const isDecided = q => q?.result !== null && q?.result !== undefined;
  const scorePct = s => s?.pick_percentage != null ? n(s.pick_percentage) : (n(s?.question_count) ? n(s.correct_count)/n(s.question_count)*100 : 0);
  const safeResult = q => typeof q.result === 'string' ? q.result : JSON.stringify(q.result);
  let seasonCache = null;
  let seasonCacheAt = 0;

  function resultSort(a,b){
    const ao = a.result_order == null ? 999999 : Number(a.result_order);
    const bo = b.result_order == null ? 999999 : Number(b.result_order);
    return ao-bo || Number(a.position||0)-Number(b.position||0);
  }

  async function loadSeasonData(force=false){
    if(!force && seasonCache && Date.now()-seasonCacheAt < 10000) return seasonCache;
    const [profiles,weeks,rawScores] = await Promise.all([
      db('profiles?select=id,display_name,username,role'),
      db('weeks?select=id,number,name,status,published_at&order=number.asc'),
      db('week_scores?select=*')
    ]);
    const published = weeks.filter(w=>w.status==='published');
    const pubIds = new Set(published.map(w=>w.id));
    const scores = rawScores.filter(s=>pubIds.has(s.week_id));
    const names = Object.fromEntries(profiles.map(p=>[p.id,nameOfProfile(p)]));
    const weekMap = Object.fromEntries(published.map(w=>[w.id,w]));
    const totals = {}, correct = {}, qcount = {};
    scores.forEach(s=>{
      totals[s.user_id]=(totals[s.user_id]||0)+n(s.total_points);
      correct[s.user_id]=(correct[s.user_id]||0)+n(s.correct_count);
      qcount[s.user_id]=(qcount[s.user_id]||0)+n(s.question_count);
    });
    const allPlayerIds = profiles.map(p=>p.id).filter(id=>scores.some(s=>s.user_id===id));
    const rankIds = ids => [...ids].sort((a,b)=>n(totals[b])-n(totals[a]) || (names[a]||'').localeCompare(names[b]||''));
    const currentIds = rankIds(allPlayerIds);
    const currentRank = Object.fromEntries(currentIds.map((id,i)=>[id,i+1]));

    const running = {};
    const rankHistory = Object.fromEntries(profiles.map(p=>[p.id,[]]));
    const movementByWeek = {};
    let priorRanks = {};
    published.forEach(w=>{
      scores.filter(s=>s.week_id===w.id).forEach(s=>running[s.user_id]=(running[s.user_id]||0)+n(s.total_points));
      const ids = Object.keys(running).sort((a,b)=>running[b]-running[a] || (names[a]||'').localeCompare(names[b]||''));
      const ranks = Object.fromEntries(ids.map((id,i)=>[id,i+1]));
      movementByWeek[w.id]={};
      profiles.forEach(p=>{
        rankHistory[p.id].push(ranks[p.id]||null);
        movementByWeek[w.id][p.id]=(priorRanks[p.id]&&ranks[p.id]) ? priorRanks[p.id]-ranks[p.id] : 0;
      });
      priorRanks=ranks;
    });

    seasonCache={profiles,published,scores,names,weekMap,totals,correct,qcount,currentIds,currentRank,rankHistory,movementByWeek};
    seasonCacheAt=Date.now();
    return seasonCache;
  }

  function metricsFor(ctx,id){
    const ps=ctx.scores.filter(s=>s.user_id===id);
    const q=ps.reduce((a,s)=>a+n(s.question_count),0);
    const c=ps.reduce((a,s)=>a+n(s.correct_count),0);
    const biggestClimb=Math.max(0,...ctx.published.map(w=>n(ctx.movementByWeek[w.id]?.[id])));
    const weeksAt1=(ctx.rankHistory[id]||[]).filter(r=>r===1).length;
    return {
      points:ps.reduce((a,s)=>a+n(s.total_points),0),
      q,c,pct:q?c/q*100:0,
      wins:ps.filter(s=>n(s.placement)===1).length,
      podiums:ps.filter(s=>n(s.placement)>0&&n(s.placement)<=3).length,
      perfect:ps.filter(s=>n(s.question_count)>0&&n(s.correct_count)===n(s.question_count)).length,
      unicorns:ps.reduce((a,s)=>a+n(s.unicorn_count),0),
      upsets:ps.reduce((a,s)=>a+n(s.upset_count),0),
      longestOpening:Math.max(0,...ps.map(s=>n(s.opening_streak))),
      biggestClimb,weeksAt1,currentRank:ctx.currentRank[id]||null
    };
  }

  function badgesFor(ctx,id){
    const m=metricsFor(ctx,id);
    return [
      {icon:'👑',name:'Weekly Champion',earned:m.wins>0,detail:m.wins?m.wins+' weekly win'+(m.wins===1?'':'s'):'Win a week'},
      {icon:'💯',name:'Perfect Week',earned:m.perfect>0,detail:m.perfect?m.perfect+' perfect week'+(m.perfect===1?'':'s'):'Go perfect in a week'},
      {icon:'🦄',name:'Unicorn Club',earned:m.unicorns>0,detail:m.unicorns?m.unicorns+' unicorn'+(m.unicorns===1?'':'s'):'Hit a unique correct pick'},
      {icon:'⚡',name:'Hot Start',earned:m.longestOpening>=3,detail:m.longestOpening>=3?m.longestOpening+' straight after a perfect week':'Reach 3 straight after a perfect week'},
      {icon:'🥉',name:'Podium Regular',earned:m.podiums>=3,detail:m.podiums>=3?m.podiums+' top-3 finishes':'Earn 3 top-3 finishes'},
      {icon:'📈',name:'Climber',earned:m.biggestClimb>=2,detail:m.biggestClimb>=2?'Best jump: ↑'+m.biggestClimb:'Jump 2+ season spots in one week'},
      {icon:'🎯',name:'70% Club',earned:m.q>=20&&m.pct>=70,detail:m.q>=20?m.pct.toFixed(1)+'% season picks':'Need 20+ scored picks'},
      {icon:'🏆',name:'Season Leader',earned:m.currentRank===1,detail:m.currentRank===1?'Currently #1 overall':'Reach #1 overall'}
    ];
  }

  function trophyCaseHtml(ctx,view){
    if(!ctx.published.length) return '';
    if(view && view!=='league'){
      const name=ctx.names[view]||'Player';
      const badges=badgesFor(ctx,view);
      const earned=badges.filter(b=>b.earned).length;
      return '<div class="card" id="trophyCase"><div class="row" style="align-items:flex-end;gap:12px"><div><div class="eyebrow">TROPHY CASE</div><h2 style="margin:4px 0">'+esc(name)+'</h2><div class="muted">'+earned+'/'+badges.length+' trophies unlocked</div></div><div class="pill">'+earned+' earned</div></div><div class="feature-trophy-grid">'+badges.map(b=>'<div class="feature-trophy '+(b.earned?'earned':'locked')+'"><div class="feature-trophy-icon">'+b.icon+'</div><div><b>'+esc(b.name)+'</b><div class="mini">'+esc(b.detail)+'</div></div></div>').join('')+'</div></div>';
    }
    const rows=ctx.profiles.map(p=>{
      const badges=badgesFor(ctx,p.id), earned=badges.filter(b=>b.earned);
      return {p,earned};
    }).filter(r=>ctx.scores.some(s=>s.user_id===r.p.id)).sort((a,b)=>b.earned.length-a.earned.length || (ctx.currentRank[a.p.id]||99)-(ctx.currentRank[b.p.id]||99));
    return '<div class="card" id="trophyCase"><div class="eyebrow">TROPHY CASE</div><h2 style="margin:4px 0">League Trophy Leaders</h2><div class="muted">Achievements unlock automatically as the season develops.</div><div style="margin-top:10px">'+rows.map((r,i)=>'<div class="row" style="padding:10px 0;border-bottom:1px solid var(--line);gap:10px"><div style="min-width:0"><b>#'+(i+1)+' '+esc(nameOfProfile(r.p))+'</b><div class="mini">'+(r.earned.map(b=>b.icon).join(' ')||'No trophies yet')+'</div></div><div style="font-weight:950;color:var(--accent)">'+r.earned.length+'/8</div></div>').join('')+'</div></div>';
  }

  function recordBookHtml(ctx){
    if(!ctx.scores.length) return '';
    const enriched=ctx.scores.map(s=>({...s,name:ctx.names[s.user_id]||'Player',week:ctx.weekMap[s.week_id]}));
    const maxBy=(fn)=>Math.max(...enriched.map(fn));
    const highPts=maxBy(s=>n(s.total_points));
    const bestPct=maxBy(s=>scorePct(s));
    const mostCorrect=maxBy(s=>n(s.correct_count));
    const mostUnicorn=maxBy(s=>n(s.unicorn_count));
    const longestOpening=maxBy(s=>n(s.opening_streak));

    const playerMetrics=ctx.profiles.map(p=>({id:p.id,name:nameOfProfile(p),...metricsFor(ctx,p.id)})).filter(m=>m.q>0);
    const mostWins=Math.max(0,...playerMetrics.map(m=>m.wins));
    const biggestClimb=Math.max(0,...playerMetrics.map(m=>m.biggestClimb));
    const mostWeeksAt1=Math.max(0,...playerMetrics.map(m=>m.weeksAt1));

    const first=(arr,fn,val)=>arr.find(x=>fn(x)===val);
    const a=first(enriched,s=>n(s.total_points),highPts);
    const b=first(enriched,s=>scorePct(s),bestPct);
    const c=first(enriched,s=>n(s.correct_count),mostCorrect);
    const d=first(enriched,s=>n(s.unicorn_count),mostUnicorn);
    const e=first(enriched,s=>n(s.opening_streak),longestOpening);
    const f=first(playerMetrics,m=>m.wins,mostWins);
    const g=first(playerMetrics,m=>m.biggestClimb,biggestClimb);
    const h=first(playerMetrics,m=>m.weeksAt1,mostWeeksAt1);
    const cards=[
      ['⭐','Highest Weekly Score',fmt(highPts)+' pts',a?esc(a.name)+' · '+esc(a.week?.name||'Week'):'—'],
      ['🎯','Best Weekly Pick %',bestPct.toFixed(1)+'%',b?esc(b.name)+' · '+esc(b.week?.name||'Week'):'—'],
      ['✅','Most Correct in a Week',String(mostCorrect),c?esc(c.name)+' · '+esc(c.week?.name||'Week'):'—'],
      ['🦄','Most Unicorns in a Week',String(mostUnicorn),d?esc(d.name)+' · '+esc(d.week?.name||'Week'):'—'],
      ['⚡','Longest Post-Perfect Streak',String(longestOpening),e?esc(e.name)+' · '+esc(e.week?.name||'Week'):'—'],
      ['👑','Most Weekly Wins',String(mostWins),f?esc(f.name):'—'],
      ['📈','Biggest Standings Jump','↑ '+biggestClimb,g?esc(g.name):'—'],
      ['🏆','Most Weeks at #1',String(mostWeeksAt1),h?esc(h.name):'—']
    ];
    return '<div class="card" id="seasonRecordBook"><div class="eyebrow">RECORD BOOK</div><h2 style="margin:4px 0">Season Records</h2><div class="muted">These update automatically after each published week.</div><div class="feature-record-grid">'+cards.map(r=>'<div class="feature-record"><div style="font-size:22px">'+r[0]+'</div><div class="mini">'+r[1]+'</div><div style="font-size:20px;font-weight:950;margin:2px 0">'+r[2]+'</div><div class="mini">'+r[3]+'</div></div>').join('')+'</div></div>';
  }

  async function loadCurrentWeekData(ctx){
    if(!week) return {subs:[],picks:[],pickMap:{},userIds:[],names:ctx.names};
    const [subs,picks]=await Promise.all([
      db('submissions?week_id=eq.'+week.id+'&select=user_id,submitted_at,tiebreaker_answer'),
      db('picks?week_id=eq.'+week.id+'&select=user_id,question_id,answer')
    ]);
    const pickMap={};
    picks.forEach(p=>{(pickMap[p.user_id]??={})[p.question_id]=p.answer;});
    return {subs,picks,pickMap,userIds:subs.map(s=>s.user_id),names:ctx.names};
  }

  function leagueLiveRows(current){
    const decidedQs=[...questions].filter(q=>q.counts_for_score!==false&&isDecided(q)).sort(resultSort);
    const ids=current.userIds;
    const rows=ids.map(id=>({id,name:current.names[id]||'Player',correct:decidedQs.filter(q=>same(current.pickMap[id]?.[q.id],q.result)).length,decided:decidedQs.length}));
    return rows.sort((a,b)=>b.correct-a.correct || a.name.localeCompare(b.name));
  }

  function perfectCarriers(ctx){
    const latest=ctx.published[ctx.published.length-1];
    if(!latest) return [];
    return ctx.scores.filter(s=>s.week_id===latest.id&&n(s.question_count)>0&&n(s.correct_count)===n(s.question_count)).map(s=>s.user_id);
  }

  function carrierStatus(ctx,current,id){
    const dq=[...questions].filter(q=>q.counts_for_score!==false&&isDecided(q)).sort(resultSort);
    let straight=0,ended=false;
    for(const q of dq){
      if(same(current.pickMap[id]?.[q.id],q.result) && !ended) straight++;
      else if(!ended){ ended=true; break; }
    }
    return {straight,ended,bonus:straight*0.5,decided:dq.length};
  }

  function pickStories(current){
    if(!locked() || current.userIds.length<2) return {split:null,consensus:null};
    const scored=questions.filter(q=>q.counts_for_score!==false);
    const stories=[];
    scored.forEach(q=>{
      const counts=new Map();
      current.userIds.forEach(id=>{
        const a=current.pickMap[id]?.[q.id];
        const key=JSON.stringify(a);
        if(a!==undefined) counts.set(key,(counts.get(key)||0)+1);
      });
      if(counts.size<2) return;
      const arr=[...counts.entries()].sort((a,b)=>b[1]-a[1]);
      stories.push({q,topKey:arr[0][0],top:arr[0][1],second:arr[1]?.[1]||0,total:arr.reduce((a,x)=>a+x[1],0)});
    });
    const split=[...stories].sort((a,b)=>Math.abs(a.top/a.total-.5)-Math.abs(b.top/b.total-.5))[0]||null;
    const consensus=[...stories].sort((a,b)=>b.top/a.total-a.top/b.total)[0]||null;
    return {split,consensus};
  }

  function thisWeekHtml(ctx,current){
    if(!week) return '';
    const latest=ctx.published[ctx.published.length-1];
    const defending=latest?ctx.scores.find(s=>s.week_id===latest.id&&n(s.placement)===1):null;
    const leaderId=ctx.currentIds[0];
    const secondId=ctx.currentIds[1];
    const gap=leaderId&&secondId ? n(ctx.totals[leaderId])-n(ctx.totals[secondId]) : 0;
    const carriers=perfectCarriers(ctx);
    const mine=current.subs.some(s=>s.user_id===session.user.id);
    const scoredCount=questions.filter(q=>q.counts_for_score!==false).length;
    const live=locked()?leagueLiveRows(current):[];
    const liveTop=live[0];
    const stories=pickStories(current);
    let bonusText='No active post-perfect bonus';
    if(carriers.length){
      bonusText=carriers.map(id=>{
        if(!locked()) return (ctx.names[id]||'Player')+' carries the bonus into '+(week.name||'this week');
        const st=carrierStatus(ctx,current,id);
        return (ctx.names[id]||'Player')+': '+st.straight+' straight · +'+fmt(st.bonus)+(st.ended?' final':' so far');
      }).join(' · ');
    }
    let dynamicA,dynamicB;
    if(locked()){
      dynamicA=liveTop&&liveTop.decided ? ['🔥','Live Leader',liveTop.name,liveTop.correct+'/'+liveTop.decided+' correct'] : ['⏳','Live Leader','Waiting','No results yet'];
      if(stories.split){
        const counts=[stories.split.top,stories.split.second].sort((a,b)=>b-a);
        dynamicB=['⚔️','Most Split Pick',counts[0]+'–'+counts[1]+' split',stories.split.q.prompt];
      }else dynamicB=['⚔️','Most Split Pick','—','Waiting for locked picks'];
    }else{
      dynamicA=['📝','Your Entry',mine?'Submitted ✓':'Not submitted',mine?'You are locked in when the week closes.':'Make your picks before the deadline.'];
      const when=new Date(week.lock_at);
      dynamicB=['⏰','Scheduled Lock',when.toLocaleDateString([], {weekday:'short',month:'short',day:'numeric'}),when.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})];
    }
    const tiles=[
      ['🏆','Season Leader',leaderId?(ctx.names[leaderId]||'Player'):'—',leaderId?fmt(ctx.totals[leaderId])+' pts'+(secondId?' · +'+fmt(gap)+' over #2':''):'No published standings yet'],
      ['👑','Defending Weekly Champ',defending?(ctx.names[defending.user_id]||'Player'):'—',latest?latest.name:'No completed week yet'],
      dynamicA,dynamicB,
      ['⚡','Bonus Watch',carriers.length?carriers.map(id=>ctx.names[id]||'Player').join(', '):'None',bonusText],
      ['📋','Week Setup',scoredCount+' scored picks',week.auto_locked_at?'Locked early — everyone submitted':locked()?'Week is locked':'Picks are open']
    ];
    return '<div class="card" id="thisWeekPickem"><div class="eyebrow">THIS WEEK IN PICK’EM</div><h2 style="margin:4px 0">Storylines to Watch</h2><div class="muted">A quick league snapshot that changes as the weekend develops.</div><div class="feature-story-grid">'+tiles.map(t=>'<div class="feature-story"><div style="font-size:22px">'+t[0]+'</div><div class="mini">'+esc(t[1])+'</div><div style="font-size:17px;font-weight:950;margin:3px 0">'+esc(t[2])+'</div><div class="mini">'+esc(t[3])+'</div></div>').join('')+'</div></div>';
  }

  function leaderNotes(current){
    const ids=current.userIds;
    const notes={};
    if(!ids.length) return notes;
    const score=Object.fromEntries(ids.map(id=>[id,0]));
    let prior=[];
    const dq=[...questions].filter(q=>q.counts_for_score!==false&&isDecided(q)).sort(resultSort);
    dq.forEach((q,idx)=>{
      ids.forEach(id=>{if(same(current.pickMap[id]?.[q.id],q.result)) score[id]++;});
      const best=Math.max(...ids.map(id=>score[id]));
      const leaders=ids.filter(id=>score[id]===best).sort((a,b)=>(current.names[a]||'').localeCompare(current.names[b]||''));
      const changed=idx>0 && JSON.stringify(leaders)!==JSON.stringify(prior);
      if(changed){
        notes[q.id]=leaders.length===1 ? (current.names[leaders[0]]||'Player')+' takes the live lead' : leaders.map(id=>current.names[id]||'Player').join(' + ')+' share the live lead';
      }
      prior=leaders;
    });
    return notes;
  }

  function activityEvents(ctx,current){
    const events=[];
    const notes=leaderNotes(current);
    const carriers=perfectCarriers(ctx);
    const carrierState=Object.fromEntries(carriers.map(id=>[id,{straight:0,ended:false}]));
    const dq=[...questions].filter(q=>q.counts_for_score!==false&&isDecided(q)).sort(resultSort);
    dq.forEach((q,idx)=>{
      const t=q.result_entered_at?new Date(q.result_entered_at).getTime():(Date.now()-((dq.length-idx)*1000));
      const winners=current.userIds.filter(id=>same(current.pickMap[id]?.[q.id],q.result));
      events.push({t,priority:1,icon:'✅',title:'Result #'+(q.result_order||idx+1)+' is in',body:safeResult(q)+' · '+winners.length+'/'+current.userIds.length+' got it right'+(notes[q.id]?' · '+notes[q.id]:'')});
      if(winners.length===1){
        events.push({t:t+2,priority:3,icon:'🦄',title:'Unicorn!',body:(current.names[winners[0]]||'Player')+' was the only person to get “'+q.prompt+'” right.'});
      }
      carriers.forEach(id=>{
        const st=carrierState[id];
        if(st.ended) return;
        if(same(current.pickMap[id]?.[q.id],q.result)) st.straight++;
        else{
          st.ended=true;
          events.push({t:t+1,priority:2,icon:'⚡',title:'Bonus streak ends',body:(ctx.names[id]||'Player')+' finishes with '+st.straight+' straight correct for +'+fmt(st.straight*0.5)+' bonus points.'});
        }
      });
    });
    const latest=ctx.published[ctx.published.length-1];
    if(latest){
      const winner=ctx.scores.find(s=>s.week_id===latest.id&&n(s.placement)===1);
      if(winner) events.push({t:latest.published_at?new Date(latest.published_at).getTime():0,priority:0,icon:'🏁',title:latest.name+' is final',body:(ctx.names[winner.user_id]||'Player')+' won with '+winner.correct_count+'/'+winner.question_count+' correct and '+fmt(winner.total_points)+' points.'});
    }
    return events.sort((a,b)=>b.t-a.t || b.priority-a.priority).slice(0,9);
  }

  function activityHtml(ctx,current,id){
    if(!week || !locked()) return '';
    const events=activityEvents(ctx,current);
    return '<div class="card" id="'+id+'"><div class="row" style="align-items:flex-end;gap:12px"><div><div class="eyebrow">WHAT JUST HAPPENED</div><h2 style="margin:4px 0">Live League Feed</h2></div><div class="pill">LIVE</div></div><div class="muted">Results, lead changes, Unicorns, and bonus streak moments.</div><div class="feature-feed">'+(events.length?events.map(e=>'<div class="feature-feed-item"><div class="feature-feed-icon">'+e.icon+'</div><div><b>'+esc(e.title)+'</b><div class="mini">'+esc(e.body)+'</div></div></div>').join(''):'<div class="muted">Nothing has happened yet. The feed starts with the first result.</div>')+'</div></div>';
  }

  function injectFeatureStyles(){
    if(document.getElementById('featureV3Styles')) return;
    const style=document.createElement('style');
    style.id='featureV3Styles';
    style.textContent=`
      .feature-trophy-grid,.feature-record-grid,.feature-story-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:14px}
      .feature-trophy,.feature-record,.feature-story{background:var(--panel2);border:1px solid var(--line);border-radius:14px;padding:13px;min-width:0}
      .feature-trophy{display:flex;align-items:center;gap:10px}.feature-trophy.locked{opacity:.38;filter:grayscale(.6)}.feature-trophy.earned{box-shadow:inset 0 0 0 1px rgba(59,130,246,.13)}
      .feature-trophy-icon{font-size:25px;flex:0 0 auto}.feature-feed{margin-top:12px;border-top:1px solid var(--line)}
      .feature-feed-item{display:grid;grid-template-columns:34px 1fr;gap:9px;padding:11px 0;border-bottom:1px solid var(--line);align-items:start}.feature-feed-icon{font-size:20px;text-align:center}
      @media(min-width:720px){.feature-record-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.feature-story-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media(max-width:420px){.feature-trophy-grid,.feature-record-grid,.feature-story-grid{gap:7px}.feature-trophy,.feature-record,.feature-story{padding:10px}.feature-trophy{display:block}.feature-trophy-icon{margin-bottom:4px}}
    `;
    document.head.appendChild(style);
  }

  async function renderHomeFeatures(){
    if(!session || !profile) return;
    const home=el('home'); if(!home) return;
    el('thisWeekPickem')?.remove();
    el('whatJustHappenedHome')?.remove();
    const ctx=await loadSeasonData();
    const current=await loadCurrentWeekData(ctx);
    const html=thisWeekHtml(ctx,current)+activityHtml(ctx,current,'whatJustHappenedHome');
    home.insertAdjacentHTML('beforeend',html);
  }

  const baseHomeV3=window.renderHome;
  window.renderHome=function(){
    baseHomeV3();
    injectFeatureStyles();
    renderHomeFeatures().catch(e=>console.debug('Home features skipped',e));
  };

  const baseLeagueV3=window.renderLeague;
  window.renderLeague=async function(){
    await baseLeagueV3();
    injectFeatureStyles();
    if(!session || !week || !locked()) return;
    const box=el('leagueBox'); if(!box) return;
    el('whatJustHappenedLeague')?.remove();
    try{
      const ctx=await loadSeasonData();
      const current=await loadCurrentWeekData(ctx);
      const html=activityHtml(ctx,current,'whatJustHappenedLeague');
      if(!html) return;
      const holder=document.createElement('div'); holder.innerHTML=html;
      const node=holder.firstElementChild;
      const first=box.firstElementChild;
      if(first?.nextSibling) box.insertBefore(node,first.nextSibling); else box.appendChild(node);
    }catch(e){console.debug('League activity skipped',e);}
  };

  const baseStatsV3=window.renderStats;
  window.renderStats=async function(){
    await baseStatsV3();
    injectFeatureStyles();
    const box=el('statsBox'); if(!box) return;
    el('trophyCase')?.remove(); el('seasonRecordBook')?.remove();
    try{
      const ctx=await loadSeasonData(true);
      const view=el('statsViewSelect')?.value || 'league';
      box.insertAdjacentHTML('beforeend',trophyCaseHtml(ctx,view)+recordBookHtml(ctx));
    }catch(e){console.debug('Stats feature cards skipped',e);}
  };
})();
