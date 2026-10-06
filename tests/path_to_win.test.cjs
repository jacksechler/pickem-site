const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'path_to_win.js'), 'utf8');

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
    setTimeout:()=>{},
    clearTimeout:()=>{},
    document:{querySelector:()=>null, getElementById:()=>null},
    el:()=>null,
    esc:v=>String(v ?? ''),
    week:null,
    session:null,
    window:{}
  };
  context.globalThis=context;
  vm.createContext(context);
  new vm.Script(source,{filename:'path_to_win.js'}).runInContext(context);
  assert.ok(context.window.PathToWinTestHooks,'Path to Win test hooks were not installed');
  return context.window.PathToWinTestHooks;
}

const hooks=loadHooks();

test('enumerates every outcome for up to four binary remaining results',()=>{
  const q=(id)=>({id,answer_options:['A','B']});
  const scenarios=hooks.buildScenarios([q('q1'),q('q2'),q('q3'),q('q4')]);
  assert.equal(scenarios.length,16);
});

test('stops exact scenario enumeration when more than 128 combinations exist',()=>{
  const qs=Array.from({length:8},(_,i)=>({id:'q'+i,answer_options:['A','B']}));
  assert.equal(hooks.buildScenarios(qs),null);
  const fourChoice=Array.from({length:4},(_,i)=>({id:'q'+i,answer_options:['A','B','C','D']}));
  assert.equal(hooks.buildScenarios(fourChoice),null);
});

test('declares a unique sole winner when a remaining scenario produces one',()=>{
  const d={
    w:{tiebreaker_result:100},
    users:['a','b'],
    pmap:{a:{display_name:'Alice'},b:{display_name:'Bob'}},
    subMap:{a:{tiebreaker_answer:90},b:{tiebreaker_answer:110}},
    pickMap:{a:{q1:'A'},b:{q1:'B'}},
    done:[],
    remaining:[{id:'q1'}]
  };
  const result=hooks.evaluate(d,[{q1:'A'}]);
  assert.deepEqual(Array.from(result.results[0].definite),['a']);
  assert.deepEqual(Array.from(result.results[0].unresolved),[]);
});

test('uses the actual tiebreaker to resolve a scenario tie to one player',()=>{
  const d={
    w:{tiebreaker_result:100},
    users:['a','b'],
    pmap:{a:{display_name:'Alice'},b:{display_name:'Bob'}},
    subMap:{a:{tiebreaker_answer:90},b:{tiebreaker_answer:103}},
    pickMap:{a:{},b:{}},
    done:[],
    remaining:[]
  };
  const result=hooks.evaluate(d,[{}]);
  assert.deepEqual(Array.from(result.results[0].definite),['b']);
  assert.deepEqual(Array.from(result.results[0].unresolved),[]);
});

test('does not call an exact tiebreaker-distance tie a definite win',()=>{
  const d={
    w:{tiebreaker_result:100},
    users:['a','b'],
    pmap:{a:{display_name:'Alice'},b:{display_name:'Bob'}},
    subMap:{a:{tiebreaker_answer:95},b:{tiebreaker_answer:105}},
    pickMap:{a:{},b:{}},
    done:[],
    remaining:[]
  };
  const result=hooks.evaluate(d,[{}]);
  assert.deepEqual(Array.from(result.results[0].definite),[]);
  assert.deepEqual(Array.from(result.results[0].unresolved),['a','b']);
});

test('without an actual tiebreaker, a tied scenario remains unresolved',()=>{
  const d={
    w:{tiebreaker_result:null},
    users:['a','b'],
    pmap:{a:{display_name:'Alice'},b:{display_name:'Bob'}},
    subMap:{a:{tiebreaker_answer:95},b:{tiebreaker_answer:105}},
    pickMap:{a:{},b:{}},
    done:[],
    remaining:[]
  };
  const result=hooks.evaluate(d,[{}]);
  assert.deepEqual(Array.from(result.results[0].definite),[]);
  assert.deepEqual(Array.from(result.results[0].unresolved),['a','b']);
});

test('commonNeeds identifies results required in every surviving path',()=>{
  const q1={id:'q1'},q2={id:'q2'};
  const opportunities=[
    {scenario:{q1:'A',q2:'B'}},
    {scenario:{q1:'A',q2:'A'}},
  ];
  assert.equal(JSON.stringify(hooks.commonNeeds(opportunities,[q1,q2])),JSON.stringify([{q:q1,value:'A'}]));
});

test('the UI explains the late-week threshold instead of disappearing',()=>{
  const d={
    w:{phase:'regular',status:'draft'},
    remaining:Array.from({length:5},(_,i)=>({id:'q'+i})),
    users:[],
    done:[]
  };
  const html=hooks.screenHtml(d);
  assert.match(html,/id="pathToWinCard"/);
  assert.match(html,/4 or fewer remain/);
});
