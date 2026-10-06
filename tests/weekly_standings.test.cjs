const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source=fs.readFileSync(require('node:path').join(__dirname,'..','weekly_standings_v2.js'),'utf8');

function loadHooks(){
  const context={
    console,
    JSON,
    Number,
    String,
    Object,
    Array,
    Math,
    Promise,
    setTimeout:()=>{},
    setInterval:()=>{},
    clearTimeout:()=>{},
    clearInterval:()=>{},
    document:{querySelector:()=>null,getElementById:()=>null},
    window:{},
    el:()=>null,
    esc:v=>String(v??''),
    db:async()=>[],
    week:null,
    session:null
  };
  context.globalThis=context;
  vm.createContext(context);
  new vm.Script(source,{filename:'weekly_standings_v2.js'}).runInContext(context);
  assert.ok(context.window.WeeklyStandingsTestHooks);
  return context.window.WeeklyStandingsTestHooks;
}

const hooks=loadHooks();

test('live standings use correct picks and actual tiebreaker distance',()=>{
  const d={
    w:{tiebreaker_result:100},
    pmap:{a:{display_name:'Alice'},b:{display_name:'Bob'},c:{display_name:'Cara'}},
    subMap:{a:{tiebreaker_answer:97},b:{tiebreaker_answer:103},c:{tiebreaker_answer:103}},
    pickMap:{
      a:{q1:'A',q2:'B'},
      b:{q1:'A',q2:'A'},
      c:{q1:'B',q2:'A'}
    },
    users:['a','b','c'],
    scoredDecided:[
      {id:'q1',result:'A',result_order:2,position:1},
      {id:'q2',result:'A',result_order:1,position:2}
    ],
  };
  const out=hooks.liveRows(d);
  assert.deepEqual(Array.from(out.rows,r=>r.correct),[2,1,1]);
  assert.deepEqual(Array.from(out.rows,r=>r.rank),[1,2,2]);
  assert.equal(out.rows[0].tieDistance,3);
  assert.equal(out.rows[1].tieDistance,3);
  assert.equal(out.rows[1].exactTbTie,true);
  assert.equal(out.rows[2].exactTbTie,false);
});

test('final standings preserve stored placements and identify golf-style ties',()=>{
  const d={
    w:{tiebreaker_result:100},
    pmap:{a:{display_name:'Alice'},b:{display_name:'Bob'},c:{display_name:'Cara'}},
    subMap:{a:{tiebreaker_answer:100},b:{tiebreaker_answer:101},c:{tiebreaker_answer:120}},
    pickMap:{a:{},b:{},c:{}},
    users:['a','b','c'],
    scored:[],
    scoredDecided:[],
    scoreMap:{
      a:{placement:1,correct_count:10,question_count:20,total_points:8},
      b:{placement:1,correct_count:10,question_count:20,total_points:7.5},
      c:{placement:3,correct_count:9,question_count:20,total_points:6}
    },
    scores:[{user_id:'a'},{user_id:'b'},{user_id:'c'}]
  };
  const out=hooks.finalRows(d);
  assert.deepEqual(out.rows.map(r=>r.rank),[1,1,3]);
  assert.equal(out.rows[0].exactTbTie,true);
  assert.equal(out.rows[1].exactTbTie,true);
  assert.equal(out.rows[2].exactTbTie,false);
});

test('tiebreaker display stays transparent without inventing a distance',()=>{
  assert.equal(JSON.stringify(hooks.tbInfo({tiebreaker_answer:75},100)),JSON.stringify({answer:75,distance:25,label:'75 · Δ25'}));
  assert.equal(JSON.stringify(hooks.tbInfo({tiebreaker_answer:75},null)),JSON.stringify({answer:75,distance:null,label:'75'}));
});
