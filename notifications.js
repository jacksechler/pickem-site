// Web Push notifications + automatic early-lock UI.
(() => {
  const VAPID_PUBLIC='BLW3OKvXZrNK_C8QGOpWBo9yE8OCO4nqn9RKIUlwvKBQxLDDgtlwrRLFw_kkk3xTG2Hnv5mvBoHMfgRQYrnsprE';
  const PUSH_FN=SUPABASE+'/functions/v1/push-notifications';

  function isIOS(){ return /iphone|ipad|ipod/i.test(navigator.userAgent||''); }
  function isStandalone(){ return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true; }
  function supportsPush(){ return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }

  function b64ToBytes(s){
    const pad='='.repeat((4-s.length%4)%4);
    const b64=(s+pad).replace(/-/g,'+').replace(/_/g,'/');
    const raw=atob(b64);
    return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
  }
  function bytesToB64Url(buf){
    const bytes=new Uint8Array(buf);
    let raw='';
    bytes.forEach(b=>raw+=String.fromCharCode(b));
    return btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }

  async function getRegistration(){
    return await navigator.serviceWorker.register('./sw.js',{scope:'./'});
  }

  async function currentSubscription(){
    if(!supportsPush()) return null;
    try{
      const reg=await getRegistration();
      return await reg.pushManager.getSubscription();
    }catch{return null;}
  }

  async function saveSubscription(sub){
    const p256dh=sub.getKey('p256dh');
    const auth=sub.getKey('auth');
    if(!p256dh||!auth) throw new Error('This device did not return push keys.');
    await db('push_subscriptions?on_conflict=endpoint',{
      method:'POST',
      headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify({
        user_id:session.user.id,
        endpoint:sub.endpoint,
        p256dh:bytesToB64Url(p256dh),
        auth_key:bytesToB64Url(auth),
        user_agent:navigator.userAgent||null,
        updated_at:new Date().toISOString()
      })
    });
  }

  window.enableLeagueNotifications=async function(){
    const out=el('notificationStatus');
    if(!supportsPush()){
      if(out) out.textContent='Push notifications are not supported in this browser.';
      return;
    }
    if(isIOS()&&!isStandalone()){
      if(out) out.innerHTML='<b>On iPhone:</b> tap Share → Add to Home Screen, open Pick\'em from the new icon, then tap Enable Notifications again.';
      return;
    }
    if(Notification.permission==='denied'){
      if(out) out.textContent='Notifications are blocked for Pick\'em. Allow them in your phone/browser settings, then try again.';
      return;
    }
    try{
      if(out) out.textContent='Setting up notifications…';
      const permission=await Notification.requestPermission();
      if(permission!=='granted'){
        if(out) out.textContent='Notifications were not enabled.';
        return;
      }
      const reg=await getRegistration();
      let sub=await reg.pushManager.getSubscription();
      if(!sub){
        sub=await reg.pushManager.subscribe({
          userVisibleOnly:true,
          applicationServerKey:b64ToBytes(VAPID_PUBLIC)
        });
      }
      await saveSubscription(sub);
      await renderNotificationHomeCard();
    }catch(e){
      console.error(e);
      if(out) out.textContent='Could not enable notifications on this device.';
    }
  };

  window.disableLeagueNotifications=async function(){
    const out=el('notificationStatus');
    try{
      const sub=await currentSubscription();
      if(sub){
        await db('push_subscriptions?endpoint=eq.'+encodeURIComponent(sub.endpoint),{
          method:'DELETE',headers:{Prefer:'return=minimal'}
        });
        await sub.unsubscribe();
      }
      await renderNotificationHomeCard();
    }catch(e){
      console.error(e);
      if(out) out.textContent='Could not disable notifications.';
    }
  };

  async function renderNotificationHomeCard(){
    if(!session||!profile) return;
    const home=el('home');
    if(!home) return;
    el('notificationCard')?.remove();

    let enabled=false;
    if(supportsPush()) enabled=!!(await currentSubscription());
    let h='<div class="card" id="notificationCard"><div class="row" style="gap:12px;align-items:flex-start;flex-wrap:wrap"><div style="flex:1;min-width:210px"><div class="eyebrow">PHONE ALERTS</div><h2 style="margin:4px 0">League Notifications</h2>';
    if(enabled){
      h+='<div class="good"><b>✓ Enabled on this device</b></div><div class="mini">You can receive picks, score, week-complete, and leaderboard alerts.</div>';
    }else if(isIOS()&&!isStandalone()){
      h+='<div class="muted">On iPhone, add Pick\'em to your Home Screen first. Then open it from the icon and enable alerts.</div>';
    }else{
      h+='<div class="muted">Get league updates even when Pick\'em is closed.</div>';
    }
    h+='</div><div>'+(enabled
      ?'<button class="btn secondary" onclick="disableLeagueNotifications()">Turn Off</button>'
      :'<button class="btn" onclick="enableLeagueNotifications()">🔔 Enable Notifications</button>')+'</div></div><div id="notificationStatus" class="mini"></div></div>';
    home.insertAdjacentHTML('beforeend',h);
  }

  const presets={
    open:()=>({title:'🏈 Picks Are Open',body:(week?.name||'This week')+' picks are open. Make your picks now!',page:'picks'}),
    closing:()=>({title:'⏰ Picks Close Today',body:'Picks close today — make yours now!',page:'picks'}),
    score:()=>{
      const scored=questions.filter(q=>q.counts_for_score!==false);
      const done=scored.filter(q=>q.result!==null&&q.result!==undefined).length;
      return {title:'📊 Score Update',body:done+'/'+scored.length+' results are in. Check the live weekly standings.',page:'league'};
    },
    over:()=>({title:'🏁 Week Over',body:(week?.name||'The week')+' is complete. See how you finished.',page:'league'}),
    leaderboard:()=>({title:'🏆 Leaderboard Update',body:'The season leaderboard has been updated. Check the standings.',page:'standings'})
  };

  window.useNotificationPreset=function(key){
    const p=presets[key]?.();
    if(!p) return;
    if(el('pushTitle')) el('pushTitle').value=p.title;
    if(el('pushBody')) el('pushBody').value=p.body;
    if(el('pushPage')) el('pushPage').value=p.page;
  };

  async function notificationCenterHtml(){
    const profiles=await db('profiles?select=id,display_name,username&order=display_name.asc');
    return '<div class="card" id="notificationCenter"><div class="eyebrow">COMMISSIONER</div><h2 style="margin:4px 0">🔔 Notification Center</h2><div class="muted">Send a phone alert to the whole league or one player. They must enable notifications on their device first.</div>'+
      '<div style="display:flex;gap:7px;flex-wrap:wrap;margin:13px 0">'+
        '<button class="btn secondary" onclick="useNotificationPreset(\'open\')">Picks Open</button>'+
        '<button class="btn secondary" onclick="useNotificationPreset(\'closing\')">Closing Today</button>'+
        '<button class="btn secondary" onclick="useNotificationPreset(\'score\')">Score Update</button>'+
        '<button class="btn secondary" onclick="useNotificationPreset(\'over\')">Week Over</button>'+
        '<button class="btn secondary" onclick="useNotificationPreset(\'leaderboard\')">Leaderboard</button></div>'+
      '<label>Send to</label><select id="pushTarget"><option value="">Everyone</option>'+profiles.map(p=>'<option value="'+p.id+'">'+esc(p.display_name||p.username||'Player')+'</option>').join('')+'</select>'+
      '<label>Title</label><input id="pushTitle" maxlength="80" placeholder="Pick\'em update">'+
      '<label>Message</label><input id="pushBody" maxlength="220" placeholder="Type your notification">'+
      '<label>Open this page when tapped</label><select id="pushPage"><option value="home">Home</option><option value="picks">Picks</option><option value="league">League Picks</option><option value="standings">Standings</option><option value="stats">Stats</option></select>'+
      '<button class="btn full" onclick="sendLeagueNotification()">Send Notification</button><div id="pushSendStatus" class="mini"></div></div>';
  }

  window.sendLeagueNotification=async function(){
    const status=el('pushSendStatus');
    const title=(el('pushTitle')?.value||'').trim();
    const body=(el('pushBody')?.value||'').trim();
    if(!title||!body){ if(status) status.textContent='Choose a preset or enter a title and message.'; return; }
    if(!confirm('Send this notification now?')) return;
    try{
      if(status) status.textContent='Sending…';
      const r=await fetch(PUSH_FN,{
        method:'POST',
        headers:{apikey:KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},
        body:JSON.stringify({
          title,body,
          target_user_id:el('pushTarget')?.value||null,
          page:el('pushPage')?.value||'home'
        })
      });
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||'Could not send notification');
      if(status) status.innerHTML=d.sent
        ?'<span class="good"><b>✓ Sent to '+d.sent+' device'+(d.sent===1?'':'s')+'.</b></span>'+(d.failed?' '+d.failed+' failed.':'')
        :'<span class="muted">No enabled devices for that recipient yet.</span>';
    }catch(e){
      console.error(e);
      if(status) status.textContent=e.message||'Could not send notification.';
    }
  };

  const baseHome=window.renderHome;
  window.renderHome=function(){
    baseHome();
    if(week?.auto_locked_at && locked()){
      const lock=el('homeLock');
      if(lock) lock.innerHTML='<b>🔒 '+esc(week.name)+' locked early.</b> All 8 players submitted their picks.';
    }
    renderNotificationHomeCard().catch(console.debug);
  };

  const baseCommissioner=window.renderCommissioner;
  window.renderCommissioner=async function(){
    await baseCommissioner();
    if(profile?.role!=='commissioner') return;
    const box=el('commissionerBox');
    if(!box) return;
    el('notificationCenter')?.remove();
    try{
      const h=await notificationCenterHtml();
      box.insertAdjacentHTML('afterbegin',h);
      if(week?.auto_locked_at){
        box.insertAdjacentHTML('afterbegin','<div class="notice"><b>🔒 Auto-locked early</b><div class="muted">All 8 players submitted, so '+esc(week.name)+' locked automatically.</div></div>');
      }
    }catch(e){ console.debug('Notification center skipped',e); }
  };

  // If a push notification opened a specific section, route there after boot finishes.
  setTimeout(()=>{
    const requested=new URLSearchParams(location.search).get('page');
    const allowed=['home','picks','league','standings','stats'];
    if(session && allowed.includes(requested)){
      const btn=document.querySelector('[data-page="'+requested+'"]');
      if(btn) showPage(requested,btn);
    }
  },900);
})();
