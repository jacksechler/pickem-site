const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../championship_odds_model.js');
const ids=Array.from({length:8},(_,i)=>'member-'+i);
const players=ids.map((id,i)=>({id,total:60-i,correct:50-i,wins:2}));
const entries=ids.map((user_id,i)=>({user_id,seed:i+1,status:'active',starting_bonus:M.BONUS[i],current_total:M.BONUS[i]}));
const history=ids.map((user_id,i)=>({user_id,week_id:'week-1',total_points:10+i,
  correct_count:8+(i%3),question_count:16,placement:i+1}));
const totalOdds=map=>Object.values(map).reduce((a,b)=>a+b,0);
function state(round=1,locked=true,finalized=false,questionCount=1,decided=0){
  return {settings:{status:'live'},current:{
    round:{id:'round-'+round,week_id:'playoff-week',round_number:round,
      status:finalized?'finalized':'live',participants_before:[8,6,4,2][round-1],
      participants_after:[6,4,2,1][round-1]},
    locked,revision:'revision',question_count:questionCount,decided_count:decided,
    week:{id:'playoff-week',tiebreaker_result:null},
    rows:entries.map(e=>({user_id:e.user_id,seed:e.seed,cumulative_after:e.current_total}))
  }};
}
test('seed bonus schedule matches the official competition',()=>{
  assert.deepEqual(M.BONUS,[10,8,7,5,4,3,2,0]);
  assert.deepEqual(M.CUTS,[6,4,2,1]);
});
test('championship chances exist before any regular-season cards are published',()=>{
  const o=M.estimateRegular({players:players.map(p=>({...p,total:0,correct:0,wins:0})),remainingWeeks:20,samples:1800});
  assert.equal(o.kind,'estimate');
  assert.equal(o.weeksRemaining,20);
  assert.ok(Math.abs(totalOdds(o.titleOdds)-100)<1);
  assert.equal(Object.keys(o.seedOdds).length,8);
  for(const id of ids)assert.ok(o.titleOdds[id]>=0&&o.titleOdds[id]<=100);
});
test('regular-season odds account for scores and all remaining weeks',()=>{
  const o=M.estimateRegular({players,history,remainingWeeks:4,samples:1500});
  assert.equal(o.kind,'estimate');
  assert.equal(o.weeksRemaining,4);
  assert.ok(Math.abs(totalOdds(o.titleOdds)-100)<1);
  for(const id of ids)assert.ok(Math.abs(totalOdds(o.seedOdds[id])-100)<1);
});
test('full playoff field has a championship forecast before its first card',()=>{
  const o=M.estimatePlayoffs({entries,history,samples:1500});
  assert.equal(o.kind,'estimate');
  assert.equal(o.advanceOdds,null);
  assert.ok(Math.abs(totalOdds(o.titleOdds)-100)<1);
});
test('pre-lock title odds do not require or reveal private picks',()=>{
  const o=M.estimatePlayoffs({entries,history,state:state(1,false,false,12),samples:1500});
  assert.equal(o.kind,'estimate');
  assert.equal(o.advanceOdds,null);
  assert.ok(Math.abs(totalOdds(o.titleOdds)-100)<1);
});
test('locked current round uses shared unresolved outcomes for everyone',()=>{
  const qs=[{id:'game',counts_for_score:true,answer_options:['A','B'],result:null}];
  const ps=ids.map((user_id,i)=>({user_id,question_id:'game',answer:i%2?'A':'B'}));
  const o=M.estimatePlayoffs({entries,history,state:state(),questions:qs,picks:ps,samples:2000});
  assert.equal(o.kind,'estimate');
  assert.ok(Math.abs(totalOdds(o.advanceOdds)-600)<1);
  assert.ok(Math.abs(totalOdds(o.titleOdds)-100)<1);
  for(const id of ids)assert.ok(o.titleOdds[id]<=o.advanceOdds[id]+0.11,'Cannot win the title without advancing this round');
});
test('the next playoff round includes only the six real survivors',()=>{
  const after=entries.map((e,i)=>({...e,status:i>=6?'eliminated':'active'}));
  const o=M.estimatePlayoffs({entries:after,history,state:state(1,true,true,1,1),samples:1800});
  assert.equal(o.kind,'estimate');
  assert.equal(o.titleOdds[ids[6]],0);
  assert.equal(o.titleOdds[ids[7]],0);
  assert.ok(Math.abs(totalOdds(o.titleOdds)-100)<1);
});
test('published champion is certain and eliminated members cannot win',()=>{
  const confirmed=entries.map((e,i)=>({...e,status:i===3?'champion':'eliminated'}));
  const o=M.estimatePlayoffs({entries:confirmed,state:{settings:{status:'complete',champion_id:ids[3]}}});
  assert.equal(o.kind,'official');
  assert.equal(o.titleOdds[ids[3]],100);
  assert.equal(totalOdds(o.titleOdds),100);
});
test('a locked card without readable picks never invents title chances',()=>{
  const o=M.estimatePlayoffs({entries,state:state(),history});
  assert.equal(o.kind,'unavailable');
});
test('future card sizes can be configured without altering the cut rules',()=>{
  const o=M.estimatePlayoffs({entries,history,roundQuestionCounts:[4,7,9,13],samples:200});
  assert.deepEqual(o.assumedRoundCounts,[4,7,9,13]);
  assert.deepEqual(M.CUTS,[6,4,2,1]);
});
