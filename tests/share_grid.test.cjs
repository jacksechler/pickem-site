const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'share_grid.js'), 'utf8');

function loadHooks(){
  const context = {
    console,
    JSON,
    Math,
    Number,
    String,
    Object,
    Array,
    Promise,
    Date,
    location:{href:'https://example.test/'},
    document:{querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null},
    window:{},
    setTimeout:()=>{},
    clearTimeout:()=>{},
    db:async()=>{throw new Error('DB should not be called by pure render tests');},
    week:null
  };
  context.globalThis=context;
  vm.createContext(context);
  new vm.Script(source,{filename:'share_grid.js'}).runInContext(context);
  assert.ok(context.window.ShareGridTestHooks,'Share Grid test hooks were not installed');
  return context.window.ShareGridTestHooks;
}

const hooks=loadHooks();

test('share grid renders all eight players and a long weekly grid',()=>{
  const users=Array.from({length:8},(_,i)=>'p'+i);
  const pmap=Object.fromEntries(users.map((id,i)=>[id,{display_name:['Jack','Cade','Brody','Chase','Evan','Jackson','Klay','Lincoln'][i]}]));
  const questions=Array.from({length:30},(_,i)=>({id:'q'+(i+1),position:i+1,counts_for_score:true,result:i===0?'A':null,answer_options:['A','B']}));
  const pickMap=Object.fromEntries(users.map(id=>[id,Object.fromEntries(questions.map(q=>[q.id,q.id==='q1'?'A':'B']))]));
  const subMap=Object.fromEntries(users.map((id,i)=>[id,{tiebreaker_answer:100+i}]));
  const html=hooks.renderGrid({week:{name:'Week 7'},users,pmap,questions,pickMap,subMap});
  assert.match(html,/shareGridCard/);
  assert.match(html,/8\/8 players/);
  assert.match(html,/Q30/);
  assert.match(html,/Jack/);
  assert.match(html,/Lincoln/);
  assert.match(html,/TB/);
  assert.match(html,/right/);
  assert.match(html,/wrong/);
});

test('share text includes the same week and final question row',()=>{
  const d={
    week:{name:'Week 7'},
    users:['p1','p2'],
    pmap:{p1:{display_name:'Jack'},p2:{display_name:'Cade'}},
    questions:[{id:'q1',position:1,counts_for_score:true},{id:'q30',position:30,counts_for_score:true}],
    pickMap:{p1:{q1:'A',q30:'B'},p2:{q1:'B',q30:'A'}},
    subMap:{p1:{tiebreaker_answer:90},p2:{tiebreaker_answer:100}}
  };
  const text=hooks.gridText(d);
  assert.match(text,/Week 7 Picks/);
  assert.match(text,/Q30 \| B \| A/);
  assert.match(text,/TB \| 90 \| 100/);
});
