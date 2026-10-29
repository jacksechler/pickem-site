const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const News=require('../league_news_model.js');
const Editorial=require('../ltspn_editorial_model.js');

const people=Array.from({length:8},(_,i)=>({id:'person-'+i,display_name:'Reader '+(i+1)}));
const weeks=[1,2].map(n=>({id:'w'+n,number:n,name:'Week '+n,
  phase:'regular',season_id:'season',status:'published'}));
const scores=weeks.flatMap(w=>people.map((p,i)=>({
  week_id:w.id,user_id:p.id,placement:i+1,correct_count:12-i,
  question_count:12,total_points:18-i+Number(w.number)
})));
const questions=weeks.flatMap(w=>Array.from({length:12},(_,i)=>({
  id:w.id+'-q'+i,week_id:w.id,prompt:'NFL matchup '+(i+1)+' of '+w.name,
  result:i%2?'Away':'Home',position:i+1,counts_for_score:true,sport:'NFL'
})));
const picks=questions.flatMap(q=>people.map((p,i)=>({
  week_id:q.week_id,user_id:p.id,question_id:q.id,
  answer:i===0?'Home':i<4?q.result:(q.result==='Home'?'Away':'Home')
})));
function setup({noPickData=false}={}){
  let preview=null,archive=null;
  const nodes={
    leagueNewsPreview:{innerHTML:'',addEventListener(){},classList:{contains(){return false}}},
    leagueNewsBox:{innerHTML:'',addEventListener(){},querySelectorAll(){return []}},
    home:{classList:{contains(){return true}}},
    news:{classList:{contains(){return false}}},
    app:{classList:{contains(){return false}}}
  };
  const queries=[];
  const document={
    getElementById:id=>nodes[id]||null,
    querySelector:()=>null
  };
  async function db(url){
    queries.push(url);
    if(url.startsWith('profiles?'))return people;
    if(url.startsWith('weeks?'))return weeks;
    if(url.startsWith('week_scores?'))return scores;
    if(url.startsWith('questions?'))return questions;
    if(url.startsWith('submissions?'))return people.flatMap(p=>weeks.map(w=>({
      week_id:w.id,user_id:p.id,tiebreaker_answer:45
    })));
    if(url.startsWith('picks?')){
      if(noPickData)throw Error('answers unavailable');
      const offset=Number(url.match(/offset=(\d+)/)?.[1]||0);
      const limit=Number(url.match(/limit=(\d+)/)?.[1]||700);
      return picks.slice(offset,offset+limit);
    }
    throw Error('Unexpected query '+url);
  }
  const window={LeagueNewsModel:News,LTSPNEditorialModel:Editorial,showPage(){},renderHome(){}};
  const context={window,db,document,session:{user:{id:'person-0'}},week:{season_id:'season'},
    console:{debug(){},warn(){},error(){}},setInterval(){}};
  vm.runInNewContext(read('league_news.js'),context,{filename:'league_news.js'});
  return {queries,nodes,load:()=>window.LeagueNews.load({force:true,showArchive:true})};
}
test('news page loads original LTSPN artwork and editorial module in correct order',()=>{
  const html=read('index.html');
  const main=html.indexOf('league_news_model.js?v=2'),feature=html.indexOf('ltspn_editorial_model.js?v=2'),
    ui=html.indexOf('league_news.js?v=3');
  assert.ok(main>0&&main<feature&&feature<ui);
  assert.match(html,/league_news\.css\?v=3/);
  assert.match(html,/data-page="news"[^>]*>LTSPN/);
  const logo=fs.statSync(path.join(root,'ltspn-logo.png'));
  assert.ok(logo.size>1000);
  assert.match(read('league_news.js'),/src="ltspn-logo\.png"/);
});
test('feature story is an expanded article with specific questions, results and cards',async()=>{
  const h=setup();await h.load();
  const html=h.nodes.leagueNewsBox.innerHTML;
  assert.match(html,/data-news-story="w2:deep-dive"/);
  assert.match(html,/THE PICKS THAT MATTERED/);
  assert.match(html,/NFL matchup \d+ of Week 2/);
  assert.match(html,/Official result: <b>Home<\/b>/);
  assert.match(html,/ln-article-copy/);
  assert.match(html,/ln-article-stats/);
  assert.match(html,/min read/);
  assert.match(html,/data-news-story="w1:deep-dive"/);
});
test('all detailed pick-data requests remain scoped to published week IDs',async()=>{
  const h=setup();await h.load();
  for(const q of h.queries.filter(x=>/questions\?|picks\?|submissions\?/.test(x))){
    assert.match(q,/week_id=in\.\(w1,w2\)/);
    assert.doesNotMatch(q,/live|draft/);
  }
});
test('insufficient access to archived pick ledger degrades safely to verified scores',async()=>{
  const h=setup({noPickData:true});await h.load();
  const html=h.nodes.leagueNewsBox.innerHTML;
  assert.match(html,/w2:deep-dive/);
  assert.match(html,/archive is not available/);
  assert.doesNotMatch(html,/NFL matchup 1 of Week 2/);
});
test('white-and-red styles are scoped to LTSPN without recoloring league standings',()=>{
  const css=read('league_news.css');
  assert.match(css,/#news\{color:#211f21;background:#fff/);
  assert.match(css,/#news \.ln-masthead\{background:#fff/);
  assert.match(css,/#news \.ln-story\{background:#fff/);
  assert.match(css,/#news \.ln-article-copy p\{/);
  assert.match(css,/#leagueNewsPreview \.ln-home\{/);
  assert.match(css,/@media\(max-width:630px\)/);
  assert.doesNotMatch(css,/\.clean-ui\s*\{\s*background:#fff/);
});
