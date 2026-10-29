const test=require('node:test');
const assert=require('node:assert/strict');
const News=require('../league_news_model.js');
const profiles=Array.from({length:8},(_,i)=>({id:'p'+i,display_name:'Member '+(i+1)}));
const week=(n,status='published')=>({id:'week-'+n,number:n,name:'Week '+n,status,phase:'regular',season_id:'season-1'});
const makeScores=(n,{winner=0,points=null,correct=null}={})=>{
  return profiles.map((p,i)=>({
    week_id:'week-'+n,user_id:p.id,
    placement:i===winner?1:i< winner?i+2:i+1,
    total_points:points?.[i]??(16-i+n),
    correct_count:correct?.[i]??(10-i),
    question_count:16
  }));
};
test('official first place wins even when another member earns more season points',()=>{
  const data=News.build({profiles,weeks:[week(1)],
    scores:makeScores(1,{winner:3,points:[23,21,20,11,9,8,7,6],correct:[11,10,10,12,8,7,6,5]})});
  assert.equal(data.kind,'ready');
  assert.equal(data.weekCount,1);
  const winner=data.stories.find(s=>s.id==='week-1:winner');
  assert.match(winner.headline,/Member 4 wins Week 1/);
  assert.match(winner.deck,/12 correct of 16/);
  assert.doesNotMatch(winner.body.join(' '),/Member 1 in first place/);
});
test('tied first-place finishers are both named without inventing a lone winner',()=>{
  const rows=makeScores(1);
  rows[1].placement=1;
  const data=News.build({profiles,weeks:[week(1)],scores:rows});
  const head=data.stories.find(s=>s.id==='week-1:winner');
  assert.match(head.headline,/Member 1 & Member 2 share/);
  assert.match(head.deck,/2 members officially finish tied/);
});
test('unfinished weeks never produce premature winning headlines or rivalry stories',()=>{
  const result=News.build({profiles,weeks:[week(1),week(2,'draft')],
    scores:[...makeScores(1),...makeScores(2,{winner:7})]});
  assert.equal(result.weekCount,1);
  assert.equal(result.stories.every(s=>s.weekNumber===1),true);
  assert.equal(result.stories.some(s=>s.headline.includes('Member 8 wins')),false);
});
test('missing official scores are excluded rather than filled with invented outcomes',()=>{
  const data=News.build({profiles,weeks:[week(1)],scores:makeScores(1).slice(1)});
  assert.equal(data.stories.length,0);
  assert.equal(data.issues.length,1);
  assert.match(data.issues[0].reason,/Incomplete/);
});
test('league lead changes are based on cumulative published season points',()=>{
  const first=makeScores(1,{points:[25,14,13,12,11,10,9,8]});
  const second=makeScores(2,{winner:1,points:[5,24,13,12,11,10,9,8]});
  const data=News.build({profiles,weeks:[week(1),week(2)],scores:[...first,...second]});
  const change=data.stories.find(s=>s.id==='week-2:lead-change');
  assert.ok(change);
  assert.match(change.headline,/Member 2 takes the season lead/);
  assert.match(change.body.join(' '),/38 cumulative season points/);
});
test('standings movement requires a prior published snapshot',()=>{
  const data=News.build({profiles,weeks:[week(1)],scores:makeScores(1)});
  assert.equal(data.stories.some(s=>s.id.endsWith(':movement')),false);
});
test('weekly pick records compare official correct counts, not scoring bonuses',()=>{
  const first=makeScores(1,{correct:[10,9,8,7,6,5,4,3]});
  const second=makeScores(2,{correct:[8,11,7,6,5,4,3,2]});
  const data=News.build({profiles,weeks:[week(1),week(2)],scores:[...first,...second]});
  const best=data.stories.find(s=>s.id==='week-2:pick-record');
  assert.match(best.headline,/Member 2 sets a new season-high/);
  assert.match(best.body.join(' '),/11 correct picks/);
});
test('title odds articles rely only on supplied historical checkpoint percentages',()=>{
  const odds=[
    {id:'start',odds:Object.fromEntries(profiles.map(p=>[p.id,12.5]))},
    {id:'week:week-1',odds:Object.fromEntries(profiles.map(p=>[p.id,p.id==='p0'?20:10]))}
  ];
  const data=News.build({profiles,weeks:[week(1)],scores:makeScores(1),oddsSnapshots:odds});
  const story=data.stories.find(s=>s.id==='week-1:odds-rise');
  assert.ok(story);
  assert.match(story.headline,/Member 1 makes the biggest championship-odds gain/);
  assert.match(story.body.join(' '),/retrospective championship chance rose from 12\.5% to 20\.0%/);
  assert.match(story.body.join(' '),/not probabilities that were recorded/);
});
test('live playoff projections do not trigger an official elimination announcement',()=>{
  const news=News.build({profiles,weeks:[week(1)],scores:makeScores(1),
    postseason:{settings:{status:'live'},rounds:[{id:'round1',round_number:1,status:'live',
      participants_before:8,participants_after:6,label:'Playoff Week 1'}],history:[]}});
  assert.equal(news.playoffs.length,0);
});
test('finalized playoff cuts produce accurate official advancement and elimination stories',()=>{
  const rows=profiles.map((p,i)=>({round_id:'r1',user_id:p.id,display_name:p.display_name,
    advanced:i<6,status_after:i<6?'active':'eliminated',round_rank:i+1,cumulative_after:20-i}));
  const data=News.build({profiles,weeks:[week(1)],scores:makeScores(1),postseason:{
    settings:{status:'live'},rounds:[{id:'r1',round_number:1,
      participants_before:8,participants_after:6,status:'finalized',label:'Playoff Week 1'}],
    history:rows
  }});
  assert.equal(data.playoffs.length,1);
  assert.match(data.latest.headline,/6 advance/);
  assert.match(data.latest.body.join(' '),/Member 7 and Member 8 were officially eliminated/);
});
test('official champion title is reserved for finalized championship results',()=>{
  const rows=[0,1].map(i=>({round_id:'final',user_id:'p'+i,display_name:'Member '+(i+1),
    advanced:i===0,status_after:i===0?'champion':'runner_up',
    cumulative_after:60-i,round_rank:i+1}));
  const data=News.build({profiles,weeks:[],scores:[],postseason:{
    settings:{status:'complete'},rounds:[{id:'final',round_number:4,status:'finalized',
      participants_before:2,participants_after:1,label:'Championship'}],history:rows
  }});
  assert.equal(data.playoffs.length,1);
  assert.match(data.playoffs[0].headline,/Member 1 wins the league championship/);
  assert.match(data.playoffs[0].body.join(' '),/runner-up was Member 2/);
});
test('news story IDs, ordering and text remain deterministic for unchanged official results',()=>{
  const input={profiles,weeks:[week(1),week(2)],scores:[...makeScores(1),...makeScores(2)]};
  assert.deepEqual(News.build(input),News.build(input));
});
test('no stories use an unrelated season when a season is supplied',()=>{
  const data=News.build({profiles,weeks:[week(1),{...week(2),season_id:'other'}],
    scores:[...makeScores(1),...makeScores(2)],seasonId:'season-1'});
  assert.equal(data.weekCount,1);
});
