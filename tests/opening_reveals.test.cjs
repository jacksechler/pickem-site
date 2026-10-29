const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname,'../opening_reveals.js'),'utf8');

async function boot(weeks, byWeek, currentUser='alice') {
  const queued=[], queried=[], opened=[], stored=new Map();
  const mockNode=()=>({
    style:{}, innerHTML:'', addEventListener(){}, remove(){},
    querySelector(){return {addEventListener(){},focus(){}};}
  });
  const document={
    head:{append(){}},
    body:{append(el){opened.push(el.innerHTML);}},
    createElement:mockNode,
    getElementById(id){return id==='app'?{classList:{contains:()=>false}}:null;},
    addEventListener(){}, removeEventListener(){}
  };
  const profiles=[
    {id:'alice',display_name:'Alice'},
    {id:'bob',display_name:'Bob'}
  ];
  const db=async url=>{
    queried.push(url);
    if(url.startsWith('weeks?'))return weeks;
    if(url.startsWith('profiles?'))return profiles;
    if(url.startsWith('week_scores?')){
      const id=url.match(/week_id=eq\.([^&]+)/)?.[1];
      return byWeek[decodeURIComponent(id)]||[];
    }
    throw new Error('Unexpected data query: '+url);
  };
  const ctx={
    document, db, console, session:{user:{id:currentUser}},
    window:{renderHome(){},showPage(){}},
    localStorage:{
      getItem:key=>stored.get(key)||null,
      setItem:(key,value)=>stored.set(key,value)
    },
    queueMicrotask:cb=>queued.push(cb)
  };
  vm.runInNewContext(script,ctx,{filename:'opening_reveals.js'});
  assert.equal(queued.length,1);
  await queued[0]();
  return {opened,queried,stored};
}

test('the weekly winner popup never shows an unfinalized draft or live result',async()=>{
  const weeks=[{id:'live',name:'Live week',number:3,status:'active'}];
  const scores={live:[
    {user_id:'alice',placement:1,total_points:20},
    {user_id:'bob',placement:2,total_points:12}
  ]};
  const result=await boot(weeks,scores);
  assert.equal(result.opened.length,0);
  assert.equal(result.stored.size,0);
  assert.equal(result.queried.some(q=>q.includes('week_scores?')),false);
});

test('the popup uses official placements rather than season bonus points',async()=>{
  const weeks=[
    {id:'live',name:'Unpublished',number:3,status:'active'},
    {id:'published',name:'Week 2',number:2,status:'published'}
  ];
  const scores={
    live:[{user_id:'alice',placement:1,total_points:30}],
    published:[
      {user_id:'alice',placement:1,total_points:9,correct_count:10},
      {user_id:'bob',placement:2,total_points:22,correct_count:9}
    ]
  };
  const result=await boot(weeks,scores,'bob');
  assert.equal(result.opened.length,1);
  assert.match(result.opened[0],/Week winner: Alice/);
  assert.match(result.opened[0],/#2 THIS WEEK/);
  assert.equal(result.queried.some(q=>q.includes('week_id=eq.live')),false);
  assert.equal(result.stored.get('pickem-week-reveal:bob:published'),'seen');
  assert.equal(result.stored.has('pickem-week-reveal:bob:live'),false);
});

test('official first-place ties show all weekly winners',async()=>{
  const result=await boot(
    [{id:'done',name:'Final',number:3,status:'published'}],
    {done:[
      {user_id:'alice',placement:1,total_points:10},
      {user_id:'bob',placement:1,total_points:9}
    ]}
  );
  assert.equal(result.opened.length,1);
  assert.match(result.opened[0],/Week winners: Alice, Bob/);
  assert.match(result.opened[0],/WEEKLY WINNER/);
});
