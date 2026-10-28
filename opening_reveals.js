// Personalized, read-only opening reports. Published scores only.
(() => {
  let shownThisVisit = false;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&#39;'}[c]));
  const style = document.createElement('style');
  style.textContent = `
    .reveal-backdrop{position:fixed;inset:0;z-index:9999;background:rgba(2,7,17,.84);display:grid;place-items:center;padding:16px}
    .reveal-panel{position:relative;width:min(100%,480px);max-height:90dvh;overflow:auto;background:linear-gradient(145deg,#162740,#091321);border:1px solid #bc914b;border-radius:22px;padding:26px;color:#f8fafc;box-shadow:0 25px 80px #000a}
    .reveal-eyebrow{font-size:12px;letter-spacing:.15em;color:#eac178;font-weight:900;text-transform:uppercase}
    .reveal-headline{font-size:clamp(28px,8vw,46px);font-weight:950;color:#f6ca74;line-height:1.1;margin:14px 0 8px}
    .reveal-summary{color:#b7c8df;line-height:1.5}.reveal-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:22px 0}
    .reveal-stat{background:#1b2b43;border-radius:12px;padding:12px 6px;text-align:center}.reveal-stat strong{display:block;font-size:21px}.reveal-stat small{color:#aebed1}
    .reveal-close{position:absolute;right:12px;top:10px;border:0;background:transparent;color:#fff;font-size:26px;cursor:pointer}
    .reveal-cta{width:100%;padding:13px;border:0;border-radius:10px;background:#e5b761;color:#0b1727;font-weight:900;cursor:pointer}
    .reveal-danger{border-color:#ef6475;background:linear-gradient(145deg,#421c2a,#101827)}.reveal-danger .reveal-headline{color:#ff8e9a}
  `;
  document.head.append(style);
  const show = ({eyebrow, headline, summary, stats, danger, cta, onOpen}) => {
    if (shownThisVisit || document.getElementById('openingReveal')) return;
    shownThisVisit = true;
    const overlay = document.createElement('div');
    overlay.id = 'openingReveal'; overlay.className = 'reveal-backdrop';
    overlay.innerHTML = '<section class="reveal-panel '+(danger?'reveal-danger':'')+'" role="dialog" aria-modal="true" aria-labelledby="revealTitle"><button class="reveal-close" aria-label="Dismiss report">×</button><div class="reveal-eyebrow">'+escape(eyebrow)+'</div><h2 class="reveal-headline" id="revealTitle">'+escape(headline)+'</h2><p class="reveal-summary">'+escape(summary)+'</p><div class="reveal-stats">'+stats.map(s=>'<div class="reveal-stat"><strong>'+escape(s[0])+'</strong><small>'+escape(s[1])+'</small></div>').join('')+'</div><button class="reveal-cta">'+escape(cta)+'</button></section>';
    const close = () => { overlay.remove(); document.removeEventListener('keydown', key); };
    const key = e => {if(e.key==='Escape')close();};
    overlay.querySelector('.reveal-close').addEventListener('click',close);
    overlay.querySelector('.reveal-cta').addEventListener('click',()=>{close();onOpen?.();});
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    document.addEventListener('keydown',key);
    document.body.append(overlay);
    overlay.querySelector('.reveal-close').focus();
  };
  async function regular() {
    const weeks = await db('weeks?select=id,name,number,phase,status&phase=eq.regular&order=number.desc&limit=12');
    for (const w of weeks) {
      const scores = await db('week_scores?week_id=eq.'+encodeURIComponent(w.id)+'&select=user_id,total_points');
      if (!scores.length || !scores.some(s=>s.user_id===session.user.id)) continue;
      const key = 'pickem-week-reveal:'+session.user.id+':'+w.id;
      if (localStorage.getItem(key)) return;
      const profiles = await db('profiles?select=id,display_name');
      const names = Object.fromEntries(profiles.map(p=>[p.id,p.display_name]));
      const ranked = scores.slice().sort((a,b)=>Number(b.total_points)-Number(a.total_points));
      const me = ranked.find(s=>s.user_id===session.user.id);
      const rank = 1+ranked.filter(s=>Number(s.total_points)>Number(me.total_points)).length;
      const winnerScore = Number(ranked[0].total_points);
      const winners = ranked.filter(s=>Number(s.total_points)===winnerScore).map(s=>names[s.user_id]||'Member');
      localStorage.setItem(key,'seen');
      show({eyebrow:w.name+' • Official weekly results',headline:rank===1?'WEEKLY WINNER':'#'+rank+' THIS WEEK',summary:'Week winner'+(winners.length>1?'s':'')+': '+winners.join(', '),stats:[[String(me.total_points),'Your points'],['#'+rank,'Your finish'],[String(ranked.length),'Scored members']],cta:'View standings',onOpen:()=>window.showPage?.('standings')});
      return;
    }
  }
  async function playoff() {
    if (!window.Postseason?.load) return false;
    const data = await window.Postseason.load();
    if (!data || !['live','complete'].includes(data.settings?.status)) return false;
    const me = data.entries?.find(e=>e.user_id===session.user.id);
    if (!me) return false;
    const row = data.current?.rows?.find(r=>r.user_id===session.user.id);
    const status = me.status || 'active';
    const eliminated = status==='eliminated';
    const champion = status==='champion';
    const projectedOut = row?.status==='projected_out' || (!eliminated && !champion && row?.projected_status==='projected_out');
    const title = champion?'LEAGUE CHAMPION':eliminated?'ELIMINATED':projectedOut?'DANGER ZONE':'CHAMPIONSHIP CHASE';
    const detail = champion?'You won the championship.':eliminated?'Your postseason run has ended.':projectedOut?'You are currently projected below the advancement cut. This is not final.':'You are still in the championship race. Check the live standings for your advancement outlook.';
    show({eyebrow:'Road to the Crown • Playoff status',headline:title,summary:detail,danger:eliminated||projectedOut,stats:[['#'+me.seed,'Your seed'],[String(row?.cumulative_after ?? me.cumulative_points ?? '—'),'Total points'],[String(data.current?.round?.name||'Playoffs'),'Current round']],cta:'Open Playoff Central',onOpen:()=>window.showPage?.('playoffs')});
    return true;
  }
  async function check() {
    if (shownThisVisit || !session?.user?.id || document.getElementById('app')?.classList.contains('hidden')) return;
    try { if (await playoff()) return; } catch(e) { console.warn('Playoff reveal unavailable',e); }
    try { await regular(); } catch(e) { console.warn('Weekly reveal unavailable',e); }
  }
  const previous = window.renderHome;
  window.renderHome = function() { const result=previous.apply(this,arguments); queueMicrotask(check); return result; };
  if (session?.user?.id) queueMicrotask(check);
})();
