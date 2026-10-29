const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const model=require('../playoff_race_model.js');

function fixture({scheduled=false,locked=true,name='Member One'}={}){
  const entries=Array.from({length:8},(_,i)=>({
    user_id:'member-'+i,display_name:i===0?name:'Member '+(i+1),
    seed:i+1,status:'active',current_total:20-i,starting_bonus:10-i
  }));
  const round={id:'round-1',round_number:1,status:'live',label:'Playoff Week 1',
    participants_before:8,participants_after:6};
  const rows=entries.map((e,i)=>({
    user_id:e.user_id,display_name:e.display_name,seed:e.seed,round_rank:i+1,sort_index:i+1,
    cumulative_after:20-i,round_correct:0,projected_status:i<6?'projected_advance':'projected_out',
    cut_tie:false
  }));
  return {
    settings:{season_id:'season',status:scheduled?'scheduled':'live'},
    entries:scheduled?[]:entries,rounds:scheduled?[]:[round],history:[],
    calendar:model.STAGES.map(x=>({phase:'playoff',round_number:x.number,label:x.title,
      starts_on:'2027-01-12',ends_on:'2027-01-18'})),
    current:scheduled?null:{round,rows,locked,question_count:14,decided_count:8,
      revision:'rev',tiebreaker_pending:true}
  };
}

function harness(){
  let root=null,clickHandler=null;
  const tabs={scrollLeft:0};
  const anchor={before(node){root=node;node.parentElement=box;}};
  const fallback={classList:{add(){}}};
  const box={
    querySelector(selector){
      if(selector==='.ps-race'||selector==='.ps-format')return anchor;
      if(selector==='.ps-funnel')return fallback;
      return null;
    },
    contains(node){return node===root;}
  };
  const document={
    createElement(tag){
      const el={
        dataset:{},innerHTML:'',setAttribute(){},
        addEventListener(type,cb){if(type==='click')clickHandler=cb;},
        querySelector(selector){
          if(selector==='.ps-road-stages')return tabs;
          if(selector.startsWith('[data-road-stage'))return {focus(){}};
          return null;
        },
        querySelectorAll(){return []},
        contains(){return true}
      };
      return el;
    },
    getElementById(id){
      if(id==='playoffBox')return box;
      if(id==='psRoadTrackerRoot')return root;
      return null;
    }
  };
  const window={PlayoffRaceModel:model};
  vm.runInNewContext(read('playoff_race.js'),{window,document,session:{user:{id:'member-0'}}});
  return {
    get root(){return root;},
    run(data){window.PlayoffRace.render(data);},
    select(number){
      const stage={dataset:{roadStage:String(number)}};
      clickHandler({target:{closest(selector){return selector==='[data-road-stage]'?stage:null;}}});
    },
    selectMember(id){
      const member={dataset:{survivalMember:id}};
      clickHandler({target:{closest(selector){return selector==='[data-survival-member]'?member:null;}}});
    }
  };
}
test('Playoffs loads the interactive road scripts before the postseason renderer',()=>{
  const html=read('index.html');
  const a=html.indexOf('playoff_race_model.js?v=1');
  const b=html.indexOf('playoff_race.js?v=1');
  const c=html.indexOf('postseason.js?v=11');
  assert.ok(a>0&&a<b&&b<c);
  assert.match(html,/playoff_race\.css\?v=1/);
  assert.match(read('postseason.js'),/window\.PlayoffRace\?\.render\(data\)/);
});
test('both panels render current scores and current-round survival without requesting new data',()=>{
  const h=harness();
  h.run(fixture());
  assert.ok(h.root);
  assert.match(h.root.innerHTML,/One trophy\. Four cuts\./);
  assert.match(h.root.innerHTML,/LIVE SURVIVAL TRACKER/);
  assert.match(h.root.innerHTML,/Member One/);
  assert.match(h.root.innerHTML,/6 advance/);
  assert.match(h.root.innerHTML,/8 → 6/);
});
test('round selectors navigate to future and past stages',()=>{
  const h=harness();h.run(fixture());
  h.select(3);
  assert.match(h.root.innerHTML,/Semifinals/);
  assert.match(h.root.innerHTML,/Field to be determined/);
  h.select(5);
  assert.match(h.root.innerHTML,/The championship is still ahead/);
  h.select(1);
  assert.match(h.root.innerHTML,/Playoff Week 1/);
});
test('selected member reveals their personalized advancement situation',()=>{
  const h=harness();h.run(fixture());
  h.selectMember('member-7');
  assert.match(h.root.innerHTML,/SURVIVAL OUTLOOK/);
  assert.match(h.root.innerHTML,/Member 8/);
});
test('the scheduled road is useful before playoffs and does not invent entrants',()=>{
  const h=harness();h.run(fixture({scheduled:true}));
  assert.match(h.root.innerHTML,/One trophy\. Four cuts\./);
  assert.match(h.root.innerHTML,/Field to be determined/);
  assert.doesNotMatch(h.root.innerHTML,/LIVE SURVIVAL TRACKER/);
});
test('untrusted member names are escaped before being inserted into HTML',()=>{
  const h=harness();h.run(fixture({name:'<img src=x onerror=alert(1)>'}));
  assert.doesNotMatch(h.root.innerHTML,/<img src=x/);
  assert.match(h.root.innerHTML,/&lt;img src=x/);
});
test('the mobile view scrolls horizontally through round buttons without trapping the page',()=>{
  const css=read('playoff_race.css');
  assert.match(css,/\.ps-road-stages\{[^}]*overflow-x:auto;overflow-y:hidden/);
  assert.match(css,/@media\(max-width:480px\)/);
  assert.match(css,/\.ps-road-field\{grid-template-columns:1fr\}/);
  assert.match(css,/\.ps-survival-row\{grid-template-columns:29px/);
  assert.doesNotMatch(css,/position:sticky/);
});
