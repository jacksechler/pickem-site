// Retrospective championship probability chart alongside the season Rank Tracker.
// Interactive on mobile; recalculation runs in a Worker when available.
(() => {
  const History=window.ChampionshipHistoryModel;
  const Forecast=window.ChampionshipOddsModel;
  if(!History||!Forecast)return;
  const $=id=>document.getElementById(id);
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const PALETTE=['#22c55e','#3b82f6','#f97316','#a855f7','#eab308','#ef4444','#14b8a6','#ec4899'];
  const cache=new Map();
  let token=0,worker=null,lastKey='',selectedIndex=null,selectedManual=false;
  let hidden=new Set(),latest=null,latestTimeline=null,latestSignature='';
  const round=number=>Math.round(Number(number||0)*10)/10;
  function ensure(parent){
    let node=$('championshipHistoryBox');
    if(node && parent.contains(node))return node;
    node=document.createElement('section');
    node.id='championshipHistoryBox';
    node.className='card ch-history';
    node.setAttribute('aria-label','Historical championship probability graph');
    parent.append(node);
    node.addEventListener('click',event=>{
      const button=event.target.closest('[data-ch-player]');
      if(button&&node.contains(button)){
        const id=button.dataset.chPlayer;
        if(hidden.has(id))hidden.delete(id);
        else if(latest && hidden.size<latest.ids.length-1)hidden.add(id);
        draw();
        return;
      }
      const dot=event.target.closest('[data-ch-week]');
      if(dot&&node.contains(dot)){
        selectIndex(Number(dot.dataset.chWeek));
        return;
      }
      if(event.target.closest('[data-ch-refresh]')){
        if(typeof window.renderStandings==='function')window.renderStandings();
        return;
      }
      const move=event.target.closest('[data-ch-shift]');
      if(move&&node.contains(move))selectIndex((selectedIndex??0)+Number(move.dataset.chShift));
    });
    node.addEventListener('change',event=>{
      if(event.target.matches('[data-ch-select]'))selectIndex(Number(event.target.value));
    });
    return node;
  }
  function setMessage(node,description,progress=''){
    node.innerHTML='<div class="ch-history-header"><div><div class="eyebrow">CHAMPIONSHIP HISTORY</div><h2>Chance to Win It All</h2></div><span class="ch-history-pill">BACKFILLED ESTIMATES</span></div>'+
      '<p class="ch-history-note">'+escape(description)+'</p>'+
      (progress?'<div class="ch-history-progress">'+escape(progress)+'</div>':'');
  }
  function colors(data){
    return Object.fromEntries(data.ids.map((id,index)=>[id,PALETTE[index%PALETTE.length]]));
  }
  function makeSvg(data,points,index){
    const n=points.length;
    const W=Math.max(740,110+(n-1)*63);
    const H=345,L=57,R=25,T=23,B=58;
    const pw=W-L-R,ph=H-T-B;
    const xAt=i=>n<2?L+pw/2:L+i*pw/(n-1);
    const peak=Math.max(0,...points.flatMap(p=>data.ids.map(id=>Number(p.odds?.[id]||0))));
    const ymax=Math.min(100,Math.max(30,Math.ceil((peak+5)/10)*10));
    const yAt=y=>T+ph-Math.max(0,Math.min(1,Number(y||0)/ymax))*ph;
    const c=colors(data);
    let svg='<svg viewBox="0 0 '+W+' '+H+'" width="'+W+'" height="'+H+'" role="img" aria-label="Historical championship winning probabilities for all eight members" xmlns="http://www.w3.org/2000/svg">';
    for(let step=0;step<=5;step++){
      const value=ymax*step/5,cy=yAt(value);
      svg+='<line x1="'+L+'" y1="'+cy+'" x2="'+(W-R)+'" y2="'+cy+'" stroke="currentColor" stroke-opacity=".13"/>'+
        '<text x="'+(L-9)+'" y="'+(cy+4)+'" fill="currentColor" fill-opacity=".68" font-size="12" text-anchor="end">'+value.toFixed(value%1?1:0)+'%</text>';
    }
    points.forEach((point,i)=>{
      const x=xAt(i);
      const label=point.shortLabel||'W'+i;
      svg+='<line x1="'+x+'" x2="'+x+'" y1="'+T+'" y2="'+(H-B)+'" stroke="currentColor" stroke-opacity=".05"/>';
      if(n<=13||i===0||i===n-1||i%2===0)
        svg+='<text x="'+x+'" y="'+(H-20)+'" text-anchor="middle" font-size="12" font-weight="750" fill="currentColor" fill-opacity=".75">'+escape(label)+'</text>';
    });
    const selectedX=xAt(index);
    svg+='<rect x="'+(selectedX-5)+'" y="'+T+'" width="10" height="'+ph+'" fill="#f0cb80" fill-opacity=".12"/>'+
      '<line x1="'+selectedX+'" x2="'+selectedX+'" y1="'+T+'" y2="'+(H-B)+'" stroke="#f5d698" stroke-opacity=".7" stroke-dasharray="5 5" stroke-width="2"/>';
    data.ids.forEach(id=>{
      if(hidden.has(id))return;
      const color=c[id],name=data.names[id];
      const coords=points.map((p,i)=>[xAt(i),yAt(p.odds?.[id])]);
      const path=coords.map((v,i)=>(i?'L':'M')+v[0].toFixed(1)+' '+v[1].toFixed(1)).join(' ');
      svg+='<path d="'+path+'" stroke="'+color+'" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity=".95"/>';
      coords.forEach((xy,i)=>{
        const pct=round(points[i].odds?.[id]);
        svg+='<circle cx="'+xy[0]+'" cy="'+xy[1]+'" r="'+(i===index?'6.5':'4')+
          '" fill="'+color+'" stroke="#111d30" stroke-width="2" data-ch-week="'+i+'" tabindex="0" aria-label="'+escape(name)+' · '+escape(points[i].label)+' · '+pct.toFixed(1)+' percent">'+
          '<title>'+escape(name)+' · '+escape(points[i].label)+' · '+pct.toFixed(1)+'% to win the championship</title></circle>';
      });
    });
    return svg+'</svg>';
  }
  function readout(data,points,index){
    const selected=points[index],previous=index?points[index-1]:null;
    const c=colors(data);
    const players=data.ids.slice().sort((a,b)=>Number(selected.odds?.[b]||0)-Number(selected.odds?.[a]||0));
    const rows=players.map(id=>{
      const value=round(selected.odds?.[id]);
      const before=previous?round(previous.odds?.[id]):null;
      const change=before===null?null:round(value-before);
      const trend=change===null?'Season baseline':Math.abs(change)<.05?'No change':(change>0?'+':'')+change.toFixed(1)+' pp';
      const myId=typeof session!=='undefined'?session?.user?.id:null;
      return '<div class="ch-history-result'+(myId===id?' mine':'')+'">'+
        '<span class="ch-history-player"><span class="ch-history-swatch" style="background:'+c[id]+'"></span>'+
        '<strong>'+escape(data.names[id])+(myId===id?' · YOU':'')+'</strong></span>'+
        '<span class="ch-history-result-value">'+value.toFixed(1)+'%<small class="'+(change===null?'':change>0?'up':change<0?'down':'')+'">'+escape(trend)+'</small></span></div>';
    }).join('');
    return '<div class="ch-history-readout-head"><div><div class="eyebrow">AT THIS POINT</div><h3>'+escape(selected.label)+'</h3></div><b>Championship odds</b></div>'+
      '<div class="ch-history-results">'+rows+'</div>';
  }
  function draw(){
    const node=$('championshipHistoryBox'),data=latest,points=data?.snapshots;
    if(!node||!data||!Array.isArray(points)||!points.length)return;
    if(selectedIndex===null||!Number.isInteger(selectedIndex)||selectedIndex<0||selectedIndex>=points.length)
      selectedIndex=points.length-1;
    const week=points[selectedIndex];
    const c=colors(data);
    const legend=data.ids.map(id=>
      '<button type="button" class="ch-history-legend'+(hidden.has(id)?' muted':'')+
      '" data-ch-player="'+escape(id)+'" aria-pressed="'+!hidden.has(id)+'" title="Show or hide '+escape(data.names[id])+'">'+
      '<span class="ch-history-swatch" style="background:'+c[id]+'"></span>'+escape(data.names[id])+'</button>'
    ).join('');
    const selector='<div class="ch-history-choose"><button type="button" data-ch-shift="-1" aria-label="Previous week" '+(selectedIndex===0?'disabled':'')+'>‹</button>'+
      '<select data-ch-select aria-label="Select a historical championship probability checkpoint">'+points.map((p,i)=>
        '<option value="'+i+'" '+(i===selectedIndex?'selected':'')+'>'+escape(p.label)+(p.kind==='official'?' (official)':'')+'</option>').join('')+'</select>'+
      '<button type="button" data-ch-shift="1" aria-label="Next week" '+(selectedIndex===points.length-1?'disabled':'')+'>›</button></div>';
    const sampleCount=points.filter(p=>p.samples>0).map(p=>p.samples);
    const samples=sampleCount[0]||0;
    const bracket=points.some(p=>p.kind==='playoff'||p.kind==='official');
    node.innerHTML='<div class="ch-history-header"><div><div class="eyebrow">CHAMPIONSHIP HISTORY</div><h2>Chance to Win It All</h2><p class="ch-history-sub">How the title race changed from the start of the season.</p></div><span class="ch-history-pill">BACKFILLED ESTIMATES</span></div>'+
      '<div class="ch-history-toolbar">'+selector+'<button type="button" class="ch-history-refresh" data-ch-refresh title="Refresh historical standings">Refresh</button></div>'+
      '<div class="ch-history-scroll" tabindex="0" role="region" aria-label="Scroll the championship probability graph horizontally"><div class="ch-history-chart">'+makeSvg(data,points,selectedIndex)+'</div></div>'+
      '<div class="ch-history-legend-grid" role="group" aria-label="Toggle individual member lines">'+legend+'</div>'+
      '<div class="ch-history-readout" aria-live="polite">'+readout(data,points,selectedIndex)+'</div>'+
      '<p class="ch-history-note">Retrospective estimates calculated from archived <strong>published</strong> weekly scores, using only results available through each checkpoint. The season-start baseline is 12.5% for everyone. '+(samples?samples.toLocaleString()+' simulated outcomes per regular-season checkpoint. ':'')+
      'The percentages were <strong>not saved forecasts at those earlier dates</strong>. Future match outcomes, seeds, and playoff scores are simulated; estimates can change if the model is updated.'+
      (bracket?' Postseason checkpoints use officially finalized rounds; live rounds appear only after picks lock.':'')+'</p>';
    const chosen=node.querySelector('[data-ch-week="'+selectedIndex+'"]');
    if(chosen&&selectedManual){
      // Keep the chosen checkpoint readable on narrow displays.
      const scroll=node.querySelector('.ch-history-scroll');
      if(scroll)scroll.scrollLeft=Math.max(0,chosen.cx.baseVal.value-scroll.clientWidth*.55);
    }
  }
  function selectIndex(value){
    if(!latest?.snapshots?.length||!Number.isInteger(value))return;
    selectedIndex=Math.max(0,Math.min(latest.snapshots.length-1,value));
    selectedManual=true;
    draw();
  }
  const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
  async function runFallback(timeline,playoffs,onProgress,requestId){
    const snapshots=[],all=timeline.timeline.length+playoffs.length;
    for(const checkpoint of timeline.timeline){
      if(token!==requestId)throw new Error('Reconstruction superseded');
      const p=History.predictRegular(checkpoint,Forecast,{seasonId:timeline.seasonId,
        regularWeekCount:timeline.regularWeekCount,samples:1200});
      if(p.kind!=='estimate')throw new Error(p.reason||'Could not reconstruct weekly odds.');
      snapshots.push({id:checkpoint.id,label:checkpoint.label,shortLabel:checkpoint.shortLabel,
        weekNumber:checkpoint.weekNumber,kind:checkpoint.kind,odds:p.titleOdds,samples:p.samples});
      onProgress(snapshots.length,all);
      await pause();
    }
    for(const checkpoint of playoffs){
      if(token!==requestId)throw new Error('Reconstruction superseded');
      const p=History.predictPostseason(checkpoint,Forecast,timeline.history,{seasonId:timeline.seasonId,samples:1200});
      if(p.kind!=='estimate'&&p.kind!=='official')throw new Error(p.reason||'Could not reconstruct playoff odds.');
      snapshots.push({id:checkpoint.id,label:checkpoint.label,shortLabel:checkpoint.shortLabel,
        kind:checkpoint.kind,odds:p.titleOdds,samples:p.samples});
      onProgress(snapshots.length,all);
      await pause();
    }
    return snapshots;
  }
  async function runWorker(timeline,playoffs,onProgress,requestId){
    if(typeof Worker!=='function')return runFallback(timeline,playoffs,onProgress,requestId);
    try{
      return await new Promise((resolve,reject)=>{
        let settled=false;
        try{
          worker=new Worker('championship_history_worker.js?v=1');
        }catch(error){reject(error);return;}
        const thisWorker=worker;
        const finish=(out,error)=>{
          if(settled)return;
          settled=true;thisWorker.terminate();
          if(worker===thisWorker)worker=null;
          error?reject(error):resolve(out);
        };
        thisWorker.onmessage=event=>{
          if(event.data?.requestId!==requestId||token!==requestId)return;
          if(event.data.type==='progress')onProgress(event.data.done,event.data.total);
          else if(event.data.type==='done')finish(event.data.snapshots);
          else if(event.data.type==='error')finish(null,new Error(event.data.reason||'Historical forecast error'));
        };
        thisWorker.onerror=event=>finish(null,new Error(event.message||'Worker could not load.'));
        thisWorker.postMessage({type:'rebuild',requestId,timeline,postseason:playoffs});
      });
    }catch(error){
      if(token!==requestId)throw error;
      return runFallback(timeline,playoffs,onProgress,requestId);
    }
  }
  async function postseason(timeline){
    if(timeline.weekCount!==timeline.regularWeekCount || !window.Postseason?.load)return {playoffs:[],live:null,signature:''};
    try{
      const data=await window.Postseason.load();
      if(!data||!['live','complete'].includes(data.settings?.status))return {playoffs:[],live:null,signature:''};
      const playoffs=History.postseasonInputs(timeline,data);
      const current=data.current,round=current?.round;
      let live=null;
      if(round?.status==='live'&&current.locked&&window.PlayoffAdvancement?.getChampionship){
        const forecast=await window.PlayoffAdvancement.getChampionship(data);
        if(forecast?.kind==='estimate')
          live={id:'live:'+round.id,label:'Live '+round.label,
            shortLabel:'Live R'+round.round_number,kind:'live',
            odds:forecast.titleOdds,samples:forecast.samples};
      }
      return {playoffs,live,signature:JSON.stringify([data.settings?.status,
        data.settings?.champion_id,data.history,
        current?.round?.id,current?.revision,current?.locked,live?.odds])};
    }catch(error){
      console.warn('Historic postseason checkpoints unavailable',error);
      return {playoffs:[],live:null,signature:''};
    }
  }
  async function render({profiles=[],weeks=[],scores=[]}={},parent=$('standingsBox')){
    if(!parent || typeof session==='undefined'||!session?.user?.id)return;
    const node=ensure(parent);
    const requestId=++token;
    const seasonId=typeof week!=='undefined'?week?.season_id:null;
    const timeline=History.buildTimeline({profiles,weeks,scores,seasonId,regularWeekCount:20});
    if(timeline.kind!=='ready'){
      lastKey='';latest=null;setMessage(node,timeline.reason||'Published weekly scores unavailable.');
      return;
    }
    const tail=await postseason(timeline);
    if(token!==requestId||!node.isConnected)return;
    const signature=JSON.stringify([timeline.seasonId,timeline.ids,
      timeline.timeline.map(w=>[w.weekNumber,w.weekId,w.players,w.history]),
      tail.signature,tail.playoffs.map(p=>[p.id,p.entries])]);
    if(signature===lastKey && latest){
      latestTimeline=timeline;draw();return;
    }
    if(cache.has(signature)){
      lastKey=signature;latest=cache.get(signature);latestTimeline=timeline;
      selectedIndex=selectedManual?Math.min(selectedIndex??0,latest.snapshots.length-1):latest.snapshots.length-1;
      draw();return;
    }
    worker?.terminate();worker=null;
    lastKey=signature;latest=null;latestTimeline=timeline;
    setMessage(node,'Reconstructing historical championship chances from published results…','Preparing checkpoints');
    try{
      const snaps=await runWorker(timeline,tail.playoffs,(done,total)=>{
        if(token!==requestId||!node.isConnected)return;
        const progress=node.querySelector('.ch-history-progress');
        if(progress)progress.textContent='Calculating '+done+' of '+total+' checkpoints…';
      },requestId);
      if(token!==requestId||!node.isConnected)return;
      const snapshots=tail.live?[...snaps,tail.live]:snaps;
      latest={ids:timeline.ids,names:timeline.names,snapshots};
      cache.set(signature,latest);
      if(cache.size>6)cache.delete(cache.keys().next().value);
      selectedIndex=selectedManual?Math.min(selectedIndex??0,snapshots.length-1):snapshots.length-1;
      draw();
    }catch(error){
      if(token!==requestId||!node.isConnected)return;
      lastKey='';latest=null;
      setMessage(node,'Historical graph could not be calculated: '+String(error?.message||error));
    }
  }
  window.ChampionshipHistory={render};
  if(typeof session!=='undefined'&&session && !$('standings')?.classList.contains('hidden')&&
    !$('championshipHistoryBox')&&typeof window.renderStandings==='function')
    window.renderStandings();
})();