// Pure read-only advancement odds model. No changes to official scoring.
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayoffAdvancementModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const validNumber = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  function choices(q) {
    let a = q?.answer_options;
    if (typeof a === 'string') {try {a=JSON.parse(a);} catch {return [];} }
    return Array.isArray(a) ? a.filter(v => v !== null && v !== undefined) : [];
  }
  function hash(s) {let x=2166136261;for(const c of String(s||'')){x=Math.imul(x^c.charCodeAt(0),16777619);}return x>>>0;}
  function result(data, questions=[], picks=[], samples=5000) {
    const current=data?.current, round=current?.round, rows=current?.rows;
    if (!round || !Array.isArray(rows) || !rows.length) return {kind:'unavailable',reason:'The current playoff round is not ready.'};
    const cut=Number(round.participants_after), ids=rows.map(r=>r.user_id);
    if(!Number.isInteger(cut) || cut<1 || cut>rows.length || ids.some(id=>!id)) return {kind:'unavailable',reason:'Playoff round information is incomplete.'};
    if(round.status==='finalized') {
      return {kind:'official',roundId:round.id,weekId:round.week_id,remaining:0,samples:0,
        odds:Object.fromEntries(rows.map(r=>[r.user_id,r.advanced?100:0]))};
    }
    if(!current.locked) return {kind:'pending',reason:'Chances to advance appear after playoff picks lock.'};
    if(!Array.isArray(questions) || !Array.isArray(picks)) return {kind:'unavailable',reason:'Locked picks are not available.'};
    const scored=questions.filter(q=>q.counts_for_score!==false);
    const open=scored.filter(q=>q.result===null || q.result===undefined);
    if(scored.length!==Number(current.question_count) || open.length!==Number(current.question_count)-Number(current.decided_count))
      return {kind:'unavailable',reason:'Waiting for complete playoff question data.'};
    if(open.some(q=>choices(q).length===0))
      return {kind:'unavailable',reason:'Some remaining questions have no answer choices to simulate.'};
    if(!scored.length) return {kind:'unavailable',reason:'No scored playoff questions yet.'};
    const byUser=new Map(ids.map(id=>[id,new Map()]));
    for(const p of picks) if(byUser.has(p.user_id)) byUser.get(p.user_id).set(p.question_id,p.answer);
    const prepared=open.map(q=>{
      const options=choices(q);
      const credits=options.map(option=>ids.map((id,i)=>
        byUser.get(id).has(q.id) && equal(byUser.get(id).get(q.id),option) ? i : -1).filter(i=>i>=0));
      return {credits,count:options.length};
    });
    const actual=current.week?.tiebreaker_result;
    const tieKnown=validNumber(actual);
    const baseline=rows.map(r=>({
      id:r.user_id,base:Number(r.cumulative_after),seed:Number(r.seed),
      distance:tieKnown && validNumber(r.round_tiebreaker_answer) ? Math.abs(Number(r.round_tiebreaker_answer)-Number(actual)) : Infinity
    }));
    if(baseline.some(r=>!Number.isFinite(r.base))) return {kind:'unavailable',reason:'Playoff totals are still loading.'};
    let seed=hash(current.revision || round.id || ids.join(':'));const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const n=Math.max(100,Math.min(10000,Math.floor(samples)));
    const wins=Object.fromEntries(ids.map(id=>[id,0]));
    for(let trial=0;trial<n;trial++){
      const totals=baseline.map(r=>({id:r.id,total:r.base,seed:r.seed,distance:r.distance,tieDraw:random()}));
      for(const q of prepared){
        const choice=Math.floor(random()*q.count);
        for(const i of q.credits[choice]) totals[i].total++;
      }
      totals.sort((a,b)=>b.total-a.total ||
        (tieKnown ? a.distance-b.distance || a.seed-b.seed : a.tieDraw-b.tieDraw) || String(a.id).localeCompare(String(b.id)));
      for(let j=0;j<cut;j++) wins[totals[j].id]++;
    }
    const odds=Object.fromEntries(ids.map(id=>[id,Math.round(wins[id]/n*1000)/10]));
    return {kind:'estimate',roundId:round.id,weekId:round.week_id,remaining:open.length,
      samples:n,tieKnown,odds,assumption:'Each remaining question answer is equally likely. Unknown tiebreakers are split randomly when scores tie.'};
  }
  return {result,choices,equal};
});