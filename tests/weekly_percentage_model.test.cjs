const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../weekly_percentage_model.js');
const bundle={week:{id:M.WEEK},submissions:[{user_id:'a'},{user_id:'b'}],questions:[{id:'done',result:'A'},{id:'next',result:null,answer_options:['A','B']},{id:'bonus',result:'A',counts_for_score:false}],picks:[{user_id:'a',question_id:'done',answer:'A'},{user_id:'b',question_id:'done',answer:'B'},{user_id:'a',question_id:'next',answer:'A'},{user_id:'b',question_id:'next',answer:'A'},{user_id:'missing',question_id:'done',answer:'A'}]};
test('combined percentage and next-result scenarios use submitted entries and scored questions',()=>{
 const r=M.calculate(bundle);assert.equal(r.correct,1);assert.equal(r.total,2);
 assert.deepEqual(r.scenarios.map(s=>[s.correct,s.total]),[[3,4],[1,4]]);
 assert.equal(r.players.length,2);
});
test('tracker is restricted to Week 12 and handles no scored results',()=>{
 assert.equal(M.calculate({...bundle,week:{id:'other'}}),null);
 const r=M.calculate({...bundle,questions:[bundle.questions[1]]});assert.equal(r.total,0);assert.equal(r.correct,0);
});
