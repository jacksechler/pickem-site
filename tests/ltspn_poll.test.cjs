const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
test('poll combines points, counts first place votes, and submits an ordered ballot',async()=>{
 const nodes=new Map();let click;const writes=[];
 const get=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',value:'',textContent:'',addEventListener(type,fn){if(id==='pollBox')click=fn;}});return nodes.get(id);};
 const teams=Array.from({length:26},(_,i)=>({id:String(i),name:'Team '+i}));
 const first=teams.slice(0,25).map(t=>t.id),second=[...first].reverse();
 const window={showPage(){}};
 const context={window,document:{getElementById:get},session:{user:{id:'me'}},fetch:async()=>({ok:true,json:async()=>teams}),db:async(path,opt)=>{
  if(opt){writes.push(JSON.parse(opt.body));return null;}
  if(path.startsWith('weeks'))return [{id:'week',name:'Week test',is_active:true}];
  if(path.startsWith('profiles'))return [{id:'me',display_name:'Me'}];
  return [{user_id:'me',teams:first},{user_id:'other',teams:second}];
 }};
 vm.runInNewContext(fs.readFileSync('ltspn_poll.js','utf8'),context);
 window.showPage('top25');await new Promise(r=>setImmediate(r));
 assert.match(get('pollBox').innerHTML,/2 ballots submitted/);
 assert.match(get('pollBox').innerHTML,/<td>1<\/td><td>Team 0<\/td><td>26<\/td><td>1<\/td>/);
 await click({target:{closest:()=>({dataset:{down:'0'}})}});
 await click({target:{closest:()=>({id:'pollSubmit',dataset:{}})}});
 assert.equal(writes.length,1);assert.equal(writes[0].teams.length,25);
 assert.deepEqual(writes[0].teams.slice(0,2),['1','0']);
 assert.equal(writes[0].user_id,'me');assert.equal(writes[0].week_id,'week');
 assert.match(get('pollStatus').textContent,/Ballot saved/);
});
