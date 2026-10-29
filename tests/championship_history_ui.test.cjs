const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const History=require('../championship_history_model.js');
const Forecast=require('../championship_odds_model.js');
const profiles=Array.from({length:8},(_,i)=>({id:'p'+i,display_name:'Player '+i}));
const weeks=[1,2].map(number=>({id:'w'+number,season_id:'s',number,name:'Week '+number,status:'published'}));
const scores=weeks.flatMap(w=>profiles.map((p,i)=>({
  week_id:w.id,user_id:p.id,correct_count:7+(i%5),
  question_count:15,placement:i+1,total_points:12+(8-i)+w.number
})));
function boot(){
  let historyNode=null;
  const listeners={};
  const parent={
    contains(element){return element===historyNode;},
    append(element){historyNode=element;},
  };
  const elements={
    standings:{classList:{contains:()=>true}},
    standingsBox:parent
  };
  const document={
    createElement(tag){
      assert.equal(tag,'section');
      const node={
        isConnected:true,dataset:{},innerHTML:'',contains(){return true},
        addEventListener(type,cb){listeners[type]=cb},
        setAttribute(){},querySelector(){return null}
      };
      return node;
    },
    getElementById(id){
      return id==='championshipHistoryBox'?historyNode:elements[id]||null;
    }
  };
  const window={ChampionshipHistoryModel:History,ChampionshipOddsModel:Forecast};
  const context={window,document,console,setTimeout,
    session:{user:{id:'p0'}},
    week:{season_id:'s'}};
  vm.runInNewContext(read('championship_history.js'),context,{filename:'championship_history.js'});
  return {api:window.ChampionshipHistory,parent,listeners,
    get html(){return historyNode?.innerHTML||''}};
}
test('history scripts and stylesheet load after the shared championship model',()=>{
  const html=read('index.html');
  const model=html.indexOf('championship_odds_model.js?v=1');
  const historyModel=html.indexOf('championship_history_model.js?v=1');
  const ui=html.indexOf('championship_history.js?v=1');
  assert.ok(model>0&&historyModel>model&&ui>historyModel);
  assert.match(html,/championship_history\.css\?v=1/);
  assert.match(html,/stats_v2\.js\?v=9/);
});
test('standings source mounts history both before and after Week 1',()=>{
  const source=read('stats_v2.js');
  assert.match(source,/window\.ChampionshipHistory\?\.render\(\{profiles,weeks,scores\},box\)/);
  assert.match(source,/status=eq\.published/);
  assert.match(source,/select=id,number,name,published_at,status,season_id/);
});
test('season odds appear as a graph with week selection and all eight player lines',async()=>{
  const h=boot();
  await h.api.render({profiles,weeks,scores},h.parent);
  assert.match(h.html,/Chance to Win It All/);
  assert.match(h.html,/<svg/);
  assert.match(h.html,/Season start/);
  assert.match(h.html,/Week 1/);
  assert.match(h.html,/Week 2/);
  assert.match(h.html,/data-ch-select/);
  assert.equal((h.html.match(/data-ch-player=/g)||[]).length,8);
  assert.match(h.html,/12\.5/);
  assert.match(h.html,/BACKFILLED ESTIMATES/);
});
test('week selector shows previous probabilities without fetching additional data',async()=>{
  const h=boot();
  await h.api.render({profiles,weeks,scores},h.parent);
  h.listeners.change({target:{matches:()=>true,value:'1'}});
  assert.match(h.html,/<h3>Week 1<\/h3>/);
  h.listeners.change({target:{matches:()=>true,value:'0'}});
  assert.match(h.html,/<h3>Season start<\/h3>/);
});
test('selecting a player can hide and restore only that line',async()=>{
  const h=boot();await h.api.render({profiles,weeks,scores},h.parent);
  const button={dataset:{chPlayer:'p0'}};
  h.listeners.click({target:{closest(q){return q==='[data-ch-player]'?button:null}}});
  assert.match(h.html,/data-ch-player="p0" aria-pressed="false"/);
  h.listeners.click({target:{closest(q){return q==='[data-ch-player]'?button:null}}});
  assert.match(h.html,/data-ch-player="p0" aria-pressed="true"/);
});
test('player names are escaped before SVG and legend rendering',async()=>{
  const h=boot();
  const changed=profiles.map((p,i)=>i===0?{...p,display_name:'<img onerror=alert(1)>'}:p);
  await h.api.render({profiles:changed,weeks,scores},h.parent);
  assert.doesNotMatch(h.html,/<img onerror=/);
  assert.match(h.html,/&lt;img onerror=/);
});
test('frozen postseason standings preserve both ranking and championship odds charts',()=>{
  const src=read('postseason.js');
  assert.match(src,/const titleHistory=box\.querySelector\('#championshipHistoryBox'\)/);
  assert.match(src,/if\(titleHistory\)box\.append\(titleHistory\)/);
});
test('background worker imports the same historical and championship forecast engines',()=>{
  const worker=read('championship_history_worker.js');
  assert.match(worker,/importScripts\('championship_odds_model\.js\?v=1','championship_history_model\.js\?v=1'\)/);
  assert.match(worker,/postMessage\(\{requestId,type:'done',snapshots\}\)/);
  new Function(worker);
});
test('mobile chart scrolls sideways and the week readout remains fully visible',()=>{
  const css=read('championship_history.css');
  assert.match(css,/\.ch-history-scroll\{[^}]*overflow-x:auto;overflow-y:hidden/);
  assert.match(css,/@media\(max-width:750px\)/);
  assert.match(css,/@media\(max-width:430px\)/);
  assert.match(css,/\.ch-history-results\{grid-template-columns:1fr\}/);
  assert.match(css,/touch-action:pan-x pan-y/);
});
