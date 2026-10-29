const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../league_extras_model.js');
const profiles=Array.from({length:8},(_,i)=>({id:'p'+i,username:'member'+i,display_name:'Member '+(i+1)}));
const weeks=[1,2,3,4].map(n=>({id:'w'+n,name:'Week '+n,number:n,status:'published',phase:'regular',season_id:'2026'}));
const weeksDraft=[...weeks,{id:'draft',name:'Week 5',number:5,status:'active',phase:'regular',season_id:'2026'}];
const scores=weeks.flatMap((w,n)=>profiles.map((p,i)=>({
  week_id:w.id,user_id:p.id,correct_count:12-i+(n%2===0?0:1),question_count:16,
  total_points:24-i*2+(n%2),placement:i+1,
  unicorn_count:i===0?1:0,upset_count:i===1?1:0,opening_streak:i+2
})));
const questions=weeks.map(w=>({
  id:'q'+w.number,week_id:w.id,prompt:'Which team wins Week '+w.number+'?',
  sport:'NFL',result:'A',counts_for_score:true
}));
const picks=weeks.flatMap(w=>profiles.map((p,i)=>({
  week_id:w.id,user_id:p.id,question_id:'q'+w.number,answer:i===0?'A':'B'
})));
const snapshot=(changes={})=>({profiles,weeks,scores,questions,picks,seasonId:'2026',...changes});
const byName=(model,id)=>model.members.find(x=>x.id===id);
test('computes all eight season profiles from four completed cards',()=>{
 const d=M.build(snapshot());
 assert.equal(d.members.length,8);
 assert.equal(d.weekCount,4);
 const a=byName(d,'p0');
 assert.equal(a.points,24+25+24+25);
 assert.equal(a.correct,12+13+12+13);
 assert.equal(a.questions,64);
 assert.equal(a.wins,4);
 assert.equal(a.podiums,4);
 assert.equal(a.perfects,0);
 assert.equal(a.weeks.length,4);
 assert.equal(a.rank,1);
 assert.equal(d.rankings[0].name,'Member 1');
});
test('profiles provide recent accuracy, average points and longest winning streak',()=>{
 const d=M.build(snapshot());const m=byName(d,'p0');
 assert.equal(m.recentRate,100*(13+12+13)/48);
 assert.equal(m.averagePoints,98/4);
 assert.equal(m.longestWinRun,4);
 assert.equal(m.bestWeek.weekNumber,2);
 assert.deepEqual(m.lastFive,[1,1,1,1]);
});
test('head-to-head records use actual official weekly placements, not bonuses',()=>{
 const d=M.build(snapshot());
 const a=M.headToHead(d,'p0').find(x=>x.id==='p1');
 assert.equal(a.aWins,4);assert.equal(a.bWins,0);assert.equal(a.ties,0);
 const b=M.headToHead(d,'p1').find(x=>x.id==='p0');
 assert.equal(b.aWins,0);assert.equal(b.bWins,4);assert.equal(b.total,4);
});
test('tied weekly placements count as head-to-head ties',()=>{
 const altered=scores.map(s=>s.week_id==='w1'&&s.user_id==='p1'?{...s,placement:1}:s);
 const d=M.build(snapshot({scores:altered}));
 assert.equal(M.headToHead(d,'p0').find(x=>x.id==='p1').ties,1);
});
test('current leader and records do not award a season championship early',()=>{
 const d=M.build(snapshot());
 assert.equal(d.records.find(x=>x.id==='most-wins').value,4);
 assert.equal(d.championships.length,0);
 assert.equal(d.rankings[0].name,'Member 1');
});
test('hall of fame only shows an official championship after finalized round four',()=>{
 const entries=profiles.map((p,i)=>({user_id:p.id,seed:i+1,status:i===3?'champion':'eliminated',
   current_total:90+i,display_name:p.display_name,regular_season_points:120-i}));
 const base={settings:{status:'live',frozen_at:'2027-01-01'},entries,
   rounds:[{id:'r4',round_number:4,status:'live'}]};
 const pending=M.build(snapshot({postseason:base}));
 assert.equal(pending.championships.filter(x=>x.type==='league-champion').length,0);
 assert.equal(pending.championships.filter(x=>x.type==='regular-champion').length,1);
 const complete=M.build(snapshot({postseason:{...base,settings:{...base.settings,status:'complete'},
   rounds:[{id:'r4',round_number:4,status:'finalized'}]}}));
 assert.equal(complete.championships.find(x=>x.type==='league-champion').userId,'p3');
 assert.equal(complete.championships.find(x=>x.type==='regular-champion').userId,'p0');
});
test('unpublished and unrelated season data cannot influence awards or profiles',()=>{
 const other={id:'old',number:0,phase:'regular',status:'published',season_id:'2025'};
 const alt=M.build(snapshot({
   weeks:[...weeksDraft,other],
   scores:[...scores,...profiles.map(p=>({week_id:'draft',user_id:p.id,correct_count:100,
     question_count:100,total_points:100,placement:1})),
     ...profiles.map(p=>({week_id:'old',user_id:p.id,correct_count:100,
     question_count:100,total_points:100,placement:1}))]
 }));
 assert.equal(alt.weekCount,4);
 assert.equal(alt.members[0].points,M.build(snapshot()).members[0].points);
});
test('incomplete published cards are skipped with an issue, not given invented awards',()=>{
 const d=M.build(snapshot({scores:scores.filter(s=>s.week_id!=='w4'||s.user_id!=='p7')}));
 assert.equal(d.weekCount,3);
 assert.equal(d.issues.length,1);
 assert.equal(d.rankings[0].weeks.length,3);
});
test('no published results displays unranked profiles, no awards and no history',()=>{
 const d=M.build(snapshot({weeks:[],scores:[],questions:[],picks:[]}));
 assert.equal(d.weekCount,0);
 assert.ok(d.members.every(x=>x.rank===null));
 assert.deepEqual(d.records,[]);
 assert.deepEqual(d.power,[]);
 assert.equal(M.studio(d).kind,'empty');
});
test('rare and unique correct picks need all eight original answers',()=>{
 const d=M.build(snapshot());
 assert.equal(d.rare.length,4);
 const p=byName(d,'p0');assert.equal(p.rareCorrect,4);assert.equal(p.rareSolo,4);
 assert.equal(byName(d,'p1').rareCorrect,0);
 const incomplete=M.build(snapshot({picks:picks.filter(p=>p.week_id!=='w2'||p.user_id!=='p7')}));
 assert.equal(incomplete.rare.length,3);
});
test('rare picks require a published scored result and cannot use unanswered questions',()=>{
 const altered=[...questions,{id:'unresolved',week_id:'w4',prompt:'Pending',result:null,
   counts_for_score:true}];
 const d=M.build(snapshot({questions:altered,picks:[...picks,...profiles.map(p=>({
   user_id:p.id,week_id:'w4',question_id:'unresolved',answer:'A'}))]}));
 assert.equal(d.rare.length,4);
});
test('studio generates true winners, standings movers and pick-ledger highlights',()=>{
 const d=M.build(snapshot());
 const show=M.studio(d,'w4');
 assert.equal(show.kind,'ready');
 assert.deepEqual(show.winners,['Member 1']);
 assert.equal(show.coverage[0].label,'TOP STORY');
 assert.equal(show.rare[0].correctCount,1);
 assert.equal(show.topContenders[0].placement,1);
 assert.equal(show.power.length,5);
});
test('archived SportsCenter episode power rankings cannot see future weeks',()=>{
 const baseline=M.studio(M.build(snapshot()),'w2');
 const manipulated=scores.map(s=>s.week_id==='w3'&&s.user_id==='p6'?
   {...s,correct_count:16,total_points:250}:s);
 const later=M.studio(M.build(snapshot({scores:manipulated})),'w2');
 assert.deepEqual(baseline.power,later.power);
 assert.equal(baseline.coverage[0].headline,later.coverage[0].headline);
});
test('power rankings are labelled as formula-based accuracy, separate from standings',()=>{
 const d=M.build(snapshot());
 const a=d.power[0];
 assert.equal(a.score,0.65*a.recentRate+0.35*a.seasonRate);
 assert.equal(d.power.length,8);
});
test('championship GameDay stays in preview before the final round',()=>{
 const r=M.championship({settings:{status:'live'},current:{
   round:{round_number:3,status:'live'},rows:[]}});
 assert.equal(r.kind,'upcoming');assert.equal(r.finalists.length,0);
});
test('finalists confirmed but pre-lock remains private with no invented clinch',()=>{
 const data={settings:{status:'live'},current:{
   round:{id:'r4',round_number:4,status:'live',week_id:'cw'},
   locked:false,question_count:20,decided_count:0,
   rows:[{user_id:'p0',cumulative_after:20,round_rank:1},
     {user_id:'p1',cumulative_after:10,round_rank:2}]}};
 const s=M.championship(data);
 assert.equal(s.kind,'live');assert.equal(s.locked,false);
 assert.equal(s.mathematical,null);
 assert.match(s.verdict,/private/);
});
test('mathematical lead never falsely awards an official trophy',()=>{
 const data={settings:{status:'live'},current:{
   round:{id:'r4',round_number:4,status:'live',week_id:'cw'},
   locked:true,question_count:20,decided_count:15,
   rows:[{user_id:'p0',cumulative_after:40,round_rank:1},
     {user_id:'p1',cumulative_after:20,round_rank:2}]}};
 const s=M.championship(data);
 assert.equal(s.kind,'live');assert.equal(s.mathematical,'p0');
 assert.equal(s.champion,null);assert.equal(s.remaining,5);
});
test('uncertain title still has a live finish scenario, with no false clinch',()=>{
 const data={settings:{status:'live'},current:{
   round:{id:'r4',round_number:4,status:'live',week_id:'cw'},
   locked:true,question_count:20,decided_count:15,
   rows:[{user_id:'p0',cumulative_after:40,round_rank:1},
     {user_id:'p1',cumulative_after:39,round_rank:2}]}};
 const s=M.championship(data);
 assert.equal(s.kind,'live');assert.equal(s.mathematical,null);assert.equal(s.remaining,5);
});
test('a finalized championship shows only the official champion',()=>{
 const data={settings:{status:'complete'},entries:[
   {user_id:'p0',status:'champion',seed:1},
   {user_id:'p1',status:'runner_up',seed:2}
 ],current:{round:{id:'r4',round_number:4,status:'finalized'},rows:[
   {user_id:'p0',status_after:'champion'},
   {user_id:'p1',status_after:'runner_up'}
 ]}};
 const s=M.championship(data);
 assert.equal(s.kind,'official');
 assert.equal(s.champion.user_id,'p0');assert.equal(s.finalists.length,2);
});
test('only contrasting finalists picks count as championship difference makers',()=>{
 const q=[{id:'a',week_id:'final',prompt:'Winner?',result:'X'},
   {id:'b',week_id:'final',prompt:'Total?',result:null},
   {id:'c',week_id:'final',prompt:'Shared?',result:'X'}];
 const picks=[
   {week_id:'final',question_id:'a',user_id:'p0',answer:'X'},
   {week_id:'final',question_id:'a',user_id:'p1',answer:'Y'},
   {week_id:'final',question_id:'b',user_id:'p0',answer:'A'},
   {week_id:'final',question_id:'b',user_id:'p1',answer:'B'},
   {week_id:'final',question_id:'c',user_id:'p0',answer:'X'},
   {week_id:'final',question_id:'c',user_id:'p1',answer:'X'}
 ];
 const d=M.decidingPicks(q,picks,[{user_id:'p0'},{user_id:'p1'}],'final');
 assert.equal(d.length,2);
 assert.equal(d[0].firstCorrect,true);
 assert.equal(d[0].secondCorrect,false);
 assert.equal(d[1].decided,false);
});
test('current championship code does not mutate official postseason data',()=>{
 const input={settings:{status:'live'},current:{round:{round_number:4,status:'live'},
   locked:true,question_count:15,decided_count:12,rows:[
     {user_id:'p0',round_rank:1,cumulative_after:35},
     {user_id:'p1',round_rank:2,cumulative_after:30}
   ]}};
 const before=JSON.stringify(input);
 M.championship(input);
 assert.equal(JSON.stringify(input),before);
});
