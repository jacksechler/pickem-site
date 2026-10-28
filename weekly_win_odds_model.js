// Pure weekly-win simulation: placement depends on correct picks, then tiebreaker distance.
// Regular-season bonus points affect season totals, not who finishes first that week.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.WeeklyWinOddsModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const numeric=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  const decided=q=>q.result!==null&&q.result!==undefined;
  const locked=(w,now=Date.now())=>!!w&&(w.status==='published'||!!w.auto_locked_at||(Number.isFinite(Date.parse(w.lock_at))&&Date.parse(w.lock_at)<=now));
  function options(q){
    let raw=q?.answer_options;
    if(typeof raw==='string'){try{raw=JSON.parse(raw);}catch{return [];}}
    if(!Array.isArray(raw))return [];
    const unique=[];
    for(const x of raw)if(x!==null&&x!==undefined&&!unique.some(y=>same(x,y)))unique.push(x);
    return unique;
  }
  function hash(s){let n=2166136261;for(const c of String(s)){n=Math.imul(n^c.charCodeAt(0),16777619);}return n>>>0;}
  function result(bundle,samples=6000,now=Date.now()){
    const {week,questions,submissions,picks,officialScores}=bundle||{};
    if(!week||week.phase!=='regular')return {kind:'unavailable',reason:'Weekly win odds are for regular-season weeks.'};
    if(!locked(week,now))return {kind:'locked',reason:'Win probabilities unlock when this week’s picks lock.'};
    if(!Array.isArray(submissions)||!Array.isArray(questions)||!Array.isArray(picks))
      return {kind:'unavailable',reason:'Weekly picks and scores are still loading.'};
    const users=[...new Set(submissions.map(s=>s.user_id).filter(Boolean))].sort();
    if(users.length!==8 || submissions.length!==8)
      return {kind:'unavailable',reason:'Waiting for all eight submitted entries before estimating the winner.'};
    const submitted=new Map(submissions.map(s=>[s.user_id,s]));
    if(users.some(id=>!numeric(submitted.get(id)?.tiebreaker_answer)))
      return {kind:'unavailable',reason:'Waiting for complete tiebreaker entries.'};
    const scored=questions.filter(q=>q.counts_for_score!==false);
    if(!scored.length)return {kind:'unavailable',reason:'No scored questions are available for this week.'};
    if(week.status==='published'&&Array.isArray(officialScores)&&officialScores.length===8&&officialScores.every(s=>numeric(s.placement))){
      const map=new Map(officialScores.map(s=>[s.user_id,s]));
      if(users.every(id=>map.has(id))){
        const players=users.map(id=>({
          id,probability:Number(map.get(id).placement)===1?100:0,
          correct:Number(map.get(id).correct_count)||0,
          placement:Number(map.get(id).placement)
        })).sort((a,b)=>a.placement-b.placement||b.correct-a.correct||a.id.localeCompare(b.id));
        return {kind:'official',remaining:0,samples:0,players,weekId:week.id,assumption:'Official published placements. Shared first-place ties are all winners.'};
      }
    }
    const byId=new Map(users.map(id=>[id,new Map()]));
    for(const p of picks)if(byId.has(p.user_id))byId.get(p.user_id).set(p.question_id,p.answer);
    const known=scored.filter(decided);
    const open=scored.filter(q=>!decided(q));
    const prepared=[];
    for(const q of open){
      const opts=options(q);
      if(!opts.length)return {kind:'unavailable',reason:'A remaining scored question has no choices to simulate.'};
      prepared.push(opts.map(answer=>users.map((id,i)=>byId.get(id).has(q.id)&&same(byId.get(id).get(q.id),answer)?i:-1).filter(i=>i>=0)));
    }
    const initial=users.map(id=>known.reduce((sum,q)=>sum+(byId.get(id).has(q.id)&&same(byId.get(id).get(q.id),q.result)?1:0),0));
    const actualKnown=numeric(week.tiebreaker_result);
    const distance=users.map(id=>actualKnown?Math.abs(Number(submitted.get(id).tiebreaker_answer)-Number(week.tiebreaker_result)):Infinity);
    const maxNow=Math.max(...initial);
    if(!open.length&&!actualKnown&&initial.filter(n=>n===maxNow).length>1)
      return {kind:'pending',reason:'All results are in, but the actual tiebreaker is needed to determine the winner.'};
    const victories=Array(users.length).fill(0);
    const count=open.length?Math.max(100,Math.min(15000,Math.floor(samples))):1;
    const fingerprint=JSON.stringify([week.id,week.tiebreaker_result,scored.map(q=>[q.id,q.result]),picks.map(p=>[p.user_id,p.question_id,p.answer]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))]);
    let seed=hash(fingerprint);
    const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    for(let run=0;run<count;run++){
      const totals=initial.slice();
      for(const possible of prepared){
        const chosen=possible[Math.floor(rand()*possible.length)];
        for(const i of chosen)totals[i]++;
      }
      const high=Math.max(...totals);
      const tied=[];
      totals.forEach((v,i)=>{if(v===high)tied.push(i);});
      let winners=tied;
      if(actualKnown){
        const best=Math.min(...tied.map(i=>distance[i]));
        winners=tied.filter(i=>distance[i]===best);
      }
      const credit=actualKnown?1:1/winners.length;
      for(const i of winners)victories[i]+=credit;
    }
    const players=users.map((id,i)=>({
      id,probability:Math.round(victories[i]/count*1000)/10,
      correct:initial[i],tiebreaker_answer:Number(submitted.get(id).tiebreaker_answer)
    })).sort((a,b)=>b.probability-a.probability||b.correct-a.correct||a.id.localeCompare(b.id));
    return {kind:'estimate',weekId:week.id,remaining:open.length,decided:known.length,total:scored.length,
      samples:count,actualKnown,players,
      assumption:'Remaining listed answers are simulated as equally likely. Unknown actual tiebreakers split tied scenarios evenly; exact known tiebreaker ties may share first place.'};
  }
  return {result,options,locked,same};
});