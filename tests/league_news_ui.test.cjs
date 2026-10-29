const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const News=require('../league_news_model.js');

const profiles=Array.from({length:8},(_,i)=>({id:'id-'+i,display_name:'Member '+(i+1)}));
const weeks=[1,2].map(n=>({id:'w'+n,number:n,name:'Week '+n,status:'published',phase:'regular',
  season_id:'season-2026',published_at:'2026-10-01'}));
const scores=weeks.flatMap(w=>profiles.map((p,i)=>({
  week_id:w.id,user_id:p.id,placement:i+1,
  correct_count:12-i,question_count:16,total_points:20-i+Number(w.number)
})));
function harness(changes={}){
  const hooks={preview:{},box:{}},queries=[],navigation=[];
  const makeNode=(key)=>({
    innerHTML:'',addEventListener(type,cb){hooks[key][type]=cb;},
    querySelectorAll(){return [];},
    querySelector(){return null;},
    classList:{contains(){return false;}}
  });
  const preview=makeNode('preview'),box=makeNode('box');
  const elements={
    leagueNewsPreview:preview,leagueNewsBox:box,
    app:{classList:{contains(){return false;}}},
    news:{classList:{contains(){return !navigation.includes('news');}}}
  };
  const document={
    getElementById(id){return elements[id]||null;},
    querySelector(selector){
      if(selector==='[data-page="news"]')return {dataset:{page:'news'}};
      return null;
    }
  };
  const db=async url=>{
    queries.push(url);
    if(url.startsWith('profiles?'))return changes.profiles||profiles;
    if(url.startsWith('weeks?'))return changes.weeks||weeks;
    if(url.startsWith('week_scores?'))return changes.scores||scores;
    throw new Error('Unexpected request: '+url);
  };
  const window={
    LeagueNewsModel:News,
    showPage(id){navigation.push(id)},
    renderHome(){}
  };
  const context={
    window,document,db,session:{user:{id:'id-0'}},
    week:{season_id:'season-2026'},
    console:{warn(){},debug(){},error(){}},
    setInterval(){},
  };
  vm.runInNewContext(read('league_news.js'),context,{filename:'league_news.js'});
  return {window,preview,box,queries,navigation,hooks,
    async load(){await window.LeagueNews.load({showArchive:true});},
    click(el,selector,dataset){
      const target={closest(q){return q===selector?{dataset}:null;}};
      el.click({target});
    }
  };
}
test('News navigation and home preview are included in the published page',()=>{
  const html=read('index.html');
  assert.match(html,/data-page="news"[^>]*>LTSPN<\/button>/);
  assert.match(html,/id="news" class="page hidden"/);
  assert.match(html,/id="leagueNewsPreview"/);
  assert.match(html,/id="leagueNewsBox"/);
  assert.match(html,/league_news\.css\?v=3/);
  assert.ok(html.indexOf('league_news_model.js?v=1')<html.indexOf('league_news.js?v=3'));
  assert.ok(html.indexOf('league_news_model.js?v=1')>0);
});
test('official latest week produces a home feature, without exposing private picks',async()=>{
  const h=harness();
  await h.load();
  assert.match(h.preview.innerHTML,/LTSPN/);
  assert.match(h.preview.innerHTML,/Week 2/);
  assert.match(h.preview.innerHTML,/Member 1 wins Week 2/);
  assert.ok(h.queries.filter(url=>url.startsWith('picks?')||url.startsWith('submissions?')).every(url=>url.includes('week_id=in.(w1,w2)')));
});
test('the full news page displays featured story, archived weeks and topic filters',async()=>{
  const h=harness();
  await h.load();
  assert.match(h.box.innerHTML,/<h2>LTSPN<\/h2>/);
  assert.match(h.box.innerHTML,/FEATURED STORY/);
  assert.match(h.box.innerHTML,/NEWS ARCHIVE/);
  assert.match(h.box.innerHTML,/data-ln-category="standings"/);
  assert.match(h.box.innerHTML,/data-ln-category="rivalries"/);
  assert.match(h.box.innerHTML,/data-ln-week-filter/);
});
test('topic filter removes unrelated articles without fabricating empty categories',async()=>{
  const h=harness();
  await h.load();
  h.hooks.box.click({target:{closest(q){return q==='[data-ln-category]'?
    {dataset:{lnCategory:'odds'}}:null;}}});
  assert.match(h.box.innerHTML,/No stories for these filters/);
  assert.doesNotMatch(h.box.innerHTML,/Member 1 wins Week 2/);
});
test('week selector narrows archive to only the selected published week',async()=>{
  const h=harness();
  await h.load();
  h.hooks.box.change({target:{matches(q){return q==='[data-ln-week-filter]';},value:'w1'}});
  assert.match(h.box.innerHTML,/Member 1 wins Week 1/);
  assert.doesNotMatch(h.box.innerHTML,/Member 1 wins Week 2/);
});
test('home feature navigates to News and requests its full story',async()=>{
  const h=harness();
  await h.load();
  h.hooks.preview.click({target:{closest(q){return q==='[data-ln-story]'?
    {dataset:{lnStory:'w2:winner'}}:null;}}});
  assert.deepEqual(h.navigation,['news']);
  assert.match(h.box.innerHTML,/data-news-story="w2:winner"/);
});
test('article text is safely escaped, even when member names contain HTML',async()=>{
  const h=harness({profiles:profiles.map((p,i)=>i===0?{...p,display_name:'<img src=x onerror=alert(1)>'}:p)});
  await h.load();
  assert.doesNotMatch(h.box.innerHTML,/<img src=x/);
  assert.match(h.box.innerHTML,/&lt;img src=x/);
});
test('only published weeks are requested and scoring remains read-only',async()=>{
  const h=harness();
  await h.load();
  assert.ok(h.queries.some(url=>url.includes('status=eq.published')));
  assert.ok(h.queries.every(url=>!url.includes('method=POST') && (!url.startsWith('submissions?') || url.includes('week_id=in.(w1,w2)'))));
});
test('the layout uses one-column cards on phones without trapping vertical scrolling',()=>{
  const css=read('league_news.css');
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/\.ln-archive\{grid-template-columns:1fr\}/);
  assert.match(css,/touch-action:pan-x pan-y/);
  assert.doesNotMatch(css,/position:sticky/);
});
test('existing League Central weekly headlines use official placement, not bonus points',()=>{
  const src=read('league_central.js');
  assert.match(src,/status=eq.published/);
  assert.match(src,/Number\(s\.placement\)===1/);
  assert.match(src,/correct picks/);
});

test('LTSPN branding includes the logo slot and reliable fallback in both positions',async()=>{
  const h=harness();await h.load();
  assert.match(h.preview.innerHTML,/class="ln-brand-logo" src="ltspn-logo\.png"/);
  assert.match(h.box.innerHTML,/class="ln-brand-logo" src="ltspn-logo\.png"/);
  assert.match(h.box.innerHTML,/ltspn-wordmark\.svg/);
  assert.match(read('ltspn-wordmark.svg'),/LTSPN/);
  assert.match(read('league_news.css'),/\.ln-brandmark-large/);
});
