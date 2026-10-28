// Playoff Central: chance to survive this round AND win the championship.
// Official standings remain owned by the commissioner; these are read-only forecasts.
(() => {
  const Advance=window.PlayoffAdvancementModel;
  const Crown=window.ChampionshipOddsModel;
  if(!Advance)return;
  const $=id=>document.getElementById(id);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  const style=document.createElement('style');
  style.textContent=`
    #playoffBox .ps-odds{padding:20px;border:1px solid #a9864e;border-radius:14px;background:linear-gradient(125deg,#202b3b,#111e32 70%);margin:14px 0}
    #playoffBox .ps-odds-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:9px;margin-bottom:14px}
    #playoffBox .ps-odds h2{margin:2px 0;font-size:23px;color:#f4d084}
    #playoffBox .ps-odds .ps-odds-tag{background:#413627;border:1px solid #997646;color:#f8d99b;font-weight:800;font-size:11px;letter-spacing:.07em;padding:5px 8px;border-radius:6px;text-transform:uppercase}
    #playoffBox .ps-odds-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    #playoffBox .ps-odds-item{padding:13px;border:1px solid #34445b;border-radius:10px;background:#101a2b;min-width:0}
    #playoffBox .ps-odds-item.mine{border-color:#d9b56d;background:#292c32}
    #playoffBox .ps-odds-name{font-weight:850;overflow-wrap:anywhere;margin-bottom:10px}
    #playoffBox .ps-odds-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
    #playoffBox .ps-odds-metric{border:1px solid #34445b;border-radius:8px;padding:10px 9px;min-width:0}
    #playoffBox .ps-odds-metric.title{border-color:#70562f;background:#352b1c52}
    #playoffBox .ps-odds-metric small{display:block;color:#b9c6d8;font-size:11px;font-weight:750;margin-bottom:5px}
    #playoffBox .ps-odds-rate{font-weight:950;font-size:23px;color:#f2c66e;font-variant-numeric:tabular-nums;white-space:nowrap}
    #playoffBox .ps-odds-metric.risk .ps-odds-rate{color:#ff929e}
    #playoffBox .ps-odds-bar{height:7px;background:#2b3b50;border-radius:8px;overflow:hidden;margin:7px 0 0}
    #playoffBox .ps-odds-fill{display:block;height:100%;background:linear-gradient(90deg,#7b6a46,#f3c96b);border-radius:8px}
    #playoffBox .ps-odds-metric.risk .ps-odds-fill{background:linear-gradient(90deg,#873344,#f07888)}
    #playoffBox .ps-odds-note{font-size:12px;color:#b9c6d8;line-height:1.55;margin:12px 0 0}
    #playoffBox .ps-odds-note strong{color:#e7bf72}
    @media(max-width:590px){#playoffBox .ps-odds-list{grid-template-columns:1fr}#playoffBox .ps-odds{padding:13px}}
  `;
  document.head.append(style);
  const lockedCache=new Map(),advCache=new Map(),titleCache=new Map();
  let historyCache=null,viewRequest=0;
  const msg=(kind,reason)=>({kind,reason});
  function revisionKey(data){
    const c=data?.current;
    return [data?.settings?.status,c?.round?.id,c?.revision,JSON.stringify((data?.entries||[]).map(e=>[e.user_id,e.status,e.current_total]))].join(':');
  }
  function cachePush(map,key,value){
    map.set(key,value);
    if(map.size>8)map.delete(map.keys().next().value);
    return value;
  }
  async function lockedBundle(data){
    const c=data?.current;
    if(!c?.locked||c?.round?.status==='finalized')return msg('unavailable','This card does not have locked picks to simulate.');
    const key=c.round.id+':'+c.revision;
    if(lockedCache.has(key))return lockedCache.get(key);
    const request=(async()=>{
      try{
        const wid=encodeURIComponent(c.week?.id||c.round.week_id);
        const [questions,picks]=await Promise.all([
          db('questions?week_id=eq.'+wid+'&select=id,answer_options,counts_for_score,result'),
          db('picks?week_id=eq.'+wid+'&select=user_id,question_id,answer')
        ]);
        if(!Array.isArray(questions)||!Array.isArray(picks))return msg('unavailable','Locked picks are temporarily unavailable.');
        // Revalidate lock and revision after fetching: never show stale or reopened picks.
        const fresh=await window.Postseason.load(undefined,null,true);
        if(!fresh?.current?.locked||fresh.current.round?.id!==c.round.id||
           fresh.current.revision!==c.revision)
          return msg('unavailable','The playoff card changed. Please refresh for updated odds.');
        return {kind:'ready',questions,picks};
      }catch(e){return msg('unavailable','Could not load locked picks.');}
    })();
    return cachePush(lockedCache,key,request.then(value=>{
      if(value.kind!=='ready')lockedCache.delete(key);
      return value;
    }));
  }
  async function regularHistory(){
    if(historyCache&&Date.now()-historyCache.at<120000)return historyCache.value;
    const rows=await db('week_scores?select=user_id,correct_count,question_count,weeks!inner(phase)&weeks.phase=eq.regular');
    if(!Array.isArray(rows))throw new Error('Regular scoring history unavailable');
    historyCache={value:rows,at:Date.now()};
    return rows;
  }
  async function getOdds(data){
    const c=data?.current;
    if(!c?.round||!Array.isArray(c.rows))return msg('unavailable','The next playoff round has not started.');
    if(c.round.status==='finalized'||!c.locked)return Advance.result(data);
    const key=revisionKey(data);
    if(advCache.has(key))return advCache.get(key);
    const promise=(async()=>{
      const b=await lockedBundle(data);
      if(b.kind!=='ready')return b;
      return Advance.result(data,b.questions,b.picks);
    })();
    return cachePush(advCache,key,promise.then(value=>{
      if(value.kind==='unavailable')advCache.delete(key);
      return value;
    }));
  }
  async function getChampionship(data){
    if(!Crown)return msg('unavailable','Championship forecasts have not loaded.');
    if(!data||data.settings?.status==='scheduled')return msg('unavailable','Playoffs have not started.');
    const key=revisionKey(data);
    if(titleCache.has(key))return titleCache.get(key);
    const promise=(async()=>{
      try{
        if(data.settings?.status==='complete')
          return Crown.estimatePlayoffs({entries:data.entries,state:data});
        const history=await regularHistory();
        const c=data.current;
        if(c?.locked&&c.round?.status!=='finalized'){
          const b=await lockedBundle(data);
          if(b.kind!=='ready')return b;
          return Crown.estimatePlayoffs({entries:data.entries,state:data,history,
            questions:b.questions,picks:b.picks,samples:4500});
        }
        // Before a lock, forecast future picks without requesting anyone's picks.
        return Crown.estimatePlayoffs({entries:data.entries,state:data,history,samples:4500});
      }catch(e){return msg('unavailable','Championship odds are temporarily unavailable.');}
    })();
    return cachePush(titleCache,key,promise.then(value=>{
      if(value.kind==='unavailable')titleCache.delete(key);
      return value;
    }));
  }
  function metric(label,value,isFinal,kind){
    const exists=Number.isFinite(value);
    const risk=exists&&value<50&&kind==='advance';
    const labelText=exists?value.toFixed(isFinal?0:1)+'%':'—';
    return '<div class="ps-odds-metric '+(kind==='title'?'title':'')+(risk?' risk':'')+'"><small>'+label+'</small><strong class="ps-odds-rate">'+labelText+'</strong><div class="ps-odds-bar"><span class="ps-odds-fill" style="width:'+(exists?Math.max(0,Math.min(100,value)):0)+'%"></span></div></div>';
  }
  function markup(data,adv,title){
    const forecast=title?.kind==='estimate'||title?.kind==='official';
    const advanced=adv?.kind==='estimate'||adv?.kind==='official';
    const official=data.settings?.status==='complete';
    let html='<div class="ps-odds-head"><div><div class="eyebrow">THE SURVIVAL RACE</div><h2>Advance &amp; Win It All</h2></div><span class="ps-odds-tag">'+(official?'OFFICIAL CHAMPION':'CHAMPIONSHIP FORECAST')+'</span></div>';
    if(!advanced&&!forecast)
      return html+'<p class="ps-odds-note">'+escape(title?.reason||adv?.reason||'Waiting for playoff data.')+'</p>';
    html+='<div class="ps-odds-list">'+data.current.rows.map(row=>{
      const advance=advanced?adv.odds?.[row.user_id]:undefined;
      const crown=forecast?title.titleOdds?.[row.user_id]:undefined;
      const mine=row.user_id===session?.user?.id;
      return '<div class="ps-odds-item'+(mine?' mine':'')+'"><div class="ps-odds-name">'+escape(row.display_name)+(mine?' · YOU':'')+'</div><div class="ps-odds-metrics">'+
        metric('Chance to advance',advance,adv.kind==='official','advance')+
        metric('Win it all',crown,title?.kind==='official','title')+'</div><p class="ps-odds-note">Seed #'+escape(row.seed)+'</p></div>';
    }).join('')+'</div>';
    if(adv.kind==='pending')html+='<p class="ps-odds-note"><strong>Chance to advance unlocks with the picks.</strong> Championship odds are already estimated using the players’ season performance.</p>';
    if(title.kind==='estimate'){
      html+='<p class="ps-odds-note"><strong>'+title.samples.toLocaleString()+' championship simulations.</strong> Includes every remaining elimination round and the one-time seed bonus. Unknown future cards use estimated question counts ('+title.assumedRoundCounts.join(' / ')+') and historical pick accuracy. Percentages are estimates, not official outcomes.</p>';
    }else if(title.kind==='official')html+='<p class="ps-odds-note">The commissioner has finalized the champion.</p>';
    else html+='<p class="ps-odds-note">'+escape(title.reason||'Championship probabilities are unavailable.')+'</p>';
    if(adv.kind==='estimate')html+='<p class="ps-odds-note">Advancement is based on the locked current-round picks and its '+adv.remaining+' undecided scored results. Remaining answers are treated as equally likely; unknown tiebreakers are simulated.</p>';
    return html;
  }
  function mount(){
    const box=$('playoffBox'),race=box?.querySelector('.ps-race');
    if(!race)return null;
    let node=$('psAdvancementOdds');
    if(!node){node=document.createElement('section');node.id='psAdvancementOdds';node.className='ps-odds';node.setAttribute('aria-label','Chances to advance and win the championship');race.before(node);}
    return node;
  }
  async function render(data){
    const target=mount();if(!target||!data?.current)return;
    const id=++viewRequest,key=revisionKey(data);
    if(target.dataset.revision!==key){
      target.dataset.revision=key;
      target.innerHTML='<div class="ps-odds-head"><div><div class="eyebrow">THE SURVIVAL RACE</div><h2>Advance &amp; Win It All</h2></div></div><p class="ps-odds-note">Calculating championship scenarios…</p>';
    }else if(target.dataset.done==='yes')return;
    const [adv,title]=await Promise.all([getOdds(data),getChampionship(data)]);
    if(id!==viewRequest||!target.isConnected)return;
    target.innerHTML=markup(data,adv,title);
    target.dataset.done=adv.kind==='unavailable'||title.kind==='unavailable'?'no':'yes';
  }
  window.PlayoffAdvancement={render,getOdds,getChampionship};
})();