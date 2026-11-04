const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../commissioner_hq_model.js');
const members=Array.from({length:8},(_,i)=>({user_id:'p'+i,
  display_name:'Member '+(i+1),submitted:true,complete:true,picks:12,expected_picks:12}));
function diag({locked=true,published=false}={}){
  return {
    week:{id:'w2',name:'Week 2',status:published?'published':'draft',
      locked,tiebreaker_result_saved:true},
    league:{members:8,commissioners:1,active_weeks:1},
    entries:{submitted:8,required:8,pick_rows:96,players:members.map(p=>({...p}))},
    questions:{scored:12,decided:12,result_ordered:12,result_order_distinct:12,
      result_order_min:1,result_order_max:12},
    scores:{rows:published?8:0,expected_when_published:8}
  };
}
test('locked, complete week is ready for commissioner review, not automatically published',()=>{
 const result=M.analyze(diag(),[]);
 assert.equal(result.kind,'ready');
 assert.equal(result.readiness,'ready');
 assert.equal(result.published,false);
 assert.equal(result.checks.length,4);
 assert.ok(result.checks.every(c=>c.passed));
 assert.equal(result.metrics[0].value,'8/8');
});
test('open card does not claim scores can be published',()=>{
 const result=M.analyze(diag({locked:false}));
 assert.equal(result.readiness,'open');
 assert.ok(result.reasons.some(r=>/still open/i.test(r)));
});
test('missing and incomplete submissions are shown without their choices',()=>{
 const d=diag();
 d.entries.submitted=6;
 d.entries.players[0].submitted=false;
 d.entries.players[0].complete=false;
 d.entries.players[0].picks=5;
 const result=M.analyze(d);
 assert.equal(result.readiness,'attention');
 assert.equal(result.failed[0].name,'Member 1');
 assert.equal(result.failed[0].picks,5);
 assert.equal(result.failed[0].submitted,false);
 assert.equal(JSON.stringify(result).includes('answer'),false);
});
test('unscored questions, missing order and tiebreaker prevent ready status',()=>{
 const d=diag();
 d.questions.decided=10;d.questions.result_ordered=9;d.questions.result_order_distinct=8;
 d.week.tiebreaker_result_saved=false;
 const result=M.analyze(d);
 assert.equal(result.readiness,'attention');
 assert.equal(result.checks.filter(c=>!c.passed).length,3);
});
test('published result missing a final score row must show attention',()=>{
 const d=diag({published:true});d.scores.rows=7;
 const result=M.analyze(d);
 assert.equal(result.readiness,'attention');
 assert.ok(result.reasons.some(r=>/8 official score rows/.test(r)));
});
test('published complete scorecard is verified and not falsely treated as pending',()=>{
 const result=M.analyze(diag({published:true}));
 assert.equal(result.readiness,'published');
 assert.equal(result.published,true);
});
test('missing diagnostic RPC result fails closed',()=>{
 const result=M.analyze(null);
 assert.equal(result.kind,'unavailable');
 assert.equal(result.readiness,'unknown');
 assert.equal(result.checks.length,0);
});
test('audit log uses only recorded action summaries, never raw details',()=>{
 const log=[
  {created_at:'2026-11-02T01:00:00Z',action_type:'question_edit',
   summary:'Fixed question label',details:{answer:'private',endpoint:'secret'}},
  {created_at:'2026-11-03T01:00:00Z',action_type:'week_publish',summary:'Week published'},
  {created_at:null,action_type:'question_edit',summary:'broken'}
 ];
 const result=M.analyze(diag(),log);
 assert.equal(result.activity.length,2);
 assert.equal(result.activity[0].actionType,'week_publish');
 assert.equal(result.activity[1].summary,'Fixed question label');
 assert.equal(JSON.stringify(result).includes('private'),false);
 assert.equal(JSON.stringify(result).includes('secret'),false);
});
test('activity log unavailable is distinct from empty log',()=>{
 const result=M.analyze(diag(),[],{auditAvailable:false});
 assert.equal(result.auditAvailable,false);
 assert.equal(result.metrics[3].value,'Unavailable');
});
test('export includes only officially published weeks and approved records',()=>{
 const base={
  seasonId:'s1',
  weeks:[
   {id:'w1',season_id:'s1',name:'Week 1',number:1,status:'published',
     phase:'regular',published_at:'2026-11-01',tiebreaker_result:58},
   {id:'w2',season_id:'s1',name:'Week 2',number:2,status:'draft',phase:'regular'},
   {id:'other',season_id:'s2',name:'Other',number:1,status:'published',phase:'regular'}
  ],
  profiles:[{id:'p0',display_name:'Member 1',username:'member1',password:'never'}],
  questions:[
    {id:'q1',week_id:'w1',prompt:'Question?',result:'A'},
    {id:'q2',week_id:'w2',prompt:'Private upcoming question',result:null},
    {id:'q3',week_id:'other',prompt:'Unrelated season',result:'B'}
  ],
  scores:[
    {week_id:'w1',user_id:'p0',total_points:12,correct_count:8},
    {week_id:'w2',user_id:'p0',total_points:99,correct_count:30},
    {week_id:'other',user_id:'p0',total_points:33,correct_count:5}
  ],
  picks:[{user_id:'p0',answer:'private'}],
  push_subscriptions:[{endpoint:'private'}]
 };
 const data=M.summarizeArchive(base);
 assert.ok(M.validateArchive(data));
 assert.equal(data.published_weeks.length,1);
 assert.equal(data.published_questions.length,1);
 assert.equal(data.published_scores.length,1);
 assert.equal(data.members[0].display_name,'Member 1');
 assert.equal(JSON.stringify(data).includes('Private upcoming question'),false);
 assert.equal(JSON.stringify(data).includes('password'),false);
 assert.equal(JSON.stringify(data).includes('username'),false);
 assert.equal(JSON.stringify(data).includes('endpoint'),false);
 assert.equal(JSON.stringify(data).includes('private'),true); // in the explanatory note only
});
test('export verifier rejects private picks or a draft card',()=>{
 const base=M.summarizeArchive({weeks:[],scores:[],questions:[],profiles:[]});
 assert.ok(M.validateArchive(base));
 assert.equal(M.validateArchive({...base,picks:[]}),false);
 assert.equal(M.validateArchive({...base,published_weeks:[{id:'x',status:'draft'}]}),false);
});
