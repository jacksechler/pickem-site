const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'commissioner_v2.js'), 'utf8');

function buildHarness({questionCount=8, choices, ties, resultOrders, previousScores} = {}) {
  const players = Array.from({length:8}, (_,i)=>({id:'p'+(i+1), name:'Player '+(i+1)}));
  const questions = Array.from({length:questionCount}, (_,i)=>({
    id:'q'+(i+1),
    week_id:'w1',
    position:i+1,
    sport:'NFL',
    prompt:'Question '+(i+1),
    answer_options:['A','B'],
    counts_for_score:true,
    result:'A',
    result_order:resultOrders?.[i] ?? i+1
  }));
  const picks=[];
  for (let pi=0; pi<players.length; pi++) {
    for (let qi=0; qi<questions.length; qi++) {
      const answer = choices ? choices[pi][qi] : (qi < questionCount-pi ? 'A' : 'B');
      picks.push({user_id:players[pi].id,question_id:questions[qi].id,answer});
    }
  }
  const submissions=players.map((p,i)=>({
    user_id:p.id,
    tiebreaker_answer: ties?.[i] ?? (50+i)
  }));
  const profiles=players.map((p,i)=>({id:p.id,display_name:p.name,role:i===0?'commissioner':'player'}));
  const slots=players.slice(1).map((p,i)=>({slot:i+1,display_name:p.name,claimed_by:p.id}));
  const week={id:'w1',season_id:'s1',number:2,name:'Week 2',phase:'regular',status:'draft',tiebreaker_result:50};
  const writes=[];
  const prevWeek = previousScores ? [{id:'prev',number:1}] : [];
  const prevScores = previousScores || [];

  const db = async (url, opts={}) => {
    if (opts.method) {
      writes.push({url,opts});
      return [];
    }
    if (url.startsWith('profiles?')) return structuredClone(profiles);
    if (url.startsWith('player_slots?')) return structuredClone(slots);
    if (url.startsWith('submissions?')) return structuredClone(submissions);
    if (url.startsWith('picks?')) return structuredClone(picks);
    if (url.startsWith('weeks?season_id=eq.')) return structuredClone(prevWeek);
    if (url.startsWith('week_scores?week_id=eq.prev')) return structuredClone(prevScores);
    throw new Error('Unhandled DB read: '+url);
  };

  const alerts=[];
  const context={
    console,
    Date,
    JSON,
    Math,
    Number,
    Array,
    Object,
    String,
    Promise,
    setTimeout,
    clearTimeout,
    week,
    questions,
    profile:{role:'commissioner'},
    step:0,
    db,
    el:()=>null,
    esc:v=>String(v??''),
    locked:()=>true,
    alert:m=>alerts.push(String(m)),
    confirm:()=>true,
    loadData:async()=>{},
    renderHome:()=>{},
    renderStandings:()=>{},
    renderStats:()=>{},
    window:{renderCommissioner:async()=>{}}
  };
  context.globalThis=context;
  vm.createContext(context);
  new vm.Script(source,{filename:'commissioner_v2.js'}).runInContext(context);

  return {context,players,questions,picks,submissions,writes,alerts};
}

async function score(h) {
  const result=await h.context.window.previewWeekScores();
  assert.ok(result,'Scoring should return a preview');
  return result.rows;
}

test('regular placement slots are 8/7/6/5/4/3/2/0', async()=>{
  const h=buildHarness({questionCount:8});
  const rows=await score(h);
  assert.deepEqual(rows.map(r=>r.correct_count),[8,7,6,5,4,3,2,1]);
  assert.deepEqual(rows.map(r=>r.placement),[1,2,3,4,5,6,7,8]);
  assert.deepEqual(rows.map(r=>r.placement_points),[8,7,6,5,4,3,2,0]);
});

test('exact finish ties split occupied placement slots golf-style', async()=>{
  const choices=[
    ['A','A','A','A','A'],
    ['A','A','A','A','A'],
    ['A','A','A','A','B'],
    ['A','A','A','B','B'],
    ['A','A','B','B','B'],
    ['A','B','B','B','B'],
    ['B','B','B','B','B'],
    ['B','B','B','B','B']
  ];
  const h=buildHarness({questionCount:5,choices,ties:[48,52,51,54,55,56,57,58]});
  const rows=await score(h);
  assert.equal(rows[0].placement,1);
  assert.equal(rows[1].placement,1);
  assert.equal(rows[0].placement_points,7.5);
  assert.equal(rows[1].placement_points,7.5);
  assert.equal(rows[0].golf_tie,true);
  assert.equal(rows[1].golf_tie,true);
  assert.equal(rows[2].placement,3);
  assert.equal(rows[2].placement_points,6);
});

test('Perfect, Unicorn, Upset, and Cold bonuses use current league rules', async()=>{
  const choices=[
    ['A','A','A'],
    ['B','A','A'],
    ['B','B','A'],
    ['B','B','A'],
    ['B','B','A'],
    ['B','B','A'],
    ['B','B','A'],
    ['B','B','B']
  ];
  const h=buildHarness({questionCount:3,choices});
  const rows=await score(h);
  const p1=rows.find(r=>r.user_id==='p1');
  const p2=rows.find(r=>r.user_id==='p2');
  const p8=rows.find(r=>r.user_id==='p8');
  assert.equal(p1.perfect_bonus,5);
  assert.equal(p1.unicorn_count,1);
  assert.equal(p1.unicorn_bonus,3);
  assert.equal(p1.upset_count,1);
  assert.equal(p1.upset_bonus,0.5);
  assert.equal(p2.unicorn_bonus,0);
  assert.equal(p2.upset_bonus,0.5);
  assert.equal(p8.correct_count,0);
  assert.equal(p8.cold_bonus,-5);
});

test('opening streak uses commissioner result-entry order and only follows a perfect previous week', async()=>{
  const choices=[
    ['B','A','A'],
    ['A','A','A'],
    ['A','A','A'],
    ['A','A','A'],
    ['A','A','A'],
    ['A','A','A'],
    ['A','A','A'],
    ['A','A','A']
  ];
  const previousScores=[
    {user_id:'p1',correct_count:5,question_count:5},
    {user_id:'p2',correct_count:4,question_count:5}
  ];
  const h=buildHarness({questionCount:3,choices,resultOrders:[2,1,3],previousScores});
  const rows=await score(h);
  const p1=rows.find(r=>r.user_id==='p1');
  const p2=rows.find(r=>r.user_id==='p2');
  assert.equal(p1.opening_streak,1,'Q2 is entered first and is correct; Q1 is second and stops the streak');
  assert.equal(p1.streak_bonus,0.5);
  assert.equal(p2.opening_streak,0,'A non-perfect prior week cannot start the bonus streak');
  assert.equal(p2.streak_bonus,0);
});

test('tiebreaker changes placement only; score totals contain only placement plus named bonuses', async()=>{
  const choices=[
    ['A','A','A','B'],
    ['A','A','A','B'],
    ['A','A','B','B'],
    ['A','B','B','B'],
    ['B','B','B','B'],
    ['B','B','B','B'],
    ['B','B','B','B'],
    ['B','B','B','B']
  ];
  const h=buildHarness({questionCount:4,choices,ties:[51,54,55,56,57,58,59,60]});
  const rows=await score(h);
  assert.equal(rows[0].user_id,'p1');
  assert.equal(rows[1].user_id,'p2');
  assert.equal(rows[0].tb_distance,1);
  assert.equal(rows[1].tb_distance,4);
  for(const r of rows) {
    const expected=r.placement_points+r.perfect_bonus+r.unicorn_bonus+r.upset_bonus+r.streak_bonus+r.cold_bonus;
    assert.equal(r.total_points,expected,'No tiebreaker points may be added');
  }
});

test('publishing writes eight official score rows and publishes the week', async()=>{
  const h=buildHarness({questionCount:8});
  await h.context.window.publishCurrentWeek();
  const scoreWrite=h.writes.find(w=>w.url.startsWith('week_scores?on_conflict='));
  assert.ok(scoreWrite,'Publish should upsert week scores');
  const payload=JSON.parse(scoreWrite.opts.body);
  assert.equal(payload.length,8);
  assert.deepEqual(payload.map(r=>r.placement_points),[8,7,6,5,4,3,2,0]);
  const weekWrite=h.writes.find(w=>w.url.startsWith('weeks?id=eq.w1'));
  assert.ok(weekWrite,'Publish should update the week');
  const body=JSON.parse(weekWrite.opts.body);
  assert.equal(body.status,'published');
  assert.ok(body.published_at);
});
