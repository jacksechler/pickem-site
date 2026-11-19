const test=require('node:test');
const assert=require('node:assert/strict');
const Model=require('../ltspn_poll_model.js');
const teams=Array.from({length:26},(_,i)=>({id:String(i),name:'Team '+i}));
test('points use 25 through 1 and both teams tied for 25 remain in the Top 25',()=>{
  const first=teams.slice(0,25).map(t=>t.id),second=[...first.slice(0,24),'25'];
  const rows=Model.rank([{teams:first},{teams:second}]);
  assert.equal(rows[0].points,50);assert.equal(rows[0].first,2);
  assert.equal(rows.filter(r=>r.rank<=25).length,26);
  assert.deepEqual(rows.slice(-2).map(r=>[r.rank,r.points]),[[25,1],[25,1]]);
});
test('movement shows up, down, unchanged, new and dropped teams using competition ranks',()=>{
  const previous=[{id:'a',rank:1},{id:'b',rank:2},{id:'c',rank:3},{id:'d',rank:25},{id:'e',rank:26}];
  const now=[{id:'b',rank:1},{id:'a',rank:2},{id:'c',rank:3},{id:'e',rank:25},{id:'d',rank:26}];
  const compared=Model.compare(now,previous,true);
  assert.deepEqual(compared.rows.slice(0,4).map(r=>r.movement),['↑1','↓1','—','NEW']);
  assert.deepEqual(compared.dropped,[{id:'d',rank:25}]);
  assert.ok(Model.compare(now,[],false).rows.every(r=>r.movement==='—'));
  assert.deepEqual(Model.compare([],previous,false).dropped,[]);
});
test('previous week stays within the selected season and excludes future weeks',()=>{
  const current={id:'new',season_id:'s',number:4};
  const prior={id:'old',season_id:'s',number:3};
  assert.equal(Model.previousWeek(current,[current,prior,{season_id:'other',number:3},{season_id:'s',number:5}]),prior);
  assert.equal(Model.previousWeek({...current,number:1},[prior]),null);
});
test('drafts survive reloads, isolate members and weeks, and keep submitted baseline',()=>{
  const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  assert.equal(Model.saveDraft(storage,'me','w1',['0','1'],['1','0']),true);
  assert.deepEqual(Model.readDraft(storage,'me','w1',teams),{version:1,teams:['0','1'],base:['1','0']});
  assert.equal(Model.readDraft(storage,'other','w1',teams),null);
  assert.equal(Model.readDraft(storage,'me','w2',teams),null);
  assert.equal(Model.clearDraft(storage,'me','w1'),true);
  assert.equal(Model.readDraft(storage,'me','w1',teams),null);
});
test('corrupt and unavailable storage do not break polling; invalid teams are removed',()=>{
  assert.equal(Model.readDraft({getItem:()=>'{bad'},'u','w',teams),null);
  assert.equal(Model.readDraft(null,'u','w',teams),null);
  assert.equal(Model.saveDraft(null,'u','w',[]),false);
  assert.equal(Model.clearDraft(null,'u','w'),false);
  const storage={getItem:()=>JSON.stringify({version:1,teams:['0','0','not-a-team','1']})};
  assert.deepEqual(Model.readDraft(storage,'u','w',teams).teams,['0','1']);
});
