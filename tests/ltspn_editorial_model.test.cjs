const test=require('node:test');
const assert=require('node:assert/strict');
const Base=require('../league_news_model.js');
const Editorial=require('../ltspn_editorial_model.js');
const profiles=Array.from({length:8},(_,i)=>({id:'p'+i,display_name:'Player '+(i+1)}));
const week=n=>({id:'week-'+n,number:n,name:'Week '+n,phase:'regular',status:'published',season_id:'season'});
const score=(n,win=0)=>profiles.map((p,i)=>({
  week_id:'week-'+n,user_id:p.id,placement:i===win?1:i<win?i+2:i+1,
  total_points:22-i+n,correct_count:11-i+(i===win?1:0),question_count:12
}));
const questions=n=>Array.from({length:12},(_,i)=>({
  id:'q'+n+'-'+i,week_id:'week-'+n,counts_for_score:true,prompt:'Matchup #'+(i+1),
  result:i%2===0?'Home':'Away',sport:'NFL',position:i+1
}));
const picks=n=>questions(n).flatMap((q,qi)=>profiles.map((p,i)=>({
  week_id:'week-'+n,question_id:q.id,user_id:p.id,
  answer:(i===0||i<5&&qi%3!==0)?q.result:(q.result==='Home'?'Away':'Home')
})));
function data({weeks=[week(1)],scores=[],questions:qs=[],picks:ps=[]}={}){
  if(!scores.length)scores=weeks.flatMap(w=>score(w.number));
  const news=Base.build({profiles,weeks,scores,seasonId:'season'});
  return Editorial.build({news,profiles,weeks,scores,questions:qs,picks:ps,seasonId:'season'});
}
test('published week gains a full-length featured article with real question details',()=>{
  const result=data({questions:questions(1),picks:picks(1)});
  const story=result.entries[0].stories.find(s=>s.id==='week-1:deep-dive');
  assert.ok(story);
  assert.ok(story.featured);
  assert.ok(story.body.length>=8);
  assert.ok(story.body.join(' ').split(/\s+/).length>=250);
  assert.match(story.body.join(' '),/Matchup #1/);
  assert.match(story.body.join(' '),/officially recorded result/);
  assert.equal(story.highlights[0].fieldSize,8);
  assert.ok(story.readMinutes>=2);
});
test('the full field is required before reporting a sole correct pick',()=>{
  const q=questions(1),ps=picks(1);
  const absent=ps.filter(p=>!(p.question_id==='q1-0'&&p.user_id==='p7'));
  const result=data({questions:q,picks:absent});
  const featured=result.entries[0].stories[0];
  assert.ok(featured.highlights.every(h=>h.id!=='q1-0'));
});
test('answer distribution and quoted options come from each member’s actual answers',()=>{
  const q=[{id:'specific',week_id:'week-1',counts_for_score:true,prompt:'Rams vs. Seahawks?',
    result:'Seahawks',sport:'NFL',position:1}];
  const ps=profiles.map((p,i)=>({week_id:'week-1',question_id:'specific',user_id:p.id,
    answer:i===0?'Seahawks':'Rams'}));
  const story=data({questions:q,picks:ps}).entries[0].stories[0];
  const highlight=story.highlights.find(x=>x.id==='specific');
  assert.equal(highlight.correctCount,1);
  assert.deepEqual(highlight.correctNames,['Player 1']);
  assert.match(story.body.join(' '),/Rams vs\. Seahawks\?/);
  assert.match(story.body.join(' '),/only member/);
  assert.match(highlight.description,/1 of 8/);
});
test('no unfinalized or unrelated week can enter editorial articles',()=>{
  const weeks=[week(1),{...week(2),status:'active'}];
  const result=data({weeks,scores:[...score(1),...score(2)],
    questions:[...questions(1),...questions(2)],picks:[...picks(1),...picks(2)]});
  assert.equal(result.weekCount,1);
  assert.equal(result.entries.length,1);
  assert.equal(result.stories.some(s=>s.weekId==='week-2'),false);
});
test('when picks are unavailable, report totals without inventing game details',()=>{
  const result=data();
  const recap=result.entries[0].stories[0];
  assert.ok(recap);
  assert.equal(recap.highlights.length,0);
  assert.match(recap.body.join(' '),/archive is not available/);
  assert.doesNotMatch(recap.body.join(' '),/Matchup #/);
});
test('older weeks get independent articles without future week facts',()=>{
  const weeks=[week(1),week(2)],result=data({weeks,questions:[...questions(1),...questions(2)],
    picks:[...picks(1),...picks(2)]});
  const first=result.entries[0].stories[0];
  assert.doesNotMatch(first.body.join(' '),/Week 2/);
  const second=result.entries[1].stories[0];
  assert.match(second.body.join(' '),/Week 2/);
});
test('record and standings stories become longer while retaining their factual headlines',()=>{
  const weeks=[week(1),week(2)],scores=[...score(1),...score(2,3)];
  const result=data({weeks,scores,questions:[...questions(1),...questions(2)],
    picks:[...picks(1),...picks(2)]});
  const winner=result.entries[1].stories.find(s=>s.id==='week-2:winner');
  assert.ok(winner.body.length>=7);
  const nonWinner=result.entries[1].stories.find(s=>s.id.endsWith(':movement')||s.id.endsWith(':lead-change'));
  if(nonWinner)assert.ok(nonWinner.body.length>3);
});
test('no source input objects are mutated by the editorial transformation',()=>{
  const weeks=[week(1)],scores=score(1),qs=questions(1),ps=picks(1);
  const news=Base.build({profiles,weeks,scores});
  const before=JSON.stringify({weeks,scores,qs,ps,news});
  Editorial.build({news,profiles,weeks,scores,questions:qs,picks:ps});
  assert.equal(JSON.stringify({weeks,scores,qs,ps,news}),before);
});
