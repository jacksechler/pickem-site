const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
test('graph accumulates published season points including penalties and supports historical totals',async()=>{
 const selector={};
 const host={innerHTML:'',querySelector(){return selector;},querySelectorAll(){return [];}};
 const window={renderStandings:async()=>{}};
 const context={window,document:{getElementById:()=>host},session:{user:{id:'a'}},week:{season_id:'current'},db:async path=>{
  if(path.startsWith('weeks?'))return [{id:'w1',name:'Week 1',number:1,season_id:'current'},{id:'w2',name:'Week 2',number:2,season_id:'current'},{id:'old',name:'Old',number:1,season_id:'old'}];
  if(path.startsWith('profiles?'))return [{id:'a',display_name:'Alice'}];
  return [{week_id:'w1',user_id:'a',total_points:10},{week_id:'w2',user_id:'a',total_points:-2.5},{week_id:'old',user_id:'a',total_points:999}];
 }};
 vm.runInNewContext(fs.readFileSync('season_points.js','utf8'),context);
 await window.renderStandings();
 assert.match(host.innerHTML,/7.5 total points/);
 assert.match(host.innerHTML,/-2.5 this week/);
 assert.doesNotMatch(host.innerHTML,/999/);
 selector.onchange({target:{value:'0'}});
 assert.match(host.innerHTML,/10 total points/);
 assert.match(host.innerHTML,/\+10 this week/);
});
