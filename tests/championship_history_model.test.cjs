const test=require('node:test');
const assert=require('node:assert/strict');
const History=require('../championship_history_model.js');
const Crown=require('../championship_odds_model.js');
const ids=Array.from({length:8},(_,i)=>'player-'+i);
const profiles=ids.map((id,i)=>({id,display_name:'Member '+(i+1)}));
const week=(number,status='published')=>({
  id:'week-'+number,season_id:'season-2026',name:'Week '+number,
  number,status
});
const scores=number=>ids.map((user_id,i)=>({
  user_id,week_id:'week-'+number,placement:i+1,
  total_points:14+(number*3+i)%8,correct_count:8+(i+number)%4,question_count:15
}));
function t(weeks=[week(1),week(2)],results=[...scores(1),...scores(2)]){
  return History.buildTimeline({profiles,weeks,scores:results,seasonId:'season-2026'});
}
test('reconstructs Week 0 and each published week in chronological order',()=>{
  const x=t();
  assert.equal(x.kind,'ready');
  assert.deepEqual(x.timeline.map(p=>p.shortLabel),['Start','W1','W2']);
  assert.deepEqual(x.timeline.map(p=>p.history.length),[0,8,16]);
  assert.equal(x.timeline[0].players.length,8);
  assert.ok(x.timeline[0].players.every(p=>p.total===0&&p.correct===0&&p.wins===0));
});
test('does not include any unfinalized results in historical checkpoints',()=>{
  const x=t([week(1),week(2),week(3,'active')],[...scores(1),...scores(2),...scores(3)]);
  assert.equal(x.kind,'ready');
  assert.equal(x.weekCount,2);
  assert.equal(x.timeline.length,3);
  assert.equal(x.history.length,16);
  assert.equal(x.timeline.at(-1).history.some(r=>r.week_id==='week-3'),false);
});
test('later edited scores cannot change earlier checkpoint inputs or forecasts',()=>{
  const orig=t([week(1),week(2),week(3)],[...scores(1),...scores(2),...scores(3)]);
  const altered=[...scores(1),...scores(2),...scores(3).map((r,i)=>({...r,total_points:r.total_points+(i===0?400:0)}))];
  const changed=t([week(1),week(2),week(3)],altered);
  assert.deepEqual(orig.timeline.slice(0,3),changed.timeline.slice(0,3));
  const p=History.predictRegular(orig.timeline[2],Crown,{seasonId:orig.seasonId,regularWeekCount:20,samples:350});
  const q=History.predictRegular(changed.timeline[2],Crown,{seasonId:changed.seasonId,regularWeekCount:20,samples:350});
  assert.deepEqual(p.titleOdds,q.titleOdds);
});
test('preseason chance is 12.5% for every one of eight members',()=>{
  const x=t([],[]);
  const forecast=History.predictRegular(x.timeline[0],Crown,{seasonId:x.seasonId});
  assert.equal(forecast.kind,'estimate');
  assert.deepEqual(Object.values(forecast.titleOdds),Array(8).fill(12.5));
  assert.equal(forecast.samples,0);
});
test('historical weekly forecasts are reproducible and total approximately 100%',()=>{
  const x=t();
  const a=History.estimateTimeline(x,Crown,{samples:350});
  const b=History.estimateTimeline(x,Crown,{samples:350});
  assert.equal(a.snapshots.length,3);
  assert.deepEqual(a.snapshots,b.snapshots);
  for(const s of a.snapshots){
    const vals=Object.values(s.odds);
    assert.equal(vals.length,8);
    assert.ok(Math.abs(vals.reduce((acc,x)=>acc+x,0)-100)<1);
    assert.ok(vals.every(x=>x>=0&&x<=100));
  }
});
test('a published week missing even one of eight score rows is not fabricated',()=>{
  const x=t([week(1)],scores(1).slice(1));
  assert.equal(x.kind,'unavailable');
  assert.match(x.reason,/incomplete score records/i);
});
test('season filters keep old or future season scores out of the graph',()=>{
  const x=t([week(1),{...week(2),season_id:'another-season'}],[...scores(1),...scores(2)]);
  assert.equal(x.weekCount,1);
  assert.equal(x.history.length,8);
});
test('after the regular season, historical playoff snapshots use official round results',()=>{
  const weeks=Array.from({length:20},(_,i)=>week(i+1));
  const base=History.buildTimeline({profiles,weeks,scores:weeks.flatMap((_,i)=>scores(i+1)),seasonId:'season-2026'});
  assert.equal(base.weekCount,20);
  const entries=ids.map((user_id,i)=>({user_id,display_name:'Member '+(i+1),seed:i+1,
    starting_bonus:Crown.BONUS[i],current_total:99,status:i>=6?'eliminated':'active'}));
  const round={id:'round-1',round_number:1,participants_before:8,participants_after:6,status:'finalized',label:'Playoff Week 1'};
  const history=ids.map((user_id,i)=>({round_id:'round-1',round_number:1,user_id,seed:i+1,
    display_name:'Member '+(i+1),cumulative_after:Crown.BONUS[i]+i,
    status_after:i<6?'active':'eliminated',advanced:i<6}));
  const d={settings:{status:'live'},entries,rounds:[round],history,current:{round}};
  const points=History.postseasonInputs(base,d);
  assert.deepEqual(points.map(p=>p.shortLabel),['PO','R1']);
  assert.equal(points[0].entries.every(e=>e.status==='active'),true);
  assert.equal(points[0].entries[0].current_total,10);
  assert.equal(points[1].entries.find(e=>e.user_id===ids[7]).status,'eliminated');
  assert.equal(points[1].entries.find(e=>e.user_id===ids[1]).current_total,9);
  const odds=History.predictPostseason(points[1],Crown,base.history,{samples:350,seasonId:base.seasonId});
  assert.equal(odds.kind,'estimate');
  assert.equal(odds.titleOdds[ids[7]],0);
  assert.ok(Math.abs(Object.values(odds.titleOdds).reduce((a,b)=>a+b,0)-100)<1);
});
test('no postseason checkpoints are claimed before all 20 published weeks',()=>{
  const x=t();
  assert.deepEqual(History.postseasonInputs(x,{settings:{status:'live'},entries:[]}),[]);
});
test('a finalized championship ends with a verified 100% official champion',()=>{
  const weeks=Array.from({length:20},(_,i)=>week(i+1));
  const base=History.buildTimeline({profiles,weeks,scores:weeks.flatMap((_,i)=>scores(i+1)),seasonId:'season-2026'});
  const entries=ids.map((user_id,i)=>({user_id,seed:i+1,starting_bonus:Crown.BONUS[i],status:i===0?'champion':i===1?'runner_up':'eliminated'}));
  const rounds=Array.from({length:4},(_,i)=>({id:'r'+(i+1),round_number:i+1,status:'finalized',
    participants_before:[8,6,4,2][i],participants_after:[6,4,2,1][i]}));
  const history=rounds.flatMap((r,i)=>ids.slice(0,r.participants_before).map((user_id,j)=>({
    user_id,seed:j+1,round_id:r.id,status_after:i===3?
      j===0?'champion':'runner_up':j<r.participants_after?'active':'eliminated',
    cumulative_after:20+i*5-j,advanced:j<r.participants_after
  })));
  const ps=History.postseasonInputs(base,{settings:{status:'complete',champion_id:ids[0]},entries,rounds,history});
  assert.equal(ps.length,5);
  assert.equal(ps.at(-1).kind,'official');
  const o=History.predictPostseason(ps.at(-1),Crown,base.history,{samples:300});
  assert.equal(o.kind,'official');
  assert.equal(o.titleOdds[ids[0]],100);
  assert.equal(o.titleOdds[ids[1]],0);
});
