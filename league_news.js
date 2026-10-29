// LTSPN UI. Read-only official results; no database writes or invented interviews.
(() => {
  const Model=window.LeagueNewsModel;
  const History=window.ChampionshipHistoryModel;
  const Editorial=window.LTSPNEditorialModel;
  if(!Model)return;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const LABELS={weekly:'Weekly results',standings:'Standings',records:'Records',
    rivalries:'Rivalries',odds:'Title odds',playoffs:'Playoffs'};
  const COLORS={weekly:'gold',standings:'blue',records:'green',
    rivalries:'purple',odds:'gold',playoffs:'red'};
  let request=0,lastCache=null,selectedCategory='all',selectedWeek='all',
    openStory=null,activeWorker=null,activeOddsKey=null,oddsMemo=new Map();
  const viewer=()=>typeof session!=='undefined'&&!!session?.user?.id;
  const visibleNews=()=>viewer()&&!$('news')?.classList.contains('hidden')&&!$('app')?.classList.contains('hidden');
  const getSeason=()=>typeof week!=='undefined'?week?.season_id||null:null;
  const keyOf=d=>JSON.stringify([d.season,d.weeks.map(w=>[w.id,w.status,w.number]),
    d.scores.map(s=>[s.week_id,s.user_id,s.placement,s.correct_count,s.total_points]),
    d.postseason?.settings?.status,d.postseason?.history||[]]);
  function cleanCategory(v){return v==='all'||LABELS[v]?v:'all';}
  function storyTag(story){
    const color=COLORS[story.category]||'gold';
    return '<span class="ln-tag ln-tag-'+color+'">'+esc(LABELS[story.category]||'LTSPN coverage')+'</span>';
  }
  function headlines(data){
    // The newest official playoff round always leads; otherwise show the most recent
    // published regular-season week, ordered by factual editorial importance.
    const stories=data.stories;
    return stories.slice(0,3);
  }
  function articleHtml(story,featured=false,expanded=false){
    const ids=story.playerIds||story.winnerIds||[];
    const isPlayoff=story.group==='playoffs';
    const source=isPlayoff?'Finalized playoff results':'Published weekly standings';
    const likelihood=story.category==='odds'?' · Reconstructed model estimate':'';
    const highlights=Array.isArray(story.highlights)?story.highlights:[];
    const stats=Array.isArray(story.stats)?story.stats:[];
    const factStrip=stats.length?'<div class="ln-article-stats">'+stats.map(x=>
      '<div><span>'+esc(x.label)+'</span><strong>'+esc(x.value)+'</strong></div>').join('')+'</div>':'';
    const highlightsHtml=highlights.length?
      '<section class="ln-impact" aria-label="Biggest picks"><h4>THE PICKS THAT MATTERED</h4>'+
      '<p>Actual scored questions and how the eight league members answered them.</p>'+
      '<div class="ln-impact-list">'+highlights.map((x,i)=>
        '<div class="ln-impact-item"><span class="ln-impact-number">'+String(i+1).padStart(2,'0')+'</span>'+
        '<div><strong>'+esc(x.prompt)+'</strong>'+
        '<div class="ln-impact-answer">Official result: <b>'+esc(x.outcome)+'</b></div>'+
        '<div class="ln-impact-stat">'+esc(x.correctCount)+' of '+esc(x.fieldSize)+
        ' correct'+(x.correctNames?.length?' · '+esc(x.correctNames.join(', ')):'')+'</div></div></div>'
      ).join('')+'</div></section>':'';
    const byline='<div class="ln-byline"><b>LTSPN REPORTING</b><span>Verified league results</span>'+
      (story.readMinutes?'<span>'+esc(story.readMinutes)+' min read</span>':'')+'</div>';
    return '<details class="ln-story'+(featured?' ln-story-featured':'')+'" '+
      (expanded?'open ':'')+'data-news-story="'+esc(story.id)+'">'+
      '<summary class="ln-story-summary">'+
      '<div class="ln-story-meta">'+storyTag(story)+'<span>'+esc(story.weekName)+'</span></div>'+
      '<h3>'+esc(story.headline)+'</h3><p>'+esc(story.deck)+'</p>'+byline+
      '<span class="ln-read">Read the full story <span aria-hidden="true">+</span></span></summary>'+
      '<div class="ln-story-body">'+factStrip+
      '<div class="ln-article-copy">'+story.body.map((p,i)=>'<p class="'+(i===0?'ln-article-lead':'')+'">'+esc(p)+'</p>').join('')+'</div>'+highlightsHtml+
      '<div class="ln-story-source">'+esc(source+likelihood)+
      (story.group==='regular'?' · '+esc(story.weekName):'')+'</div></div></details>';
  }
  // The publication uses the user's original artwork at ltspn-logo.png when
  // that image is present in the repository; fall back to the LTSPN wordmark.
  function brandMark(large=false){
    return '<span class="ln-brandmark'+(large?' ln-brandmark-large':'')+'">'+
      '<img class="ln-brand-logo" src="ltspn-logo.png" alt="LTSPN logo" '+
      'onerror="this.onerror=null;this.src=\'ltspn-wordmark.svg\'"></span>';
  }
  function emptyHtml(){
    return '<div class="ln-zero"><div class="ln-eyebrow">LTSPN</div>'+
      '<h3>The season is writing its first story.</h3>'+
      '<p>Weekly headlines, standings shifts, rivalries and record-breaking performances appear as soon as a week is officially published.</p></div>';
  }
  function renderPreview(data){
    const el=$('leagueNewsPreview');if(!el)return;
    if(!data?.stories?.length){
      el.innerHTML='<section class="ln-home"><div class="ln-home-head"><div><div class="ln-brandline">'+brandMark()+'<div><div class="ln-eyebrow">OFFICIAL LEAGUE NEWS</div><h2>LTSPN</h2></div></div></div><button type="button" class="ln-home-link" data-ln-open-news>Open News</button></div>'+emptyHtml()+'</section>';
      return;
    }
    const stories=headlines(data);
    const top=stories[0];
    el.innerHTML='<section class="ln-home"><div class="ln-home-head"><div><div class="ln-brandline">'+brandMark()+'<div><div class="ln-eyebrow">AUTOMATIC LEAGUE COVERAGE</div><h2>LTSPN</h2></div></div></div><button type="button" class="ln-home-link" data-ln-open-news>All Stories</button></div>'+
      '<button type="button" class="ln-home-feature" data-ln-story="'+esc(top.id)+'"><span class="ln-home-kicker">'+
      esc(top.weekName)+' · '+esc(LABELS[top.category]||'Latest')+'</span><strong>'+
      esc(top.headline)+'</strong><span>'+esc(top.deck)+'</span><span class="ln-home-action">Read story ›</span></button>'+
      '<div class="ln-home-links">'+stories.slice(1).map(story=>
      '<button type="button" data-ln-story="'+esc(story.id)+'"><span>'+esc(story.weekName)+
      '</span><strong>'+esc(story.headline)+'</strong></button>').join('')+'</div>'+
      '<p class="ln-home-foot">Based on official league results, not generated rumors or fictional quotes.</p></section>';
  }
  function filterStories(data){
    const category=cleanCategory(selectedCategory);
    return data.stories.filter(s=>(category==='all'||s.category===category)&&
      (selectedWeek==='all'||s.weekId===selectedWeek));
  }
  function archiveHtml(data,loadingOdds=false){
    const storyList=filterStories(data);
    const featured=storyList[0];
    const archive=storyList.slice(1);
    const categories=[['all','All stories'],...Object.entries(LABELS)];
    const weekChoices=[...data.entries].reverse().map(w=>[w.id,w.name]);
    const playoffChoices=data.playoffs.map(p=>[p.weekId,p.weekName]).filter(p=>p[0]);
    const opts=[['all','All weeks'],...playoffChoices,...weekChoices];
    const selected=opts.some(p=>p[0]===selectedWeek)?selectedWeek:'all';
    selectedWeek=selected;
    let html='<div class="ln-page"><div class="ln-masthead"><div class="ln-brandline ln-brandline-large">'+brandMark(true)+'<div class="ln-eyebrow">YOUR LEAGUE, YOUR HEADLINES</div></div>'+
      '<h2>LTSPN</h2><p>League news, every week, from opening kickoff through the championship. Every headline backed by official results.</p>'+
      '<div class="ln-stats"><span>'+data.weekCount+' regular-season week'+(data.weekCount===1?'':'s')+' covered</span>'+
      '<span>'+data.stories.length+' verified stories</span></div></div>'+
      '<div class="ln-filters"><div class="ln-tabs" role="group" aria-label="Filter news by topic">'+categories.map(([id,label])=>
      '<button type="button" data-ln-category="'+esc(id)+'" class="'+(id===selectedCategory?'active':'')+
      '" aria-pressed="'+(id===selectedCategory?'true':'false')+'">'+esc(label)+'</button>').join('')+
      '</div><label for="lnWeekFilter">Archive week <select id="lnWeekFilter" data-ln-week-filter>'+
      opts.map(([id,name])=>'<option value="'+esc(id)+'" '+(id===selected?'selected':'')+'>'+esc(name)+'</option>').join('')+
      '</select></label></div>';
    if(featured){
      html+='<div class="ln-section-label"><span>FEATURED STORY</span><span>'+esc(featured.weekName)+'</span></div>'+
        articleHtml(featured,true,!openStory||featured.id===openStory);
      if(archive.length){
        html+='<div class="ln-section-label"><span>NEWS ARCHIVE</span><span>'+archive.length+' more stories</span></div>'+
          '<div class="ln-archive">'+archive.map(story=>articleHtml(story,false,story.id===openStory)).join('')+'</div>';
      }
    }else html+='<div class="ln-zero"><h3>No stories for these filters</h3><p>Try a different topic or week.</p></div>';
    if(data.issues.length){
      html+='<p class="ln-disclaimer">'+data.issues.length+' published week'+(data.issues.length===1?' has':'s have')+
        ' incomplete official score records and '+(data.issues.length===1?'is':'are')+' excluded until verified.</p>';
    }
    html+='<p class="ln-disclaimer">Headlines are generated automatically from published league results. Rivalries are factual pick-total comparisons, not scheduled matchups. No interviews, quotes or game details are invented.'+
      (loadingOdds?' Championship-odds change stories are being reconstructed from earlier published weeks.':' Championship-odds changes are retrospective estimates, not saved predictions from that time.')+
      '</p></div>';
    return html;
  }
  function renderArchive(data,loadingOdds=false){
    const el=$('leagueNewsBox');if(!el)return;
    // Preserve browser focus when changing category or week.
    el.innerHTML=archiveHtml(data,loadingOdds);
    const targeted=openStory&&[...el.querySelectorAll('[data-news-story]')].find(n=>n.dataset.newsStory===openStory);
    if(targeted)targeted.open=true;
  }
  function buildData(raw,oddsSnapshots=[]){
    const verified=Model.build({profiles:raw.profiles,weeks:raw.weeks,scores:raw.scores,
      oddsSnapshots,postseason:raw.postseason,seasonId:raw.season});
    return Editorial?.build?.({news:verified,profiles:raw.profiles,weeks:raw.weeks,
      scores:raw.scores,questions:raw.questions||[],picks:raw.picks||[],
      submissions:raw.submissions||[],seasonId:raw.season})||verified;
  }
  async function fetchAnswerArchive(published){
    if(!published.length)return {questions:[],picks:[],submissions:[]};
    const ids=published.map(w=>w.id).filter(Boolean);
    const expression='in.('+ids.join(',')+')';
    // Only officially PUBLISHED week IDs can be read here.
    // Include all the scored questions and complete eight-member pick ledgers,
    // never the current live/draft week's private answers.
    try{
      const [questions,submissions]=await Promise.all([
        db('questions?select=id,week_id,prompt,sport,result,counts_for_score,result_order,position&week_id='+expression+'&order=week_id.asc,position.asc'),
        db('submissions?select=week_id,user_id,tiebreaker_answer&week_id='+expression)
      ]);
      if(!Array.isArray(questions)||!Array.isArray(submissions))throw Error('Answer archive incomplete');
      const picks=[];
      const pageSize=700;
      for(let offset=0;offset<7000;offset+=pageSize){
        const page=await db('picks?select=week_id,user_id,question_id,answer&week_id='+expression+
          '&order=week_id.asc,question_id.asc,user_id.asc&limit='+pageSize+'&offset='+offset);
        if(!Array.isArray(page))throw Error('Answer page incomplete');
        picks.push(...page);
        if(page.length<pageSize)break;
      }
      return {questions,picks,submissions};
    }catch(error){
      console.debug('LTSPN detailed picks temporarily unavailable',error);
      return {questions:[],picks:[],submissions:[]};
    }
  }
  async function fetchOfficialData(){
    const [profiles,weeks,scores]=await Promise.all([
      db('profiles?select=id,display_name,username'),
      db('weeks?phase=eq.regular&status=eq.published&select=id,name,number,phase,status,season_id,published_at&order=number.asc'),
      db('week_scores?select=week_id,user_id,placement,correct_count,question_count,total_points,weeks!inner(phase,status)&weeks.phase=eq.regular&weeks.status=eq.published')
    ]);
    if(!Array.isArray(profiles)||!Array.isArray(weeks)||!Array.isArray(scores))throw Error('Published league results unavailable.');
    const season=getSeason();
    const published=weeks.filter(w=>!season||w.season_id===season);
    const IDs=new Set(published.map(w=>w.id));
    const relevantScores=scores.filter(s=>IDs.has(s.week_id));
    const answerArchive=await fetchAnswerArchive(published);
    let postseason=null;
    if(window.Postseason?.load){
      try {
        const info=await window.Postseason.load(season||undefined);
        if(info&&['live','complete'].includes(info.settings?.status))postseason=info;
      }catch(e){console.debug('Playoff news temporarily unavailable',e);}
    }
    return {profiles,weeks:published,scores:relevantScores,postseason,season,
      ...answerArchive};
  }
  function leagueSignature(raw){
    return JSON.stringify([raw.season,raw.weeks.map(w=>[w.id,w.number,w.status]),
      raw.scores.map(s=>[s.week_id,s.user_id,s.placement,s.correct_count,s.total_points])
        .sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),
      raw.postseason?.history||[],
      (raw.questions||[]).map(q=>[q.id,q.result]),
      (raw.picks||[]).map(p=>[p.week_id,p.question_id,p.user_id,p.answer]),
      (raw.submissions||[]).map(x=>[x.week_id,x.user_id,x.tiebreaker_answer])]);
  }
  async function fetch(force=false){
    if(!force&&lastCache&&Date.now()-lastCache.at<90000)return lastCache;
    const raw=await fetchOfficialData();
    const signature=leagueSignature(raw);
    if(lastCache?.signature===signature){
      lastCache.at=Date.now();
      return lastCache;
    }
    const odds=oddsMemo.get(signature)||[];
    lastCache={at:Date.now(),signature,raw,odds,
      data:buildData(raw,odds)};
    return lastCache;
  }
  function doWorker(timeline,signature){
    if(!History?.buildTimeline||typeof Worker!=='function')return;
    if(activeOddsKey===signature||oddsMemo.has(signature))return;
    const t=History.buildTimeline({profiles:timeline.profiles,weeks:timeline.weeks,
      scores:timeline.scores,seasonId:timeline.season,regularWeekCount:20});
    if(t.kind!=='ready'||t.weekCount<2)return;
    activeWorker?.terminate?.();activeWorker=null;
    const requestId='news:'+signature.length+':'+Date.now();
    try{
      const w=new Worker('championship_history_worker.js?v=1');
      activeWorker=w;activeOddsKey=signature;
      w.onmessage=event=>{
        if(event.data?.requestId!==requestId)return;
        if(event.data.type==='error'){
          activeOddsKey=null;w.terminate();if(activeWorker===w)activeWorker=null;
          console.warn('LTSPN odds reconstruction skipped:',event.data.reason);
        }
        if(event.data.type==='done'){
          w.terminate();if(activeWorker===w)activeWorker=null;
          activeOddsKey=null;
          if(!Array.isArray(event.data.snapshots))return;
          oddsMemo.set(signature,event.data.snapshots);
          if(oddsMemo.size>5)oddsMemo.delete(oddsMemo.keys().next().value);
          if(lastCache?.signature===signature){
            lastCache.odds=event.data.snapshots;
            lastCache.data=buildData(lastCache.raw,event.data.snapshots);
            renderPreview(lastCache.data);
            if(visibleNews())renderArchive(lastCache.data);
          }
        }
      };
      w.onerror=()=>{activeOddsKey=null;w.terminate();if(activeWorker===w)activeWorker=null;};
      w.postMessage({type:'rebuild',requestId,timeline:t,postseason:[]});
    }catch(e){activeOddsKey=null;console.debug('LTSPN history worker not supported',e);}
  }
  async function load({force=false,showArchive=false}={}){
    if(!viewer())return;
    const current=++request;
    const preview=$('leagueNewsPreview');
    const archive=$('leagueNewsBox');
    if(showArchive&&archive&&!lastCache)archive.innerHTML='<div class="ln-zero">Loading the LTSPN…</div>';
    try{
      const record=await fetch(force);
      if(request!==current)return;
      renderPreview(record.data);
      if(showArchive||visibleNews())renderArchive(record.data,!!(activeOddsKey===record.signature));
      if(showArchive||visibleNews())doWorker(record.raw,record.signature);
    }catch(e){
      if(request!==current)return;
      if(preview)preview.innerHTML='<section class="ln-home"><div class="ln-brandline">'+brandMark()+'<div><div class="ln-eyebrow">OFFICIAL LEAGUE NEWS</div><h2>LTSPN</h2></div></div><p>League headlines are temporarily unavailable.</p><button class="ln-home-link" data-ln-retry type="button">Retry</button></section>';
      if((showArchive||visibleNews())&&archive)archive.innerHTML='<div class="ln-zero"><h3>News temporarily unavailable</h3><p>The official results could not be loaded. Your picks and standings are unaffected.</p><button data-ln-retry type="button">Try again</button></div>';
    }
  }
  function navigate(storyId=null){
    openStory=storyId;
    if(storyId){
      selectedCategory='all';selectedWeek='all';
    }
    const nav=document.querySelector('[data-page="news"]');
    if(typeof window.showPage==='function')window.showPage('news',nav);
    else load({showArchive:true});
  }
  function delegate(event){
    const el=event.target;
    if(!el?.closest)return;
    const news=el.closest('[data-ln-open-news]');
    if(news){navigate();return;}
    const open=el.closest('[data-ln-story]');
    if(open){navigate(open.dataset.lnStory);return;}
    const retry=el.closest('[data-ln-retry]');
    if(retry){load({force:true,showArchive:visibleNews()});return;}
    const filter=el.closest('[data-ln-category]');
    if(filter){
      selectedCategory=cleanCategory(filter.dataset.lnCategory);
      openStory=null;
      if(lastCache)renderArchive(lastCache.data,!!activeOddsKey);
    }
  }
  const box=$('leagueNewsBox'),preview=$('leagueNewsPreview');
  box?.addEventListener('click',delegate);
  box?.addEventListener('change',event=>{
    if(event.target?.matches?.('[data-ln-week-filter]')){
      selectedWeek=event.target.value;
      openStory=null;
      if(lastCache)renderArchive(lastCache.data,!!activeOddsKey);
    }
  });
  preview?.addEventListener('click',delegate);
  const oldHome=window.renderHome;
  if(typeof oldHome==='function')
    window.renderHome=function(){
      const result=oldHome.apply(this,arguments);
      load();
      return result;
    };
  const oldShow=window.showPage;
  if(typeof oldShow==='function')
    window.showPage=function(id){
      const result=oldShow.apply(this,arguments);
      if(id==='news')load({showArchive:true});
      return result;
    };
  setInterval(()=>{
    if(viewer()&&!document.hidden&&
      (!$('home')?.classList.contains('hidden')||visibleNews()))
      load({force:true,showArchive:visibleNews()});
  },120000);
  if(viewer())load();
  window.LeagueNews={load,navigate,selectCategory:id=>{selectedCategory=cleanCategory(id);
    if(lastCache)renderArchive(lastCache.data);}};
})();