// Lightweight update checker for the Pick'em PWA/site.
(() => {
  const CURRENT_VERSION = '2026.09.04.2';
  const CHECK_EVERY_MS = 15 * 60 * 1000;
  let lastCheck = 0;
  let latestVersion = CURRENT_VERSION;

  function showUpdateBanner(version){
    latestVersion = version || latestVersion;
    if(document.getElementById('pickemUpdateBanner')) return;
    const banner=document.createElement('div');
    banner.id='pickemUpdateBanner';
    banner.style.cssText='position:fixed;left:12px;right:12px;bottom:12px;z-index:10000;background:#102b41;border:1px solid #38bdf8;border-radius:14px;padding:12px 14px;box-shadow:0 12px 36px rgba(0,0,0,.4);display:flex;gap:12px;align-items:center;justify-content:space-between;color:#f8fafc;font:14px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
    banner.innerHTML='<div><b>New Pick\'em update available</b><div style="color:#9fb0c6;font-size:12px;margin-top:2px">Refresh once to load the newest version.</div></div><button id="pickemUpdateBtn" style="border:0;border-radius:10px;background:#38bdf8;color:#03131d;padding:10px 12px;font-weight:900;white-space:nowrap">Update</button>';
    document.body.appendChild(banner);
    document.getElementById('pickemUpdateBtn').onclick=forceUpdate;
  }

  async function getRemoteVersion(){
    const r=await fetch('./app-version.json?t='+Date.now(),{cache:'no-store'});
    if(!r.ok) return null;
    const d=await r.json();
    return String(d.version||'').trim()||null;
  }

  async function checkForUpdate(force=false){
    const now=Date.now();
    if(!force && now-lastCheck<CHECK_EVERY_MS) return;
    lastCheck=now;
    try{
      const remote=await getRemoteVersion();
      if(remote && remote!==CURRENT_VERSION) showUpdateBanner(remote);
    }catch(e){ console.debug('Update check skipped',e); }
  }

  async function forceUpdate(){
    const btn=document.getElementById('pickemUpdateBtn');
    if(btn){ btn.disabled=true; btn.textContent='Updating…'; }
    try{
      if('serviceWorker' in navigator){
        const regs=await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r=>r.update().catch(()=>null)));
      }
    }catch{}
    const u=new URL(location.href);
    u.searchParams.set('appv',latestVersion||Date.now());
    location.replace(u.toString());
  }

  window.checkPickemUpdate=()=>checkForUpdate(true);
  window.forcePickemUpdate=forceUpdate;

  setTimeout(()=>checkForUpdate(true),1800);
  setInterval(()=>checkForUpdate(false),CHECK_EVERY_MS);
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden) checkForUpdate(false);
  });
})();
