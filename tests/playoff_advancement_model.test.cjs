const test=require('node:test');
const assert=require('node:assert/strict');
const model=require('../playoff_advancement_model.js');
const make=(rows,{locked=true,finalized=false,options=['Home','Away'],decided=0,actual=null}={})=>({
  current:{
    round:{id:'round-1',week_id:'week-1',participants_after:1,status:finalized?'finalized':'live'},
    rows,locked,week:{id:'week-1',tiebreaker_result:actual},
    revision:'test-round',question_count:1,decided_count:decided
  }
});
const rows=(a=5,b=5)=>[
  {user_id:'a',seed:1,cumulative_after:a,round_tiebreaker_answer:21,advanced:true},
  {user_id:'b',seed:2,cumulative_after:b,round_tiebreaker_answer:40,advanced:false}
];
const open=[{id:'q1',counts_for_score:true,result:null,answer_options:['Home','Away']}];
const picks=[{user_id:'a',question_id:'q1',answer:'Home'},{user_id:'b',question_id:'q1',answer:'Away'}];
test('never projects private picks before lock',()=>{
  assert.equal(model.result(make(rows(),{locked:false})).kind,'pending');
});
test('simulates the same unresolved result for all players',()=>{
  const o=model.result(make(rows()),open,picks,5000);
  assert.equal(o.kind,'estimate');
  assert.ok(o.odds.a>45&&o.odds.a<55);
  assert.equal(Math.round(o.odds.a+o.odds.b),100);
});
test('a mathematically uncatchable lead is 100 percent',()=>{
  const o=model.result(make(rows(7,5)),open,picks);
  assert.equal(o.odds.a,100);
  assert.equal(o.odds.b,0);
});
test('actual tiebreaker distance decides a tied final score',()=>{
  const q=[{...open[0],result:'Home'}];
  const o=model.result(make(rows(5,5),{decided:1,actual:40}),q,picks);
  assert.equal(o.odds.a,0);
  assert.equal(o.odds.b,100);
});
test('an unresolved boundary tiebreaker is explicitly estimated',()=>{
  const q=[{...open[0],result:'Home'}];
  const o=model.result(make(rows(5,5),{decided:1}),q,picks);
  assert.equal(o.kind,'estimate');
  assert.equal(o.tieKnown,false);
  assert.ok(o.odds.a>45&&o.odds.a<55);
});
test('finalized results override simulations',()=>{
  const o=model.result(make(rows(),{finalized:true}));
  assert.deepEqual(o.odds,{a:100,b:0});
  assert.equal(o.kind,'official');
});
test('missing scored answer choices prevents misleading probabilities',()=>{
  const o=model.result(make(rows()),[{...open[0],answer_options:[]}],picks);
  assert.equal(o.kind,'unavailable');
});
test('missing scored question rows prevents misleading probabilities',()=>{
  const o=model.result(make(rows()),[],picks);
  assert.equal(o.kind,'unavailable');
});