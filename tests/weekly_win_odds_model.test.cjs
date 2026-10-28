const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../weekly_win_odds_model.js');
const ids=Array.from({length:8},(_,i)=>'user-'+i);
const subscriptions=ids.map((user_id,i)=>({user_id,tiebreaker_answer:i*5}));
const questions=[{id:'a',counts_for_score:true,result:null,answer_options:['Yes','No']},{id:'b',counts_for_score:true,result:null,answer_options:['Yes','No']}];
const picks=ids.flatMap((user_id,i)=>questions.map(q=>({user_id,question_id:q.id,answer:i<4?'Yes':'No'})));
const week=(changes={})=>({id:'week-9',phase:'regular',name:'Week 9',status:'active',lock_at:'2026-01-01T00:00:00Z',tiebreaker_result:null,...changes});
const bundle=(changes={})=>({week:week(),questions,submissions:subscriptions,picks,officialScores:[],...changes});
test('odds are withheld before lock',()=>{
  assert.equal(M.result(bundle({week:week({lock_at:'2099-01-01T00:00:00Z'})})).kind,'locked');
});
test('top-three odds come from shared game outcomes, never independent player rolls',()=>{
  const output=M.result(bundle(),5000);
  assert.equal(output.kind,'estimate');
  assert.equal(output.players.length,8);
  assert.ok(output.players.every(p=>p.probability>=0&&p.probability<=100));
  assert.ok(Math.abs(output.players.reduce((n,p)=>n+p.probability,0)-100)<1);
  assert.equal(output.remaining,2);
  assert.ok(output.players[0].probability>=output.players[1].probability);
});
test('a known tiebreaker decides tied correct-pick totals',()=>{
  const output=M.result(bundle({week:week({tiebreaker_result:0}),questions:questions.map(q=>({...q,result:'Yes'}))}));
  assert.equal(output.kind,'estimate');
  assert.equal(output.players[0].id,'user-0');
  assert.equal(output.players[0].probability,100);
});
test('when results finish tied without an actual tiebreaker, no false odds are shown',()=>{
  const output=M.result(bundle({questions:questions.map(q=>({...q,result:'Yes'}))}));
  assert.equal(output.kind,'pending');
});
test('a single correct-pick leader has a confirmed win even before the actual tiebreaker',()=>{
  const q=[{...questions[0],result:'Yes'}];
  const updatedPicks=ids.flatMap((user_id,i)=>[{user_id,question_id:'a',answer:i===0?'Yes':'No'}]);
  const output=M.result(bundle({questions:q,picks:updatedPicks}));
  assert.equal(output.kind,'estimate');
  assert.equal(output.players[0].id,'user-0');
  assert.equal(output.players[0].probability,100);
});
test('official published placements replace simulations, including golf-style ties',()=>{
  const officialScores=ids.map((user_id,i)=>({user_id,placement:i<2?1:i+1,correct_count:2}));
  const output=M.result(bundle({week:week({status:'published'}),officialScores}));
  assert.equal(output.kind,'official');
  assert.equal(output.players[0].probability,100);
  assert.equal(output.players[1].probability,100);
  assert.equal(output.players[2].probability,0);
});
test('missing or incomplete entries do not produce misleading percentages',()=>{
  assert.equal(M.result(bundle({submissions:subscriptions.slice(1)})).kind,'unavailable');
  assert.equal(M.result(bundle({questions:[{...questions[0],answer_options:[]}]})).kind,'unavailable');
});
test('playoff weeks use advancement odds instead of weekly-win odds',()=>{
  assert.equal(M.result(bundle({week:week({phase:'playoff'})})).kind,'unavailable');
});
test('scoreless or unscored-only cards do not produce odds',()=>{
  assert.equal(M.result(bundle({questions:[{...questions[0],counts_for_score:false}]})).kind,'unavailable');
});
