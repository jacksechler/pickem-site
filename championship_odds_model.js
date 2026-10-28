// Championship forecast: read-only Monte Carlo using official postseason cuts and seed bonuses.
// Assumptions are estimates, not official scoring or an external prediction service.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ChampionshipOddsModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const BONUS=[10,8,7,5,4,3,2,0];
  const CUTS=[6,4,2,1];
  const DEFAULT_ROUND_QUESTIONS=[16,16,20,20]; // Future cards do not yet have known picks.
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const numeric=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  const asNumber=(v,defaultValue=0)=>numeric(v)?Number(v):defaultValue;
  function options(q){
    let values=q?.answer_options;
    if(typeof values==='string'){try{values=JSON.parse(values);}catch{return [];}}
    if(!Array.isArray(values))return [];
    const result=[];
    for(const v of values)if(v!==null&&v!==undefined&&!result.some(x=>same(x,v)))result.push(v);
    return result;
  }
  function hash(v){
    let n=2166136261;for(const c of String(v||'pickem'))n=Math.imul(n^c.charCodeAt(0),16777619);
    return n>>>0;
  }
  function prng(seedText){
    let seed=hash(seedText);return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  }
  function gaussian(random){
    return Math.sqrt(-2*Math.log(Math.max(0.000001,random())))*Math.cos(2*Math.PI*random());
  }
  function skillRates(ids,history=[]){
    const valid=history.filter(s=>Number(s.question_count)>0&&Number.isFinite(Number(s.correct_count))&&Number(s.correct_count)>=0);
    const allCorrect=valid.reduce((t,s)=>t+Number(s.correct_count),0);
    const allQuestions=valid.reduce((t,s)=>t+Number(s.question_count),0);
    const average=allQuestions?allCorrect/allQuestions:0.5;
    const rates={};
    for(const id of ids){
      const rows=valid.filter(s=>s.user_id===id);
      const correct=rows.reduce((t,s)=>t+Number(s.correct_count),0);
      const total=rows.reduce((t,s)=>t+Number(s.question_count),0);
      // Shrink toward the league-average accuracy so one great week cannot dominate.
      rates[id]=Math.max(0.18,Math.min(0.82,(correct+average*30)/(total+30)));
    }
    return rates;
  }
  function sortForCut(players,actualTiebreaker,random){
    // An entered tiebreaker uses distance, then frozen seed. Future unknown
    // tiebreakers are simulated; they never alter the official winner.
    return players.sort((a,b)=>b.total-a.total||
      (actualTiebreaker&&a.distance!==b.distance?a.distance-b.distance:0)||
      (!actualTiebreaker?a.tieRandom-b.tieRandom:a.seed-b.seed)||
      String(a.id).localeCompare(String(b.id)));
  }
  function simulateFutureRounds(field,startRound,random,rates,roundQuestionCounts){
    let survivors=field.map(p=>({id:p.id,seed:p.seed,total:p.total}));
    for(let round=startRound;round<=4;round++){
      const count=roundQuestionCounts[round-1];
      const ranked=survivors.map(p=>{
        let correct=0;
        const chance=rates[p.id]??0.5;
        for(let q=0;q<count;q++)if(random()<chance)correct++;
        return {...p,total:p.total+correct,tieRandom:random()};
      });
      sortForCut(ranked,false,random);
      survivors=ranked.slice(0,CUTS[round-1]).map(p=>({id:p.id,seed:p.seed,total:p.total}));
    }
    return survivors[0]?.id||null;
  }
  function normalizeCounts(counts){
    return DEFAULT_ROUND_QUESTIONS.map((defaultCount,i)=>{
      const number=Number(counts?.[i]);
      return Number.isInteger(number)&&number>0?Math.min(60,number):defaultCount;
    });
  }
  function estimatePlayoffs({entries=[],state=null,history=[],roundQuestionCounts=null,samples=3500,seedKey=''}={}){
    const knownIds=entries.map(e=>e.user_id||e.id);
    if(!entries.length||new Set(knownIds).size!==knownIds.length||knownIds.some(x=>!x))
      return {kind:'unavailable',reason:'Waiting for the complete championship field.'};
    const complete=state?.settings?.status==='complete';
    const champion=entries.find(e=>e.status==='champion'||e.user_id===state?.settings?.champion_id&&complete);
    const zeroOdds=Object.fromEntries(knownIds.map(id=>[id,0]));
    if(complete||champion){
      if(!champion)return {kind:'unavailable',reason:'Waiting for the confirmed champion.'};
      return {kind:'official',titleOdds:{...zeroOdds,[champion.user_id||champion.id]:100},
        samples:0,advanceOdds:null,assumption:'Official championship result.'};
    }
    let current=state?.current||null;
    const roundNumber=Number(current?.round?.round_number)||0;
    const finalized=current?.round?.status==='finalized';
    const roundToSimulate=roundNumber?(finalized?roundNumber+1:roundNumber):1;
    if(roundToSimulate>4)return {kind:'unavailable',reason:'Waiting for the championship to be finalized.'};
    const active=entries.filter(e=>!e.status||e.status==='active');
    if(active.length!==[8,8,6,4,2][roundToSimulate-1] && !(roundNumber&&!finalized&&active.length===current?.round?.participants_before)){
      return {kind:'unavailable',reason:'The playoff field is being updated.'};
    }
    const rates=skillRates(knownIds,history);
    const counts=normalizeCounts(roundQuestionCounts);
    const n=Math.max(200,Math.min(8000,Math.floor(samples)));
    const random=prng(seedKey||JSON.stringify([knownIds,roundNumber,current?.revision,active.map(e=>[e.user_id||e.id,e.current_total,e.starting_bonus])]));
    const titleWins={...zeroOdds};
    const advanceWins={...zeroOdds};
    const locked=!!current?.locked;
    const liveRound=!!roundNumber&&!finalized;
    const useLocked=liveRound&&locked;
    const rows=Array.isArray(current?.rows)?new Map(current.rows.map(row=>[row.user_id,row])):new Map();
    const activeIds=active.map(e=>e.user_id||e.id);
    const base=active.map(e=>{
      const id=e.user_id||e.id;
      const row=rows.get(id);
      const actual=useLocked?asNumber(row?.cumulative_after,NaN):NaN;
      const fallback=asNumber(e.current_total,asNumber(e.starting_bonus,asNumber(BONUS[Number(e.seed)-1])));
      return {id,seed:Number(e.seed)||8,total:Number.isFinite(actual)?actual:fallback,
        distance:current&&numeric(current.week?.tiebreaker_result)&&numeric(row?.round_tiebreaker_answer)
          ?Math.abs(Number(current.week.tiebreaker_result)-Number(row.round_tiebreaker_answer)):Infinity};
    });
    if(base.some(x=>!Number.isFinite(x.total)))return {kind:'unavailable',reason:'Waiting for championship point totals.'};
    let unresolved=[];
    if(useLocked){
      if(!Array.isArray(arguments[0].questions)||!Array.isArray(arguments[0].picks))
        return {kind:'unavailable',reason:'Waiting for locked playoff picks.'};
      const scored=arguments[0].questions.filter(q=>q.counts_for_score!==false);
      if(scored.length!==Number(current.question_count))
        return {kind:'unavailable',reason:'Current playoff questions are still loading.'};
      unresolved=scored.filter(q=>q.result===null||q.result===undefined);
      if(unresolved.length!==Number(current.question_count)-Number(current.decided_count))
        return {kind:'unavailable',reason:'Current playoff scores are still updating.'};
      const picksByUser=new Map(activeIds.map(id=>[id,new Map()]));
      for(const p of arguments[0].picks){
        if(picksByUser.has(p.user_id))picksByUser.get(p.user_id).set(p.question_id,p.answer);
      }
      unresolved=unresolved.map(q=>{
        const opts=options(q);
        if(!opts.length)return null;
        const credited=opts.map(option=>base.map((r,i)=>
          picksByUser.get(r.id).has(q.id)&&same(picksByUser.get(r.id).get(q.id),option)?i:-1).filter(i=>i>=0));
        return {credited,choices:opts.length};
      });
      if(unresolved.some(x=>x===null))return {kind:'unavailable',reason:'A remaining playoff question has no answer choices.'};
    }
    const knownTie=useLocked&&numeric(current?.week?.tiebreaker_result);
    const activeCount=Math.max(0,roundNumber&&!finalized?Number(current?.question_count):0);
    for(let t=0;t<n;t++){
      let contestants=base.map(x=>({...x,tieRandom:random()}));
      if(liveRound){
        if(useLocked){
          for(const q of unresolved){
            const outcome=q.credited[Math.floor(random()*q.choices)];
            for(const i of outcome)contestants[i].total++;
          }
        }else{
          // Before the lock no picks are read. Simulate this entire unknown card.
          const count=activeCount||counts[roundNumber-1];
          for(const p of contestants)for(let j=0;j<count;j++)if(random()<(rates[p.id]??0.5))p.total++;
        }
        sortForCut(contestants,knownTie,random);
        contestants=contestants.slice(0,CUTS[roundNumber-1]);
        for(const p of contestants)advanceWins[p.id]++;
        if(roundNumber===4){titleWins[contestants[0].id]++;continue;}
      }
      const next=roundNumber?(liveRound?roundNumber+1:roundNumber+1):1;
      const championId=simulateFutureRounds(contestants,next,random,rates,counts);
      if(championId)titleWins[championId]++;
    }
    const titleOdds=Object.fromEntries(knownIds.map(id=>[id,Math.round(titleWins[id]*1000/n)/10]));
    const advanceOdds=liveRound&&locked?Object.fromEntries(knownIds.map(id=>[id,Math.round(advanceWins[id]*1000/n)/10])):null;
    return {kind:'estimate',titleOdds,advanceOdds,samples:n,roundsLeft:5-roundToSimulate,
      assumedRoundCounts:counts,remainingCurrentQuestions:useLocked?unresolved.length:null,
      assumption:'Unknown future card results use historical pick accuracy. Future question counts are estimates; unentered tiebreakers are simulated.'};
  }
  function estimateRegular({players=[],history=[],remainingWeeks=20,roundQuestionCounts=null,samples=3500,seedKey=''}={}){
    if(players.length!==8||new Set(players.map(p=>p.id)).size!==8||players.some(p=>!p.id))
      return {kind:'unavailable',reason:'Waiting for all eight league members.'};
    const ids=players.map(p=>p.id);
    const rows=Array.isArray(history)?history:[];
    const globalPoints=rows.map(r=>Number(r.total_points)).filter(Number.isFinite);
    const leagueAverage=globalPoints.length?globalPoints.reduce((s,x)=>s+x,0)/globalPoints.length:11;
    const rates=skillRates(ids,rows);
    const historyById=new Map(ids.map(id=>[id,rows.filter(r=>r.user_id===id&&Number.isFinite(Number(r.total_points)))]));
    const rng=prng(seedKey||JSON.stringify([players.map(p=>[p.id,p.total,p.correct,p.wins]),remainingWeeks,rows.map(r=>[r.week_id,r.user_id,r.total_points])]));
    const weeks=Math.min(25,Math.max(0,Math.floor(remainingWeeks)));
    const counts=normalizeCounts(roundQuestionCounts);
    const n=Math.max(200,Math.min(8000,Math.floor(samples)));
    const seedWins=Object.fromEntries(ids.map(id=>[id,Array(8).fill(0)]));
    const titleWins=Object.fromEntries(ids.map(id=>[id,0]));
    for(let trial=0;trial<n;trial++){
      const totals=players.map(p=>({id:p.id,total:asNumber(p.total,0),correct:asNumber(p.correct,0),
        wins:asNumber(p.wins,0),tieRandom:rng()}));
      for(let w=0;w<weeks;w++){
        const weekScoring=[];
        for(const member of totals){
          const own=historyById.get(member.id);
          const source=own.length&&rng()<own.length/(own.length+3)
            ?own[Math.floor(rng()*own.length)]
            :rows.length?rows[Math.floor(rng()*rows.length)]:null;
          const base=source?Number(source.total_points):leagueAverage;
          const projected=Math.max(0,Math.round((base+gaussian(rng)*2.5)*2)/2);
          const qCount=source&&Number(source.question_count)>0?Number(source.question_count):16;
          const p=source&&Number.isFinite(Number(source.correct_count))
            ?Math.max(0,Math.min(qCount,Number(source.correct_count)/Math.max(1,qCount))):rates[member.id];
          member.total+=projected;
          member.correct+=Math.round(p*qCount);
          weekScoring.push({member,points:projected});
        }
        const leader=Math.max(...weekScoring.map(v=>v.points));
        weekScoring.filter(v=>v.points===leader).forEach(v=>v.member.wins++);
      }
      totals.sort((a,b)=>b.total-a.total||b.correct-a.correct||b.wins-a.wins||a.tieRandom-b.tieRandom);
      const field=totals.map((p,i)=>{
        seedWins[p.id][i]++;
        return {id:p.id,seed:i+1,total:BONUS[i]};
      });
      const winner=simulateFutureRounds(field,1,rng,rates,counts);
      if(winner)titleWins[winner]++;
    }
    return {kind:'estimate',titleOdds:Object.fromEntries(ids.map(id=>[id,Math.round(titleWins[id]*1000/n)/10])),
      seedOdds:Object.fromEntries(ids.map(id=>[id,seedWins[id].map(c=>Math.round(c*1000/n)/10)])),
      samples:n,weeksRemaining:weeks,assumedRoundCounts:counts,
      assumption:'Future regular weeks are modeled from league scoring history. All eight qualify; only their starting seed bonuses differ. Future playoff picks use historical accuracy.'};
  }
  return {estimatePlayoffs,estimateRegular,skillRates,options,BONUS,CUTS,DEFAULT_ROUND_QUESTIONS};
});