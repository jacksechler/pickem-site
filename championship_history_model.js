// Reconstruct historic title chances from *published* score snapshots.
// Does not pretend forecasts were recorded at the time: estimates are backfilled
// using no scores from weeks later than the requested historical checkpoint.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ChampionshipHistoryModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const number=v=>v===null||v===undefined||v===''?0:Number(v)||0;
  const BONUS=[10,8,7,5,4,3,2,0];
  const verified=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  const clone=o=>JSON.parse(JSON.stringify(o));
  function buildTimeline({profiles=[],weeks=[],scores=[],seasonId=null,regularWeekCount=20}={}){
    const calendar=[...weeks].filter(w=>w&&w.id&&w.status==='published'&&
      (seasonId===null||w.season_id==null||w.season_id===seasonId))
      .sort((a,b)=>Number(a.number)-Number(b.number));
    const uniqueWeeks=new Set(calendar.map(w=>w.id));
    if(uniqueWeeks.size!==calendar.length)return {kind:'unavailable',reason:'Published week IDs are duplicated.'};
    const visibleScores=scores.filter(s=>uniqueWeeks.has(s.week_id));
    const idsWithScores=[...new Set(visibleScores.map(s=>s.user_id).filter(Boolean))];
    // Before Week 1, use the exact eight registered member profiles.
    const allProfiles=[...profiles].filter(p=>p.id);
    const ids=idsWithScores.length===8?idsWithScores:allProfiles.length===8?
      allProfiles.map(p=>p.id):idsWithScores.length?idsWithScores:allProfiles.map(p=>p.id);
    if(ids.length!==8||new Set(ids).size!==8)return {kind:'unavailable',reason:'Waiting for the complete eight-member league roster.'};
    const profilesById=Object.fromEntries(allProfiles.map(p=>[p.id,p]));
    const names=Object.fromEntries(ids.map(id=>[id,profilesById[id]?.display_name||profilesById[id]?.username||'Member']));
    const ordered=ids.slice().sort((a,b)=>names[a].localeCompare(names[b])||a.localeCompare(b));
    const totals=Object.fromEntries(ordered.map(id=>[id,{total:0,correct:0,wins:0}]));
    const start=()=>ordered.map(id=>({id,...totals[id]}));
    const timeline=[{id:'start',weekId:null,label:'Season start',shortLabel:'Start',
      weekNumber:0,kind:'preseason',index:0,players:start(),history:[]}];
    const past=[];
    for(const w of calendar){
      const weekly=visibleScores.filter(s=>s.week_id===w.id);
      if(weekly.length!==8||new Set(weekly.map(s=>s.user_id)).size!==8||
         weekly.some(s=>!totals[s.user_id]||
          !verified(s.total_points)||!verified(s.correct_count)||!verified(s.question_count)||!verified(s.placement)))
        return {kind:'unavailable',reason:'One or more published weeks have incomplete score records. No historical odds were invented.'};
      for(const s of weekly){
        totals[s.user_id].total+=Number(s.total_points);
        totals[s.user_id].correct+=Number(s.correct_count);
        totals[s.user_id].wins+=Number(s.placement)===1?1:0;
        past.push({user_id:s.user_id,week_id:s.week_id,
          total_points:Number(s.total_points),correct_count:Number(s.correct_count),
          question_count:Number(s.question_count),placement:Number(s.placement)});
      }
      timeline.push({id:'week:'+w.id,weekId:w.id,label:w.name||'Week '+w.number,
        shortLabel:'W'+w.number,weekNumber:Number(w.number),kind:'regular',index:timeline.length,
        players:start(),history:past.slice()});
    }
    const count=Number(regularWeekCount)||20;
    if(calendar.length>count)return {kind:'unavailable',reason:'Published weeks exceed the official regular-season length.'};
    return {kind:'ready',seasonId:seasonId||calendar[0]?.season_id||'season',
      ids:ordered,names,weekCount:calendar.length,regularWeekCount:count,
      timeline,history:past.slice()};
  }
  function predictRegular(snapshot,forecaster,{seasonId,regularWeekCount,samples=1500}={}){
    if(snapshot.kind==='preseason'){
      // Without any published evidence, all eight have equal starting chances.
      const odds=Object.fromEntries(snapshot.players.map(p=>[p.id,12.5]));
      return {kind:'estimate',titleOdds:odds,samples:0,assumption:'Equal starting chance; no matches have been published.'};
    }
    const seedKey=JSON.stringify(['historic-title-v1',seasonId,snapshot.weekNumber,
      snapshot.players.map(p=>[p.id,p.total,p.correct,p.wins]),snapshot.history]);
    return forecaster.estimateRegular({
      players:snapshot.players,history:snapshot.history,remainingWeeks:Math.max(0,
        (regularWeekCount||20)-snapshot.history.length/8),
      samples,seedKey
    });
  }
  function estimateTimeline(timeline,forecaster,{samples=1500}={}){
    if(timeline?.kind!=='ready')return timeline||{kind:'unavailable',reason:'League history unavailable.'};
    if(!forecaster?.estimateRegular)return {kind:'unavailable',reason:'Championship forecast engine unavailable.'};
    const snapshots=[];
    for(const snap of timeline.timeline){
      const result=predictRegular(snap,forecaster,{seasonId:timeline.seasonId,
        regularWeekCount:timeline.regularWeekCount,samples});
      if(result.kind!=='estimate')return {kind:'unavailable',reason:result.reason||'Could not calculate historic odds.'};
      snapshots.push({id:snap.id,label:snap.label,shortLabel:snap.shortLabel,
        kind:snap.kind,weekNumber:snap.weekNumber,odds:result.titleOdds,
        samples:result.samples});
    }
    return {...timeline,kind:'ready',snapshots};
  }
  function postseasonInputs(timeline,data){
    if(timeline?.kind!=='ready'||timeline.weekCount!==timeline.regularWeekCount||
      !['live','complete'].includes(data?.settings?.status)||!Array.isArray(data?.entries)||
      data.entries.length!==8)return [];
    const seeds=data.entries.map(e=>({
      user_id:e.user_id,seed:Number(e.seed),
      starting_bonus:verified(e.starting_bonus)?Number(e.starting_bonus):BONUS[Number(e.seed)-1],
      current_total:verified(e.starting_bonus)?Number(e.starting_bonus):BONUS[Number(e.seed)-1],
      status:'active'
    }));
    if(seeds.some(e=>!e.user_id||!Number.isInteger(e.seed)||e.seed<1||e.seed>8||
      !Number.isFinite(e.starting_bonus)))return [];
    const points=[{id:'playoff-start',label:'Playoff start',shortLabel:'PO',kind:'playoff',
      entries:clone(seeds),state:null}];
    const officialRounds=(data.rounds||[]).filter(r=>r.status==='finalized')
      .slice().sort((a,b)=>Number(a.round_number)-Number(b.round_number));
    let prior=0;
    for(const round of officialRounds){
      if(Number(round.round_number)!==prior+1)break;
      const result=(data.history||[]).filter(h=>h.round_id===round.id);
      if(result.length!==Number(round.participants_before))break;
      const idMap=new Map(result.map(r=>[r.user_id,r]));
      if(idMap.size!==result.length||result.some(r=>!verified(r.cumulative_after)||!r.status_after))break;
      for(const e of seeds){
        const recorded=idMap.get(e.user_id);
        if(recorded){e.current_total=Number(recorded.cumulative_after);e.status=recorded.status_after;}
      }
      prior=Number(round.round_number);
      const isChamp=prior===4;
      points.push({
        id:'round:'+round.id,label:round.label||'Playoff round '+prior,
        shortLabel:'R'+prior,kind:isChamp?'official':'playoff',
        entries:clone(seeds),
        state:{settings:{status:isChamp?'complete':'live',champion_id:isChamp?
          seeds.find(e=>e.status==='champion')?.user_id:null},
          current:{round:{round_number:prior,status:'finalized',id:round.id}}}
      });
    }
    return points;
  }
  function predictPostseason(point,forecaster,history,{samples=1500,seasonId}={}){
    if(!forecaster?.estimatePlayoffs)return {kind:'unavailable',reason:'Playoff forecasts are unavailable.'};
    return forecaster.estimatePlayoffs({entries:point.entries,state:point.state,history,samples,
      seedKey:JSON.stringify(['historic-postseason-v1',seasonId,point.id,point.entries])});
  }
  return {buildTimeline,predictRegular,estimateTimeline,postseasonInputs,predictPostseason};
});