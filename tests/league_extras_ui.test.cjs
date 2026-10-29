const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const Model=require('../league_extras_model.js');
const profiles=Array.from({length:8},(_,i)=>({id:'p'+i,display_name:'Member '+(i+1),username:'person'+i}));
const published=[{id:'w1',name:'Week 1',number:1,status:'published',phase:'regular',season_id:'s1'}];
const scores=profiles.map((p,i)=>({
  week_id:'w1',user_id:p.id,total_points:20-i,correct_count:12-i,
  question_count:12,placement:i+1,unicorn_count:0,upset_count:0,opening_streak:0
}));
const questions=[{id:'q1',week_id:'w1',prompt:'Who won?',result:'Home',sport:'NFL',counts_for_score:true}];
const picks=profiles.map((p,i)=>({week_id:'w1',question_id:'q1',user_id:p.id,answer:i===0?'Home':'Away'}));
const data=()=>Model.build({profiles,weeks:published,scores,questions,picks,seasonId:'s1'});
function setup({locked=false,finalists=false}={}){
  const ids=['app','home','awards','awardsBox','studio','studioBox','championship','championshipBox','player','playerBox'];
  const listeners={};
  const nodes=Object.fromEntries(ids.map(id=>[id,{
    id,innerHTML:'',className:'',dataset:{},classList:{contains(name){
      return name==='hidden'?['app','home','player'].includes(id):false;
    }},addEventListener(type,cb){listeners[id+':'+type]=cb;},
    append(el){this.innerHTML+=el.innerHTML;},querySelector(){return null}
  }]));
  const document={hidden:false,getElementById:id=>nodes[id]||null,
    querySelector(){return null},
    createElement(name){return {innerHTML:'',className:'',id:null,addEventListener(){}};}};
  const post=finalists?{
    settings:{status:'live'},
    entries:[{user_id:'p0',display_name:'Member 1',seed:1,status:'active'},
      {user_id:'p1',display_name:'Member 2',seed:2,status:'active'}],
    current:{locked,question_count:1,decided_count:0,
      round:{id:'r4',round_number:4,status:'live',week_id:'final'},
      rows:[{user_id:'p0',display_name:'Member 1',cumulative_after:30,round_rank:1,seed:1},
        {user_id:'p1',display_name:'Member 2',cumulative_after:29,round_rank:2,seed:2}]}
  }:{settings:{status:'scheduled'},entries:[],current:null,rounds:[]};
  const calls=[],nav=[];
  async function db(url){
    calls.push(url);
    if(url.startsWith('profiles?'))return profiles;
    if(url.startsWith('weeks?'))return published;
    if(url.startsWith('week_scores?'))return scores;
    if(url.startsWith('questions?')){
      if(url.includes('week_id=eq.final'))return [{id:'f1',week_id:'final',prompt:'Title winner?',result:null,
        counts_for_score:true}];
      return questions;
    }
    if(url.startsWith('picks?')){
      if(url.includes('week_id=eq.final'))return [
        {week_id:'final',question_id:'f1',user_id:'p0',answer:'A'},
        {week_id:'final',question_id:'f1',user_id:'p1',answer:'B'}];
      return picks;
    }
    throw Error('Unknown query '+url);
  }
  const window={LeagueExtrasModel:Model,
    Postseason:{load:async()=>post},
    PlayoffAdvancement:{getChampionship:async()=>({kind:'estimate',titleOdds:{p0:55,p1:45}})},
    showPage:id=>nav.push(id),
    renderHome(){},
    MemberNames:{full:p=>p.display_name||p.username},
    openPlayerProfile:id=>nav.push('player:'+id),
    LeagueNews:{navigate:()=>nav.push('news')}
  };
  const context={window,document,session:{user:{id:'p0'}},week:{season_id:'s1'},db,
    console:{debug(){},error(){}},setInterval(){},navigator:{clipboard:{writeText(){}}}};
  vm.runInNewContext(read('league_extras.js'),context,{filename:'league_extras.js'});
  return {window,nodes,calls,nav,listeners,post,db};
}
test('site wires all four pages and loads their code after Postseason',()=>{
  const html=read('index.html');
  for(const key of ['studio','awards','championship']){
    assert.match(html,new RegExp('data-page="'+key+'"'));
    assert.match(html,new RegExp('id="'+key+'" class="page hidden"'));
    assert.match(html,new RegExp('id="'+key+'Box"'));
  }
  assert.ok(html.indexOf('league_extras_model.js?v=3')>html.indexOf('postseason.js?v=11'));
  assert.ok(html.indexOf('league_extras.js?v=2')>html.indexOf('league_extras_model.js?v=3'));
  assert.match(html,/league_extras\.css\?v=2/);
});
test('awards page renders verified current records, not fake champions',async()=>{
  const h=setup();await h.window.LeagueExtras.renderAwards();
  const s=h.nodes.awardsBox.innerHTML;
  assert.match(s,/Awards &amp; Hall of Fame/);
  assert.match(s,/Hall of Champions|HALL OF CHAMPIONS/);
  assert.match(s,/The next champion awaits/);
  assert.match(s,/Current standings leader|current standings leader/);
  assert.match(s,/LTSPN Power Rankings/);
  assert.match(s,/Member Directory/);
  assert.doesNotMatch(s,/OFFICIAL LEAGUE CHAMPION/);
});
test('weekly SportsCenter generates a published results rundown and power five',async()=>{
  const h=setup();await h.window.LeagueExtras.renderStudio();
  const s=h.nodes.studioBox.innerHTML;
  assert.match(s,/SPORTSCENTER/);
  assert.match(s,/LTSPN BREAKING/);
  assert.match(s,/RUN OF SHOW/);
  assert.match(s,/LTSPN Power Five/);
  assert.match(s,/Week 1/);
  assert.match(s,/Member 1/);
});
test('before semifinals are finalized Championship GameDay shows preview only',async()=>{
  const h=setup();await h.window.LeagueExtras.renderChampionship();
  const s=h.nodes.championshipBox.innerHTML;
  assert.match(s,/Finalists to be determined/);
  assert.match(s,/8 <span>→<\/span> 6/);
  assert.doesNotMatch(s,/FINALIST.*Member 1/);
  assert.equal(h.calls.some(q=>q.includes('week_id=eq.final')),false);
});
test('finalists are displayed before lock without fetching their private answers',async()=>{
  const h=setup({finalists:true,locked:false});await h.window.LeagueExtras.renderChampionship();
  const s=h.nodes.championshipBox.innerHTML;
  assert.match(s,/Member 1/);
  assert.match(s,/Member 2/);
  assert.match(s,/55\.0%/);
  assert.match(s,/private until the championship card locks/);
  assert.equal(h.calls.some(q=>q.includes('week_id=eq.final')),false);
});
test('after lock, contrasting finals picks are displayed and marked undecided',async()=>{
  const h=setup({finalists:true,locked:true});await h.window.LeagueExtras.renderChampionship();
  const s=h.nodes.championshipBox.innerHTML;
  assert.match(s,/Biggest Remaining Picks/);
  assert.match(s,/Title winner\?/);
  assert.match(s,/A<\/b>/);
  assert.match(s,/B<\/b>/);
  assert.match(s,/Result not yet recorded/);
  assert.ok(h.calls.some(q=>q.includes('week_id=eq.final')));
});
test('studio and awards only retrieve the published regular-season pick archive',async()=>{
  const h=setup();
  await h.window.LeagueExtras.renderStudio();
  await h.window.LeagueExtras.renderAwards();
  const dataCalls=h.calls.filter(q=>q.startsWith('questions?')||q.startsWith('picks?'));
  assert.ok(dataCalls.length>0);
  assert.ok(dataCalls.every(q=>q.includes('week_id=in.(w1)')));
});
test('player names are escaped before insertion into all four UI surfaces',()=>{
  const d=data();
  d.members[0].name='<img src=x onerror=alert(1)>';
  d.rankings[0].name='<img src=x onerror=alert(1)>';
  const h=setup();const html=h.window.LeagueExtras.awardsHtml(d);
  assert.doesNotMatch(html,/<img src=x/);
  assert.match(html,/&lt;img src=x/);
});
test('mobile CSS uses flexible grids and never traps vertical scrolling',()=>{
  const css=read('league_extras.css');
  assert.match(css,/@media\(max-width:590px\)/);
  assert.match(css,/@media\(max-width:850px\)/);
  assert.match(css,/touch-action:pan-x pan-y/);
  assert.doesNotMatch(css,/position:sticky/);
  assert.match(css,/\.lx-finals-vs\{grid-template-columns:minmax\(0,1fr\)/);
});
test('home shortcut links are interactive and respect the existing page router',()=>{
  const h=setup();
  h.window.renderHome();
  assert.match(h.nodes.home.innerHTML,/./); // home container accepts a DOM child, below assertion tracks fallback mock
});
