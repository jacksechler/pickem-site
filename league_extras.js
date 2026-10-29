/* LEAGUE EXTRAS — profiles, studio show, records, championship.
   All report values come from published league records or official postseason state. */
(() => {
  const Model=window.LeagueExtrasModel;
  if(!Model)return;
  const $=id=>document.getElementById(id);
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const label=v=>v===null||v===undefined?'—':typeof v==='object'?JSON.stringify(v):String(v);
  const pct=v=>Number.isFinite(Number(v))?Number(v).toFixed(1)+'%':'—';
  const fmt=v=>Number.isFinite(Number(v))?Number(v).toFixed(1).replace(/\.0$/,''):'—';
  const choose=(a,b)=>a??b;
  const user=()=>typeof session!=='undefined'?session?.user?.id:null;
  const currentSeason=()=>typeof week!=='undefined'?week?.season_id||null:null;
  const hide=id=>$(id)?.classList.contains('hidden');
  const nav=(id)=>window.showPage?.(id,document.querySelector('[data-page="'+id+'"]'));
  const nameOf=p=>window.MemberNames?.full(p)||p?.display_name||p?.username||'Member';
  let cache=null,pending=null,fetchSerial=0,studioWeek='latest',profileSerial=0;
  let titleState=null,titleSerial=0,openChampionshipTicket=0;
  const safeId=id=>String(id??'').replace(/[^a-z0-9_-]/gi,'');
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  function monthDate(date){
    if(!date)return '';
    const d=new Date(date+'T12:00:00Z');
    return Number.isFinite(d.getTime())?d.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}):'';
  }
  function numbers(values){
    const nums=values.map(v=>Number(v)||0);
    return {min:Math.min(0,...nums),max:Math.max(1,...nums)};
  }
  function lineChart(values,{labels=[],suffix='',cap=100,height=168}={}){
    if(!values.length)return '<p class="lx-muted">No completed weekly results yet.</p>';
    const width=Math.max(320,values.length*47+65),left=35,right=16,top=12,bottom=30;
    const max=cap===null?Math.max(1,...values.map(Number))*1.12:cap;
    const h=height;
    const x=i=>left+(values.length===1?.5:i/(values.length-1))*(width-left-right);
    const y=n=>top+(h-top-bottom)*(1-Math.min(1,Math.max(0,Number(n)/max)));
    let content='<svg class="lx-line-chart" viewBox="0 0 '+width+' '+h+'" width="'+width+'" height="'+h+
      '" role="img" aria-label="Performance across completed weeks" xmlns="http://www.w3.org/2000/svg">';
    for(const scale of [0,.25,.5,.75,1]){
      const at=y(max*scale);
      content+='<line x1="'+left+'" x2="'+(width-right)+'" y1="'+at+'" y2="'+at+
        '" stroke="currentColor" stroke-opacity=".13"/>'+
        '<text x="'+(left-6)+'" y="'+(at+4)+'" text-anchor="end" font-size="10" fill="currentColor">'+
        fmt(max*scale)+suffix+'</text>';
    }
    const d=values.map((v,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(v).toFixed(1)).join(' ');
    content+='<path d="'+d+'" stroke="#e8bb68" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    values.forEach((v,i)=>{
      const a=x(i),b=y(v);
      content+='<circle cx="'+a+'" cy="'+b+'" r="4.5" fill="#f1c577" stroke="#122139" stroke-width="2">'+
        '<title>'+escape(labels[i]||'Week '+(i+1))+': '+fmt(v)+suffix+'</title></circle>';
      if(i%2===0||values.length<=8||i===values.length-1)
        content+='<text x="'+a+'" y="'+(h-6)+'" font-size="10" text-anchor="middle" fill="currentColor" opacity=".7">'+
          escape(labels[i]||String(i+1))+'</text>';
    });
    return '<div class="lx-chart-scroll" tabindex="0" role="region" aria-label="Scrollable performance chart">'+content+'</svg></div>';
  }
  async function published(force=false){
    if(!user())return null;
    const season=currentSeason();
    if(!force&&cache?.season===season&&Date.now()-cache.time<90000)return cache;
    if(!force&&pending?.season===season)return pending.promise;
    const ticket=++fetchSerial;
    const promise=(async()=>{
      const [profiles,weeks,scores]=await Promise.all([
        db('profiles?select=id,display_name,username'),
        db('weeks?phase=eq.regular&status=eq.published&select=id,name,number,status,phase,season_id,published_at&order=number.asc'),
        db('week_scores?select=week_id,user_id,total_points,correct_count,question_count,placement,unicorn_count,upset_count,opening_streak,weeks!inner(phase,status)&weeks.phase=eq.regular&weeks.status=eq.published')
      ]);
      if(![profiles,weeks,scores].every(Array.isArray))throw Error('Published league records are unavailable.');
      const selected=weeks.filter(w=>!season||w.season_id===season);
      const allowed=new Set(selected.map(w=>w.id));
      const relevant=scores.filter(s=>allowed.has(s.week_id));
      let postseason=null;
      try{postseason=await window.Postseason?.load?.(season||undefined)||null;}catch(e){
        console.debug('Postseason records unavailable for this request',e);
      }
      const raw={profiles,weeks:selected,scores:relevant,postseason,
        questions:[],picks:[],seasonId:season};
      const model=Model.build(raw);
      const next={season,time:Date.now(),raw,model,details:false};
      if(ticket===fetchSerial)cache=next;
      return next;
    })().finally(()=>{if(pending?.promise===promise)pending=null;});
    pending={season,promise};
    return promise;
  }
  async function detailed(bundle){
    if(!bundle||bundle.details||!bundle.raw.weeks.length)return bundle;
    // Only published card IDs. The current card and members' private future picks
    // are NEVER queried by these features.
    const ids=bundle.raw.weeks.map(w=>w.id);
    const idExpr='in.('+ids.join(',')+')';
    try{
      const questions=[];
      for(let offset=0;offset<10000;offset+=600){
        const part=await db('questions?select=id,week_id,prompt,result,sport,position,counts_for_score'+
          '&week_id='+idExpr+'&order=week_id.asc,position.asc&limit=600&offset='+offset);
        if(!Array.isArray(part))throw Error('Archived questions inaccessible');
        questions.push(...part);if(part.length<600)break;
      }
      const picks=[];
      for(let offset=0;offset<12000;offset+=600){
        const part=await db('picks?select=week_id,question_id,user_id,answer'+
          '&week_id='+idExpr+'&order=week_id.asc,question_id.asc,user_id.asc&limit=600&offset='+offset);
        if(!Array.isArray(part))throw Error('Archived picks inaccessible');
        picks.push(...part);if(part.length<600)break;
      }
      bundle.raw.questions=questions;bundle.raw.picks=picks;
      bundle.model=Model.build(bundle.raw);bundle.details=true;
    }catch(error){
      console.debug('Archived pick details unavailable; keeping verified score summaries',error);
      bundle.details=true;
    }
    return bundle;
  }
  async function load({details=false,force=false}={}){
    let bundle=await published(force);
    if(details)bundle=await detailed(bundle);
    return bundle;
  }
  function loading(id,title){
    const box=$(id);if(box)box.innerHTML='<div class="lx-loading"><div class="lx-kicker">'+escape(title)+
      '</div><p>Loading published league results…</p></div>';
  }
  function errorBox(message){
    return '<section class="lx-card"><h3>Records temporarily unavailable</h3><p>'+escape(message)+
      '</p><button class="lx-button" data-lx-refresh>Try again</button></section>';
  }
  function trophyCard(title,name,detail,important=false){
    return '<article class="lx-trophy '+(important?'lx-featured':'')+'"><div class="lx-trophy-icon" aria-hidden="true">'+
      (important?'🏆':'✦')+'</div><div class="lx-kicker">'+escape(title)+'</div><h3>'+escape(name)+
      '</h3><p>'+escape(detail)+'</p></article>';
  }
  function awardsHtml(model){
    const {records,championships,power,members,rankings,weekCount,rare,issues}=model;
    const champ=championships.find(x=>x.type==='league-champion');
    const reg=championships.find(x=>x.type==='regular-champion');
    let html='<div class="lx-shell"><header class="lx-banner"><div class="lx-kicker">THE LEAGUE ARCHIVES</div>'+
      '<h2>Awards &amp; Hall of Fame</h2><p>Season leaders, verified records, and permanently recorded championships.</p>'+
      '<div class="lx-microstats"><span>'+weekCount+' published weeks</span><span>'+
      members.length+' members</span><span>'+rare.length+' verified rare-pick moments</span></div></header>';
    html+='<div class="lx-hero-duo">'+
      (champ?trophyCard('OFFICIAL LEAGUE CHAMPION',champ.displayName,
        'Seed #'+champ.seed+' · '+fmt(champ.points)+' championship points',true):
      trophyCard('HALL OF CHAMPIONS','The next champion awaits',
        'The champion is recorded here only after the final playoff round is officially finalized.',true))+
      (reg?trophyCard('REGULAR-SEASON CHAMPION',reg.displayName,
        fmt(reg.points)+' regular-season points · final #1 seed'):
      trophyCard('THE SEASON RACE',rankings[0]?.name||'Awaiting results',
        rankings.length&&weekCount?fmt(rankings[0].points)+' points · current standings leader':'No official regular-season standings yet'))+
      '</div>';
    html+='<section class="lx-card"><div class="lx-heading"><div><div class="lx-kicker">LEAGUE HONORS</div>'+
      '<h3>Season Awards</h3></div><span class="lx-chip">'+(champ?'FINALIZED':'CURRENT LEADERS')+'</span></div>';
    if(!weekCount)html+='<p class="lx-muted">Awards appear as soon as official weekly scores are published.</p>';
    else html+='<div class="lx-awards-grid">'+records.filter(r=>!['best-week','correct-week'].includes(r.id)).map(r=>
      '<div class="lx-honor"><small>'+escape(r.label)+'</small><strong>'+escape(r.holderNames.join(' & '))+
      '</strong><span>'+fmt(r.value)+(r.unit==='%'?'%':' '+escape(r.unit))+
      (r.ties?' · tied':'')+'</span></div>').join('')+'</div>';
    html+='</section>';
    html+='<div class="lx-two"><section class="lx-card"><div class="lx-kicker">PERFORMANCE RECORD BOOK</div>'+
      '<h3>League Records</h3><div class="lx-record-list">'+records.map(r=>
      '<div class="lx-record"><div><strong>'+escape(r.label)+'</strong><span>'+escape(r.holderNames.join(' & '))+
      '</span></div><b>'+fmt(r.value)+(r.unit==='%'?'%':' '+escape(r.unit))+'</b></div>').join('')+
      '</div></section>';
    html+='<section class="lx-card"><div class="lx-kicker">MOMENTUM BOARD</div>'+
      '<h3>LTSPN Power Rankings</h3><p class="lx-muted">Transparent performance formula: 65% recent three-week pick accuracy, 35% season accuracy. Not the official standings.</p>'+
      '<div class="lx-record-list">'+power.map(m=>
      '<button class="lx-record lx-linked" data-lx-profile="'+escape(m.id)+'"><span><b>#'+m.rank+
      ' '+escape(m.name)+'</b><small>Last 3: '+pct(m.recentRate)+' · Season: '+pct(m.seasonRate)+
      '</small></span><b>'+pct(m.score)+'</b></button>').join('')+
      (power.length?'':'<p class="lx-muted">Power Rankings begin with the first published week.</p>')+
      '</div></section></div>';
    html+='<section class="lx-card"><div class="lx-kicker">ALL EIGHT CONTENDERS</div>'+
      '<h3>Member Directory</h3><div class="lx-member-directory">'+rankings.map((m,i)=>
      '<button data-lx-profile="'+escape(m.id)+'"><span class="lx-member-rank">#'+(i+1)+'</span><span><strong>'+
      escape(m.name)+'</strong><small>'+fmt(m.points)+' pts · '+pct(m.pickRate)+
      ' correct · '+m.wins+' weekly win'+(m.wins===1?'':'s')+'</small></span><span aria-hidden="true">›</span></button>').join('')+
      '</div></section>';
    if(issues?.length)html+='<p class="lx-disclaimer">Incomplete published scorecards excluded: '+escape(issues.join(', '))+'</p>';
    return html+'<p class="lx-disclaimer">This Hall of Fame reflects the current season’s verified records. Career championships across other seasons require their own archived official data; none are invented here.</p></div>';
  }
  function showAwards(model){
    const box=$('awardsBox');if(box)box.innerHTML=awardsHtml(model);
  }
  async function renderAwards(force=false){
    if(!user())return;
    loading('awardsBox','AWARDS & RECORDS');
    try{const bundle=await load({details:true,force});showAwards(bundle.model);}
    catch(e){$('awardsBox').innerHTML=errorBox(e.message||'League scores unavailable.');}
  }
  function playerCard(model,id,odds=null){
    const me=model.members.find(m=>m.id===id);
    if(!me)return '';
    const h2h=Model.headToHead(model,id);
    const awarded=model.records.filter(r=>r.holderIds.includes(id));
    const matched=model.championships.filter(r=>r.userId===id);
    const points=me.weeks.map(w=>w.points);
    const profile='<section class="lx-card"><div class="lx-heading"><div><div class="lx-kicker">ADVANCED PLAYER ANALYTICS</div>'+
      '<h3>'+escape(me.name)+' · Season Profile</h3></div><span class="lx-chip">'+
      (me.rank?'#'+me.rank+' Season Rank':'Unranked')+'</span></div>'+
      '<div class="lx-stats-six">'+[
        ['Overall accuracy',pct(me.pickRate)],
        ['Last three weeks',me.recentQuestions?pct(me.recentRate):'—'],
        ['Average points',me.weeks.length?fmt(me.averagePoints):'—'],
        ['Average weekly finish',me.averageFinish===null?'—':fmt(me.averageFinish)],
        ['Top-three weeks',String(me.podiums)],
        ['Best winning streak',me.longestWinRun+' week'+(me.longestWinRun===1?'':'s')]
      ].map(([l,v])=>'<div><small>'+escape(l)+'</small><b>'+escape(v)+'</b></div>').join('')+
      '</div><h4>Points by Week</h4>'+lineChart(points,{cap:null,labels:me.weeks.map(w=>'W'+w.weekNumber)})+'</section>';
    let html=profile;
    html+='<div class="lx-two"><section class="lx-card"><div class="lx-kicker">HOW THEY MATCH UP</div>'+
      '<h3>Head-to-head Weekly Finishes</h3><p class="lx-muted">Counts compare official weekly placements, not separate scheduled head-to-head matches.</p>'+
      '<div class="lx-record-list">'+h2h.map(r=>
        '<div class="lx-record"><div><strong>'+escape(r.name)+'</strong><span>'+
        r.aWins+' wins · '+r.bWins+' losses · '+r.ties+' ties</span></div>'+
        '<button class="lx-mini-link" data-lx-profile="'+escape(r.id)+'">Profile ›</button></div>').join('')+
      '</div></section>';
    html+='<section class="lx-card"><div class="lx-kicker">CAREER SNAPSHOT</div><h3>Milestones & Awards</h3>'+
      '<div class="lx-honor-list">'+[
        ['Weekly victories',String(me.wins)],
        ['Perfect weeks',String(me.perfects)],
        ['Rare correct picks',String(me.rareCorrect)],
        ['Unique correct picks',String(me.rareSolo)],
        ['Highest weekly correct',me.bestWeek?me.bestWeek.correct+' in '+me.bestWeek.weekName:'—'],
        ...awarded.map(r=>[r.label,fmt(r.value)+' '+r.unit]),
        ...matched.map(r=>[r.name,'Official · '+fmt(r.points)+' points'])
      ].map(([label,v])=>'<div><span>'+escape(label)+'</span><strong>'+escape(v)+'</strong></div>').join('')+
      '</div></section></div>';
    if(odds?.length){
      html+='<section class="lx-card"><div class="lx-kicker">ROAD TO THE TITLE</div>'+
        '<h3>Championship Chance History</h3><p class="lx-muted">Retrospective model estimates after each published week, not odds recorded at the time.</p>'+
        lineChart(odds.map(x=>x.value),{cap:100,labels:odds.map(x=>x.label),suffix:'%'})+
        '<p class="lx-muted">Latest reconstructed chance: '+pct(odds.at(-1).value)+
        '. See Standings for the full eight-player graph.</p></section>';
    }
    return html;
  }
  async function oddsForProfile(bundle,id){
    const history=window.ChampionshipHistoryModel,forecast=window.ChampionshipOddsModel;
    if(!history||!forecast||bundle.raw.profiles.length!==8)return null;
    const timeline=history.buildTimeline({profiles:bundle.raw.profiles,weeks:bundle.raw.weeks,
      scores:bundle.raw.scores,seasonId:bundle.season,regularWeekCount:20});
    if(timeline.kind!=='ready')return null;
    const checkpoint=history.estimateTimeline(timeline,forecast,{samples:450});
    if(checkpoint.kind!=='ready')return null;
    return checkpoint.snapshots.map(x=>({label:x.shortLabel,value:Number(x.odds[id]||0)}));
  }
  const oldProfile=window.renderPlayerProfile;
  if(typeof oldProfile==='function')
    window.renderPlayerProfile=async function(id){
      const sequence=++profileSerial;
      const original=await oldProfile.apply(this,arguments);
      if(sequence!==profileSerial||!id)return original;
      try{
        const bundle=await load({details:true});
        if(sequence!==profileSerial||hide('player'))return original;
        const box=$('playerBox');
        if(!box||!bundle.model.members.some(m=>m.id===id))return original;
        const odds=await oddsForProfile(bundle,id).catch(()=>null);
        if(sequence!==profileSerial||hide('player'))return original;
        box.querySelector('#lxPlayerAdvanced')?.remove();
        const div=document.createElement('div');div.id='lxPlayerAdvanced';
        div.className='lx-profile-advanced';div.innerHTML=playerCard(bundle.model,id,odds);
        box.append(div);
      }catch(e){console.debug('Advanced player statistics unavailable',e);}
      return original;
    };
  function storyLink(){
    return '<button class="lx-button lx-button-ghost" data-lx-open-news>Read LTSPN Articles</button>';
  }
  function studioHtml(model){
    const options=[...model.weeks].reverse();
    const selected=studioWeek==='latest'?options[0]?.id:studioWeek;
    const show=Model.studio(model,selected);
    let html='<div class="lx-shell lx-studio"><header class="lx-banner lx-studio-banner"><div class="lx-kicker">LTSPN • THE WEEKLY SHOW</div>'+
      '<h2>SPORTSCENTER</h2><p>The league’s biggest moments, framed like a real sports broadcast—without fictional commentary.</p>'+
      '<div class="lx-studio-selector"><label for="lxEpisode">Episode</label><select id="lxEpisode" data-lx-studio-week>'+
      options.map(w=>'<option value="'+escape(w.id)+'" '+(w.id===selected?'selected':'')+'>'+
        escape(w.name)+'</option>').join('')+'</select>'+storyLink()+'</div></header>';
    if(show.kind!=='ready'){
      return html+'<section class="lx-card"><h3>The studio opens after Week 1</h3><p>'+
        escape(show.reason)+'</p></section></div>';
    }
    html+='<div class="lx-ticker" aria-label="Published results ticker"><strong>LTSPN BREAKING</strong><span>'+
      escape(show.week.name)+' final · '+show.winners.map(escape).join(' & ')+' '+(show.winners.length===1?'wins':'tie for first')+
      ' · '+show.leagueLeader.map(escape).join(' & ')+' '+(show.leagueLeader.length===1?'leads':'lead')+
      ' regular season</span></div>';
    html+='<div class="lx-hero-duo"><section class="lx-card lx-studio-main"><div class="lx-kicker">TOP STORY</div>'+
      '<h3>'+escape(show.coverage[0]?.headline)+'</h3><p>'+escape(show.coverage[0]?.detail)+'</p>'+
      '<div class="lx-studio-podium">'+show.topContenders.map((r,i)=>
        '<div><small>OFFICIAL #'+r.placement+'</small><strong>'+escape(r.name)+'</strong><span>'+
        r.correct+'/'+r.questions+' correct · '+fmt(r.points)+' season pts</span></div>').join('')+
      '</div>'+storyLink()+'</section>';
    html+='<section class="lx-card"><div class="lx-kicker">THE RUN OF SHOW</div><h3>Tonight's Rundown</h3>'+
      '<div class="lx-record-list">'+show.coverage.map((p,i)=>
        '<div class="lx-record lx-rundown"><span class="lx-rundown-num">0'+(i+1)+'</span>'+
        '<div><small>'+escape(p.label)+'</small><strong>'+escape(p.headline)+'</strong><span>'+
        escape(p.detail)+'</span></div></div>').join('')+
      '</div></section></div>';
    html+='<div class="lx-two"><section class="lx-card"><div class="lx-kicker">IN THE SPOTLIGHT</div><h3>Notable Picks</h3>'+
      (show.rare.length?'<div class="lx-record-list">'+show.rare.slice(0,4).map(p=>
        '<div class="lx-record"><div><strong>'+escape(p.prompt)+'</strong>'+
        '<span>Official answer: '+escape(label(p.result))+' · '+p.correctCount+' of 8 correct</span></div></div>').join('')+'</div>':
        '<p class="lx-muted">No verified rare picks for this week yet. The segment requires all eight archived answers per question.</p>')+
      '</section>';
    html+='<section class="lx-card"><div class="lx-kicker">THE ANALYST DESK</div><h3>LTSPN Power Five</h3>'+
      '<p class="lx-muted">65% last-three-week accuracy + 35% full-season accuracy. Not official standings.</p>'+
      '<div class="lx-record-list">'+show.power.map(p=>
        '<button class="lx-record lx-linked" data-lx-profile="'+escape(p.id)+'"><span><b>#'+p.rank+' '+
        escape(p.name)+'</b><small>Last 3: '+pct(p.recentRate)+'</small></span><b>'+
        pct(p.score)+'</b></button>').join('')+'</div></section></div>';
    html+='<p class="lx-disclaimer">These are interactive studio graphics and written recaps, not a video or live television stream. All results shown are from completed, published weeks.</p></div>';
    return html;
  }
  async function renderStudio(force=false){
    if(!user())return;
    loading('studioBox','LTSPN STUDIO');
    try{const bundle=await load({details:true,force});$('studioBox').innerHTML=studioHtml(bundle.model);}
    catch(e){$('studioBox').innerHTML=errorBox(e.message||'League scores unavailable.');}
  }
  function matchupHtml(model,probabilities=null,picks=[]){
    const state=Model.championship(model.postseason);
    if(state.kind==='upcoming'||state.kind==='unavailable'){
      return '<div class="lx-shell"><header class="lx-banner lx-champ-banner"><div class="lx-kicker">ROAD TO THE CROWN</div>'+
        '<h2>Championship GameDay</h2><p>One trophy. Two finalists. A season on the line.</p></header>'+
        '<section class="lx-card lx-champ-await"><div class="lx-kicker">THE TITLE MATCHUP</div>'+
        '<h3>Finalists to be determined</h3><p>'+escape(state.reason)+
        '</p><div class="lx-champ-progress">8 <span>→</span> 6 <span>→</span> 4 <span>→</span> 2 <span>→</span> 1</div>'+
        '<button class="lx-button" data-lx-page="playoffs">View the playoff race</button></section></div>';
    }
    const entries=model.postseason?.entries||[];
    const rows=state.finalists||[];
    const round=model.postseason?.current?.round;
    const champion=state.champion;
    const official=!!champion&&(state.kind==='official'||model.postseason?.settings?.status==='complete');
    const tit=probabilities?.kind==='estimate'||probabilities?.kind==='official'?probabilities.titleOdds||{}:{};
    const rowTitle=r=>model.members.find(m=>m.id===r.user_id)?.name||
      entries.find(m=>m.user_id===r.user_id)?.display_name||r.display_name||'Finalist';
    const values=rows.map((r,i)=>({
      id:r.user_id,name:rowTitle(r),seed:r.seed||entries.find(e=>e.user_id===r.user_id)?.seed||'—',
      total:r.cumulative_after??entries.find(e=>e.user_id===r.user_id)?.current_total??null,
      correct:r.round_correct,odds:tit[r.user_id],place:r.round_rank
    }));
    let html='<div class="lx-shell"><header class="lx-banner lx-champ-banner"><div class="lx-kicker">THE CHAMPIONSHIP • GAME DAY</div>'+
      '<h2>'+(official?'THE CHAMPION IS CROWNED':'CHAMPIONSHIP GAMEDAY')+'</h2><p>'+
      (official?'A league season has its official winner.':'Two finalists. One championship. Every point matters.')+
      '</p><div class="lx-microstats"><span>'+(official?'OFFICIAL FINAL':
      state.locked?'LIVE · PICKS LOCKED':'MATCHUP SET · AWAITING LOCK')+'</span><span>8 → 6 → 4 → 2 → 1</span>'+
      (state.remaining!==null?'<span>'+state.remaining+' scored questions remaining</span>':'')+
      '</div></header>';
    if(official)html+='<section class="lx-champ-crown"><div class="lx-confetti" aria-hidden="true">✦ ✧ ★ ✦ ✧</div>'+
      '<div class="lx-kicker">OFFICIAL LEAGUE CHAMPION</div><div class="lx-gold-trophy" aria-hidden="true">🏆</div><h3>'+
      escape(model.members.find(p=>p.id===champion.user_id)?.name||champion.display_name||'League Champion')+
      '</h3><p>Commissioner-finalized championship result · Seed #'+escape(champion.seed)+
      '</p></section>';
    html+='<section class="lx-card lx-champ-arena"><div class="lx-kicker">CHAMPIONSHIP SCOREBOARD</div>'+
      '<div class="lx-finals-vs">'+values.map((p,i)=>
        '<div class="lx-finalist'+(official&&champion.user_id===p.id?' crowned':'')+'"><small>SEED #'+escape(p.seed)+
        (official&&champion.user_id===p.id?' · CHAMPION':'')+'</small><h3>'+escape(p.name)+
        '</h3><strong class="lx-final-score">'+(p.total===null?'—':fmt(p.total))+'</strong>'+
        '<span>Cumulative playoff points</span>'+
        (Number.isFinite(Number(p.odds))?'<div class="lx-win-chance"><strong>'+
          pct(p.odds)+'</strong><span>Chance to win it all</span><div class="lx-bar"><i style="width:'+
          Math.max(0,Math.min(100,Number(p.odds)))+'%"></i></div></div>':'<p class="lx-muted">'+
          (official?'Official result':'Win probability available once the forecast can be calculated')+'</p>')+
        '</div>'+(i===0?'<div class="lx-vs">VS</div>':'')
      ).join('')+'</div></section>';
    html+='<section class="lx-card"><div class="lx-heading"><div><div class="lx-kicker">LIVE TITLE SCENARIOS</div>'+
      '<h3>What Will Decide the Title?</h3></div><span class="lx-chip">'+
      (official?'OFFICIAL':state.locked?'PROJECTED':'AWAITING LOCK')+'</span></div>'+
      '<p>'+escape(official?'The commissioner has finalized the winner.':state.verdict)+'</p>'+
      (state.mathematical&&!official?'<p class="lx-warning">Mathematically beyond reach on points: '+
        escape(values.find(v=>v.id===state.mathematical)?.name||'Leader')+
        '. This is not an official championship announcement.</p>':'')+
      '<div class="lx-stats-six">'+[['Current round',escape(round?.label||'Championship')],
        ['Scored questions',state.decided===null?'—':String(state.decided)],
        ['Still to decide',state.remaining===null?'—':String(state.remaining)],
        ['Tiebreaker',state.tiebreakerPending?'Pending':official?'Finalized':'As required'],
        ['Finalists',String(values.length)],
        ['Status',official?'Finalized':state.locked?'Live projection':'Pre-lock']
      ].map(([a,b])=>'<div><small>'+a+'</small><b>'+b+'</b></div>').join('')+'</div></section>';
    html+='<section class="lx-card"><div class="lx-heading"><div><div class="lx-kicker">DIFFERENCE MAKERS</div>'+
      '<h3>Biggest Remaining Picks</h3></div></div>';
    if(!state.locked&&!official)html+='<p class="lx-muted">The finalists’ answers stay private until the championship card locks.</p>';
    else if(picks.length){
      html+='<div class="lx-record-list">'+picks.slice(0,12).map(p=>
        '<div class="lx-difference"><div><small>'+escape(p.sport)+'</small><strong>'+escape(p.prompt)+
        '</strong></div><div class="lx-pick-split">'+
        '<span>'+escape(values[0]?.name||'Finalist 1')+': <b>'+escape(label(p.first))+'</b>'+
          (p.decided?(p.firstCorrect?' ✓':' ×'):'')+'</span>'+
        '<span>'+escape(values[1]?.name||'Finalist 2')+': <b>'+escape(label(p.second))+'</b>'+
          (p.decided?(p.secondCorrect?' ✓':' ×'):'')+'</span></div>'+
        '<small>'+(p.decided?'Official result: '+escape(label(p.result)):'Result not yet recorded')+
        '</small></div>').join('')+'</div>';
    }else html+='<p class="lx-muted">No verified differing picks are available on this card yet. Shared answers do not change the gap between finalists.</p>';
    html+='</section><section class="lx-card"><h3>The Road to the Championship</h3><p class="lx-muted">The playoff race, official cuts, and seed history remain available in Playoffs.</p>'+
      '<button class="lx-button" data-lx-page="playoffs">Open Road to the Championship</button></section></div>';
    return html;
  }
  async function finalPicks(state,data){
    if(!state.locked||state.finalists.length!==2||!state.weekId)return [];
    // The title picks are only retrieved after this playoff round locks.
    const id=encodeURIComponent(state.weekId);
    try{
      const [questions,picks]=await Promise.all([
        db('questions?week_id=eq.'+id+'&select=id,week_id,prompt,sport,result,counts_for_score'),
        db('picks?week_id=eq.'+id+'&select=week_id,question_id,user_id,answer')
      ]);
      if(!Array.isArray(questions)||!Array.isArray(picks))return [];
      const fresh=await window.Postseason?.load?.(currentSeason()||undefined,null,true);
      if(!fresh?.current?.locked||fresh.current.round?.id!==data.current?.round?.id)return [];
      return Model.decidingPicks(questions,picks,state.finalists,state.weekId)
        .sort((a,b)=>(a.decided?1:0)-(b.decided?1:0)||String(a.prompt).localeCompare(String(b.prompt)));
    }catch(e){console.debug('Finalists picks unavailable',e);return [];}
  }
  async function renderChampionship(force=false){
    if(!user())return;
    const request=++openChampionshipTicket;
    loading('championshipBox','THE FINAL');
    try{
      const bundle=await load({details:false,force});
      const data=await window.Postseason?.load?.(currentSeason()||undefined,null,true)||bundle.raw.postseason;
      if(request!==openChampionshipTicket)return;
      const model={...bundle.model,postseason:data};
      const state=Model.championship(data);
      const [prob,picks]=await Promise.all([
        data&&state.kind!=='upcoming'&&window.PlayoffAdvancement?.getChampionship?
          window.PlayoffAdvancement.getChampionship(data).catch(()=>null):Promise.resolve(null),
        data&&state.locked?finalPicks(state,data):Promise.resolve([])
      ]);
      if(request!==openChampionshipTicket)return;
      $('championshipBox').innerHTML=matchupHtml(model,prob,picks);
    }catch(e){if(request===openChampionshipTicket)$('championshipBox').innerHTML=
      errorBox(e.message||'The championship is not available right now.');}
  }
  function shareReport(model){
    const leader=model.rankings[0];
    const last=model.weeks.at(-1);
    const champion=model.championships.find(r=>r.type==='league-champion');
    const lines=['PICK’EM LEAGUE • SEASON REPORT',model.weekCount+' officially completed weeks',
      leader?'Current standings leader: '+leader.name+' ('+fmt(leader.points)+' points)':'No published weekly scores yet',
      last?'Latest weekly winner: '+last.winners.map(id=>model.members.find(p=>p.id===id)?.name||'Member').join(' & '):'Weekly result pending',
      champion?'League champion: '+champion.displayName:'Championship not yet finalized'];
    return lines.join('\n');
  }
  function delegate(e){
    const t=e.target?.closest?.('[data-lx-profile],[data-lx-page],[data-lx-refresh],[data-lx-open-news],[data-lx-copy]');
    if(!t)return;
    if(t.dataset.lxProfile){window.openPlayerProfile?.(t.dataset.lxProfile);return;}
    if(t.dataset.lxPage){nav(t.dataset.lxPage);return;}
    if(t.dataset.lxOpenNews){window.LeagueNews?.navigate?.();return;}
    if(t.dataset.lxRefresh){
      const active=['awards','studio','championship'].find(id=>!hide(id));
      if(active==='awards')renderAwards(true);
      if(active==='studio')renderStudio(true);
      if(active==='championship')renderChampionship(true);
      return;
    }
    if(t.dataset.lxCopy){
      load().then(bundle=>navigator.clipboard?.writeText?.(shareReport(bundle.model))).catch(()=>{});
    }
  }
  for(const id of ['awards','studio','championship','player'])
    $(id)?.addEventListener('click',delegate);
  $('studio')?.addEventListener('change',e=>{
    if(e.target.matches('[data-lx-studio-week]')){
      studioWeek=e.target.value;load({details:true}).then(b=>{$('studioBox').innerHTML=studioHtml(b.model);}).catch(()=>{});
    }
  });
  const priorShow=window.showPage;
  if(typeof priorShow==='function')window.showPage=function(id){
    const ret=priorShow.apply(this,arguments);
    if(id==='awards')renderAwards();
    if(id==='studio')renderStudio();
    if(id==='championship')renderChampionship();
    return ret;
  };
  const navAction=()=>{
    const home=$('home'),placeholder=$('lxFeatureStrip');
    if(!home||placeholder)return;
    const div=document.createElement('div');
    div.id='lxFeatureStrip';div.className='lx-feature-strip';
    div.innerHTML=[
      ['studio','LTSPN SportsCenter','Weekly broadcast recap','radio-tower'],
      ['awards','Awards & Hall of Fame','Records and league honors','award'],
      ['championship','Championship GameDay','The road to the final','trophy'],
      ['stats','Player Analytics','Members and trends','chart']
    ].map(([id,name,desc])=>'<button class="lx-feature-link" data-lx-page="'+id+'"><strong>'+
      escape(name)+'</strong><span>'+escape(desc)+'</span></button>').join('');
    div.addEventListener('click',delegate);
    home.append(div);
  };
  const oldHome=window.renderHome;
  if(typeof oldHome==='function')window.renderHome=function(){
    const r=oldHome.apply(this,arguments);navAction();return r;
  };
  if(user())navAction();
  setInterval(()=>{
    if(!user()||document.hidden||!$('app')||$('app').classList.contains('hidden'))return;
    if(!hide('championship'))renderChampionship(true);
    else if(!hide('awards'))renderAwards(true);
    else if(!hide('studio'))renderStudio(true);
  },60000);
  window.LeagueExtras={load,renderAwards,renderStudio,renderChampionship,shareReport,studioHtml,awardsHtml,matchupHtml,playerCard};
})();