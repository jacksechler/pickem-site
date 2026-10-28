// Top 3 weekly-win chances on League Picks. Picks are never read before lock.
(() => {
  const M=window.WeeklyWinOddsModel;
  if(!M)return;
  const $=id=>document.getElementById(id);
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&#39;'}[c]));
  const css=document.createElement('style');
  css.textContent=`
    #weeklyWinOdds.wo-odds{border:1px solid #776747;background:linear-gradient(130deg,#172741 0%,#111d30 68%,#272639 100%);border-radius:16px;margin:14px 0;padding:19px;box-shadow:0 12px 28px #0002}
    .wo-odds .wo-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px}
    .wo-odds .wo-head h2{font-size:23px;margin:4px 0 3px;color:#f2cd80}
    .wo-odds .wo-head .eyebrow{color:#dfb769}
    .wo-odds .wo-pill{font-size:11px;font-weight:900;letter-spacing:.06em;background:#3b3426;border:1px solid #8d713f;color:#f5d392;border-radius:6px;padding:6px 9px}
    .wo-odds .wo-top{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}
    .wo-odds .wo-card{border:1px solid #3f516d;border-radius:12px;background:#0b192c;padding:15px;min-width:0}
    .wo-odds .wo-card:first-child{border-color:#d7ad54;background:linear-gradient(130deg,#413522,#172238)}
    .wo-odds .wo-card.mine{outline:2px solid #71c5f5;outline-offset:-2px}
    .wo-odds .wo-rank{font-size:10px;font-weight:850;letter-spacing:.1em;color:#d0ac75}
    .wo-odds .wo-name{font-size:16px;font-weight:850;overflow-wrap:anywhere;margin:9px 0 6px}
    .wo-odds .wo-pct{font-size:clamp(25px,4vw,36px);font-weight:950;color:#f4cf83;font-variant-numeric:tabular-nums;line-height:1.12}
    .wo-odds .wo-track{height:7px;border-radius:7px;background:#334259;overflow:hidden;margin:11px 0 8px}
    .wo-odds .wo-fill{display:block;height:100%;background:linear-gradient(90deg,#a77b35,#f3cc77);border-radius:7px}
    .wo-odds .wo-meta{font-size:11px;color:#b6c3d5}
    .wo-odds .wo-help{font-size:12px;line-height:1.5;color:#b2c0d4;margin:13px 0 0}
    .wo-odds .wo-pending{line-height:1.5;color:#bfcede;margin:8px 0 0}
    @media(max-width:650px){#weeklyWinOdds.wo-odds{padding:14px}.wo-odds .wo-top{grid-template-columns:1fr;gap:9px}.wo-odds .wo-card{display:grid;grid-template-columns:1fr auto;column-gap:12px;padding:12px}.wo-odds .wo-rank,.wo-odds .wo-name,.wo-odds .wo-meta{grid-column:1}.wo-odds .wo-name{margin:4px 0}.wo-odds .wo-pct{grid-column:2;grid-row:1/3;align-self:center;font-size:29px}.wo-odds .wo-track{grid-column:1/3;margin:7px 0}}
  `;
  document.head.append(css);
  let sequence=0,activeRefresh=0;
  const visible=()=>!!session?.user?.id&&!$('league')?.classList.contains('hidden')&&!$('app')?.classList.contains('hidden');
  const weekId=()=>$('leagueBox')?.querySelector('select[onchange*="setLeagueHistoryWeek"]')?.value || week?.id||null;
  const findNode=()=>document.getElementById('weeklyWinOdds');
  function remove(){findNode()?.remove();}
  function insert(){
    const box=$('leagueBox');if(!box)return null;
    let node=findNode();
    if(node&&box.contains(node))return node;
    node=document.createElement('section');
    node.id='weeklyWinOdds';node.className='card wo-odds';
    node.setAttribute('aria-label','Top three chances to win this week');
    const panel=box.querySelector('.clean-panel[data-tab="results"]')||box;
    const standings=panel.querySelector('#weeklyStandingsV2');
    const anchor=standings||panel.querySelector('#pathToWinCard');
    if(anchor)anchor.before(node);
    else panel.prepend(node);
    return node;
  }
  function view(bundle,prediction,names){
    const w=bundle.week;
    const official=prediction.kind==='official';
    const status=official?'OFFICIAL RESULT':'LIVE PROJECTION';
    let html='<div class="wo-head"><div><div class="eyebrow">WEEKLY RACE</div><h2>Top 3 Chances to Win</h2><div class="muted">'+escape(w.name||'This week')+'</div></div><span class="wo-pill">'+status+'</span></div>';
    if(prediction.kind==='unavailable'||prediction.kind==='pending'||prediction.kind==='locked'){
      html+='<p class="wo-pending">'+escape(prediction.reason)+'</p>';
      return html;
    }
    html+='<div class="wo-top">'+prediction.players.slice(0,3).map((p,i)=>{
      const pct=official?Number(p.probability).toFixed(0):Number(p.probability).toFixed(1);
      const person=names[p.id]||'League member';
      return '<div class="wo-card'+(p.id===session?.user?.id?' mine':'')+'"><span class="wo-rank">'+(official?'FINISH #'+p.placement:'#'+(i+1)+' WIN CHANCE')+'</span><div class="wo-name">'+escape(person)+(p.id===session?.user?.id?' · YOU':'')+'</div><strong class="wo-pct">'+pct+'%</strong><div class="wo-track"><span class="wo-fill" style="width:'+Math.max(0,Math.min(100,Number(p.probability)))+'%"></span></div><div class="wo-meta">'+(official?(p.placement===1?'Official weekly winner':'Week finished'):(p.correct+' correct so far'))+'</div></div>';
    }).join('')+'</div>';
    if(official){
      html+='<p class="wo-help">Final published week. Official first-place ties each count as a weekly win; other members have a 0% chance because the week has finished.</p>';
    }else{
      html+='<p class="wo-help">'+prediction.decided+' of '+prediction.total+' scored questions decided · '+(prediction.remaining?prediction.samples.toLocaleString()+' simulations':'All game results entered')+'. Each remaining answer choice is treated as equally likely. '+(prediction.actualKnown?'The entered tiebreaker is used if correct-pick totals tie.':'If correct-pick totals tie, chances are split evenly until the actual tiebreaker is known.')+' These are estimates, not official results.</p>';
    }
    return html;
  }
  async function loadBundle(id){
    const encoded=encodeURIComponent(id);
    const w=(await db('weeks?id=eq.'+encoded+'&select=id,name,phase,status,lock_at,auto_locked_at,tiebreaker_result&limit=1'))?.[0];
    if(!w||w.phase!=='regular'||!M.locked(w))return null;
    const [questions,submissions,picks,officialScores,profiles,fresh]=await Promise.all([
      db('questions?week_id=eq.'+encoded+'&select=id,counts_for_score,answer_options,result'),
      db('submissions?week_id=eq.'+encoded+'&select=user_id,tiebreaker_answer'),
      db('picks?week_id=eq.'+encoded+'&select=user_id,question_id,answer'),
      db('week_scores?week_id=eq.'+encoded+'&select=user_id,placement,correct_count'),
      db('profiles?select=id,display_name'),
      db('weeks?id=eq.'+encoded+'&select=id,name,phase,status,lock_at,auto_locked_at,tiebreaker_result&limit=1')
    ]);
    // Do not show prior odds if the commissioner reopened the week.
    const latest=fresh?.[0];
    if(!latest||latest.phase!=='regular'||!M.locked(latest))return null;
    return {bundle:{week:latest,questions,submissions,picks,officialScores},
      names:Object.fromEntries(profiles.map(p=>[p.id,p.display_name||'League member']))};
  }
  async function refresh(){
    if(!visible())return;
    const id=weekId();
    if(!id){remove();return;}
    const call=++sequence;
    // Check the selected week's lock before creating an odds card or reading picks.
    try{
      const data=await loadBundle(id);
      if(call!==sequence||weekId()!==id||!visible())return;
      if(!data){remove();return;}
      const prediction=M.result(data.bundle);
      const html=view(data.bundle,prediction,data.names);
      const signature=JSON.stringify([id,data.bundle.week.status,data.bundle.week.tiebreaker_result,data.bundle.questions.map(q=>[q.id,q.result]),prediction.kind,prediction.players?.map(p=>[p.id,p.probability])]);
      const target=insert();
      if(target&&target.dataset.signature!==signature){target.innerHTML=html;target.dataset.signature=signature;target.dataset.week=id;}
    }catch(e){
      if(call!==sequence||weekId()!==id)return;
      const target=insert();
      if(target)target.innerHTML='<div class="wo-head"><div><div class="eyebrow">WEEKLY RACE</div><h2>Top 3 Chances to Win</h2></div></div><p class="wo-pending">Odds are temporarily unavailable. Your picks and standings are unaffected.</p>';
    }
  }
  const previous=window.renderLeague;
  if(typeof previous==='function'){
    window.renderLeague=async function(){
      const result=await previous.apply(this,arguments);
      if(visible())await refresh();
      return result;
    };
  }
  setInterval(()=>{
    if(!visible()||document.visibilityState==='hidden'||activeRefresh)return;
    activeRefresh=1;
    refresh().finally(()=>{activeRefresh=0;});
  },20000);
  window.addEventListener('focus',()=>{if(visible())refresh();});
  window.WeeklyWinOdds={refresh};
})();
