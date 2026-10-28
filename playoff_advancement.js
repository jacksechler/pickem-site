// Playoff Central advancement-chance panel. Read-only and hidden from unlocked picks.
(() => {
  const M=window.PlayoffAdvancementModel;
  if(!M) return;
  const $=id=>document.getElementById(id);
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&#39;'}[c]));
  const style=document.createElement('style');
  style.textContent=`
  #playoffBox .ps-odds{padding:19px;border:1px solid #a9864e;border-radius:14px;background:linear-gradient(125deg,#202b3b,#111e32 70%);margin:14px 0}
  #playoffBox .ps-odds-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:9px;margin-bottom:14px}
  #playoffBox .ps-odds h2{margin:2px 0;font-size:23px;color:#f4d084}
  #playoffBox .ps-odds .ps-odds-tag{background:#413627;border:1px solid #997646;color:#f8d99b;font-weight:800;font-size:11px;letter-spacing:.07em;padding:5px 8px;border-radius:6px;text-transform:uppercase}
  #playoffBox .ps-odds-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  #playoffBox .ps-odds-item{padding:12px;border:1px solid #34445b;border-radius:10px;background:#101a2b;min-width:0}
  #playoffBox .ps-odds-item.mine{border-color:#d9b56d;background:#292c32}
  #playoffBox .ps-odds-item.risk .ps-odds-rate{color:#ff929e}
  #playoffBox .ps-odds-line{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
  #playoffBox .ps-odds-name{font-weight:850;overflow-wrap:anywhere}
  #playoffBox .ps-odds-rate{font-weight:950;font-size:22px;color:#f2c66e;font-variant-numeric:tabular-nums;white-space:nowrap}
  #playoffBox .ps-odds-bar{height:8px;background:#2b3b50;border-radius:8px;overflow:hidden;margin:8px 0 4px}
  #playoffBox .ps-odds-fill{display:block;height:100%;background:linear-gradient(90deg,#7b6a46,#f3c96b);border-radius:8px}
  #playoffBox .ps-odds-item.risk .ps-odds-fill{background:linear-gradient(90deg,#873344,#f07888)}
  #playoffBox .ps-odds small,#playoffBox .ps-odds-note{font-size:12px;color:#b9c6d8;line-height:1.5}
  #playoffBox .ps-odds-note{margin:12px 0 0}
  @media(max-width:590px){#playoffBox .ps-odds-list{grid-template-columns:1fr}#playoffBox .ps-odds{padding:13px}}
  `;
  document.head.append(style);
  const cache=new Map();
  let viewRequest=0;
  const msg=(kind,reason)=>({kind,reason});
  async function getOdds(data){
    const c=data?.current;
    if(!c?.round || !Array.isArray(c.rows)) return msg('unavailable','The next playoff round has not started.');
    if(c.round.status==='finalized'||!c.locked) return M.result(data);
    const key=c.round.id+':'+c.revision;
    if(cache.has(key)) return cache.get(key);
    const promise=(async()=>{
      try{
        const wid=encodeURIComponent(c.week.id),[questions,picks]=await Promise.all([
          db('questions?week_id=eq.'+wid+'&select=id,answer_options,counts_for_score,result'),
          db('picks?week_id=eq.'+wid+'&select=user_id,question_id,answer')
        ]);
        if(!Array.isArray(questions)||!Array.isArray(picks))return msg('unavailable','Locked pick data is incomplete.');
        // Do not display percentages calculated from a stale round or a reopened card.
        const currentState=await window.Postseason.load(undefined,null,true);
        if(!currentState?.current?.locked||currentState.current.round?.id!==c.round.id||
          currentState.current.revision!==c.revision)
          return msg('unavailable','The round changed. Refreshing the official standings.');
        return M.result(data,questions,picks);
      }catch(e){return msg('unavailable','Advancement odds cannot be loaded right now. Official standings are unaffected.');}
    })();
    cache.set(key,promise);
    if(cache.size>8) cache.delete(cache.keys().next().value);
    return promise;
  }
  const description = result => result.kind==='official'?'Official results · advancement finalized':
    result.kind==='estimate' ? result.remaining+' undecided scored question'+(result.remaining===1?'':'s')+' · '+result.samples.toLocaleString()+' simulations' :
    'Awaiting the next probability update';
  function markup(data,result){
    const title='<div class="ps-odds-head"><div><div class="eyebrow">THE SURVIVAL RACE</div><h2>Chance to Advance</h2></div><span class="ps-odds-tag">'+(result.kind==='official'?'OFFICIAL':'ESTIMATED ODDS')+'</span></div>';
    if(result.kind!=='estimate'&&result.kind!=='official')
      return title+'<p class="ps-odds-note">'+escape(result.reason||'Not available yet.')+'</p>';
    const cards=data.current.rows.map(row=>{
      const value=result.odds[row.user_id];
      if(!Number.isFinite(value))return '';
      const mine=row.user_id===session?.user?.id;
      const risk=value<50;
      return '<div class="ps-odds-item'+(mine?' mine':'')+(risk?' risk':'')+'"><div class="ps-odds-line"><span class="ps-odds-name">'+escape(row.display_name)+(mine?' · YOU':'')+'</span><strong class="ps-odds-rate">'+value.toFixed(result.kind==='official'?0:1)+'%</strong></div><div class="ps-odds-bar"><span class="ps-odds-fill" style="width:'+Math.min(100,Math.max(0,value))+'%"></span></div><small>Seed #'+escape(row.seed)+' · '+(result.kind==='official'?(value===100?'Advanced':'Eliminated'):'Chance to finish inside the top '+escape(data.current.round.participants_after))+'</small></div>';
    }).join('');
    return title+'<div class="ps-odds-list">'+cards+'</div><p class="ps-odds-note">'+escape(description(result))+'. '+(result.kind==='estimate'?'Based on the current score and everybody’s locked picks. Remaining answer choices are treated as equally likely; unresolved tiebreaks are split randomly. Probabilities are estimates, not official outcomes.':'The commissioner has finalized this round.')+'</p>';
  }
  function mount(){
    const box=$('playoffBox'),race=box?.querySelector('.ps-race');
    if(!race)return null;
    let node=$('psAdvancementOdds');
    if(!node){node=document.createElement('section');node.id='psAdvancementOdds';node.className='ps-odds';node.setAttribute('aria-label','Playoff advancement probabilities');race.before(node);}
    return node;
  }
  async function render(data){
    const target=mount();if(!target||!data?.current)return;
    const id=++viewRequest;
    const revision=data.current.revision||data.current.round?.id;
    if(target.dataset.revision!==revision){
      target.dataset.revision=revision;
      target.innerHTML='<div class="ps-odds-head"><div><div class="eyebrow">THE SURVIVAL RACE</div><h2>Chance to Advance</h2></div></div><p class="ps-odds-note">Calculating advancement scenarios…</p>';
    }else if(target.dataset.done==='yes')return;
    const result=await getOdds(data);
    if(id!==viewRequest||!target.isConnected)return;
    target.innerHTML=markup(data,result);
    target.dataset.done=result.kind==='unavailable'?'no':'yes';
  }
  window.PlayoffAdvancement={render,getOdds};
})();
