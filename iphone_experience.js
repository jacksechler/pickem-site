// iPhone Home Screen setup and truthful push-subscription diagnostics.
// A Home Screen web app can show Lock Screen notifications, but not an ActivityKit Live Activity.
(() => {
  const $=id=>document.getElementById(id);
  const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent||'');
  const standalone=()=>window.matchMedia?.('(display-mode: standalone)')?.matches||
    window.navigator.standalone===true;
  const available=()=>('serviceWorker' in navigator)&&('PushManager' in window)&&('Notification' in window);
  const loggedIn=()=>typeof session!=='undefined'&&!!session?.user?.id;
  let lastFocus=null;
  let modal=null;
  const state=()=>({
    ios:isIOS(),installed:!!standalone(),supported:available(),
    permission:typeof Notification!=='undefined'?Notification.permission:'unsupported'
  });
  function indicator(good,text){return '<span class="ip-status '+(good?'ip-ok':'ip-pending')+'">'+
    (good?'✓ ':'· ')+text+'</span>';}
  function html(){
    return '<div class="ip-scrim" data-ip-close aria-hidden="true"></div>'+
      '<section class="ip-sheet" role="dialog" aria-modal="true" aria-labelledby="ipTitle">'+
      '<header class="ip-head"><div class="ip-kicker">PICK’EM ON IPHONE</div>'+
      '<h2 id="ipTitle">Your League, One Tap Away</h2>'+
      '<p>Install Pick’em from Safari, then enable Lock Screen alerts.</p>'+
      '<button type="button" class="ip-close" data-ip-close aria-label="Close iPhone setup">✕</button></header>'+
      '<div class="ip-body">'+
      '<div id="ipStatus" class="ip-status-grid" role="status">Checking this device…</div>'+
      '<section class="ip-step"><div class="ip-number">1</div><div><h3>Add Pick’em to your Home Screen</h3>'+
      '<p>Open this website in <b>Safari</b>. Tap the <b>Share</b> icon, choose <b>Add to Home Screen</b>, '+
      'leave <b>Open as Web App</b> enabled, then tap <b>Add</b>. Open Pick’em using the new icon.</p>'+
      '<p class="ip-small">On some Safari layouts, open the Page Menu first to reach Share.</p>'+
      '</div></section>'+
      '<section class="ip-step"><div class="ip-number">2</div><div><h3>Enable alerts</h3>'+
      '<p>From the installed Home Screen app, tap <b>Enable Notifications</b> to allow push alerts. '+
      'You can receive updates even when the website is closed.</p>'+
      '<button type="button" class="ip-cta" id="ipEnable" data-ip-enable>Enable Notifications</button>'+
      '<p class="ip-small">Notifications require permission and an active device subscription. '+
      'Enabling them does not prove the push service has delivered an alert.</p>'+
      '</div></section>'+
      '<section class="ip-step"><div class="ip-number">3</div><div><h3>Confirm delivery</h3>'+
      '<p>Tap <b>Check my device</b> below to confirm installation, permission, and subscription. '+
      'For a real delivery test, the commissioner can use the existing Notification Health screen.</p>'+
      '<button type="button" class="ip-cta ip-ghost" data-ip-check>Check My Device</button>'+
      '</div></section>'+
      '<p class="ip-note">Pick’em remains a website. These are standard iPhone web-app notifications, not a native Live Activity or a permanently updating Lock Screen scoreboard.</p>'+
      '</div></section>';
  }
  function create(){
    if(modal)return modal;
    modal=document.createElement('div');
    modal.id='iphoneSetupModal';
    modal.className='ip-overlay';
    modal.hidden=true;
    modal.innerHTML=html();
    document.body.append(modal);
    modal.addEventListener('click',event=>{
      const target=event.target?.closest?.('[data-ip-close],[data-ip-check],[data-ip-enable]');
      if(!target)return;
      if(target.matches('[data-ip-close]')){close();return;}
      if(target.matches('[data-ip-check]')){check();return;}
      if(target.matches('[data-ip-enable]')){enable();return;}
    });
    modal.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();close();return;}
      if(event.key==='Tab'){
        const controls=[...modal.querySelectorAll('button:not([disabled])')];
        if(!controls.length)return;
        const a=controls[0],b=controls.at(-1);
        if(event.shiftKey&&document.activeElement===a){event.preventDefault();b.focus();}
        else if(!event.shiftKey&&document.activeElement===b){event.preventDefault();a.focus();}
      }
    });
    return modal;
  }
  async function status(){
    const s=state(),out={...s,subscribed:false,subscriptionChecked:false};
    if(s.supported){
      try{
        const reg=await navigator.serviceWorker.getRegistration('./');
        if(reg?.pushManager?.getSubscription){
          out.subscribed=!!(await reg.pushManager.getSubscription());
          out.subscriptionChecked=true;
        }else out.subscriptionChecked=true;
      }catch(e){out.subscriptionChecked=false;}
    }
    return out;
  }
  function present(s){
    const area=$('ipStatus');if(!area)return;
    area.innerHTML=indicator(s.installed,'Home Screen app: '+(s.installed?'installed':'not detected'))+
      indicator(s.permission==='granted','Notification permission: '+(s.permission==='granted'?'allowed':
        s.permission==='denied'?'blocked':'not yet granted'))+
      indicator(s.subscribed,'Push subscription: '+(s.subscriptionChecked?
        s.subscribed?'saved on this device':'not active':'could not be checked'))+
      '<small>Device checks are local. A commissioner test message is needed to verify end-to-end delivery.</small>';
    const enable=$('ipEnable');
    if(enable){
      enable.disabled=!s.supported||(s.ios&&!s.installed)||s.permission==='denied';
      enable.textContent=s.permission==='granted'&&s.subscribed?'Alerts Enabled':
        s.permission==='denied'?'Change Permission in Settings':
        s.ios&&!s.installed?'Install to Enable Alerts':'Enable Notifications';
    }
  }
  async function check(){
    const out=$('ipStatus');if(out)out.textContent='Checking Home Screen and notification setup…';
    try{present(await status());}
    catch(e){if(out)out.textContent='Unable to inspect this device. Please verify notification settings manually.';}
  }
  async function enable(){
    if(!loggedIn())return;
    const s=state();
    if(s.ios&&!s.installed){check();return;}
    if(!s.supported||s.permission==='denied'){check();return;}
    // Called DIRECTLY from a user tap, preserving browser notification permission requirements.
    if(typeof window.enableLeagueNotifications==='function'){
      await window.enableLeagueNotifications();
      await check();
    }
  }
  function open(){
    if(!loggedIn())return;
    const node=create();
    if(!node.hidden)return;
    lastFocus=document.activeElement;
    node.hidden=false;document.body.classList.add('ip-open');
    node.querySelector('.ip-close')?.focus();
    check();
  }
  function close(){
    if(!modal||modal.hidden)return;
    modal.hidden=true;document.body.classList.remove('ip-open');
    if(lastFocus?.isConnected)lastFocus.focus();
    lastFocus=null;
  }
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&modal&&!modal.hidden)close();
  });
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden&&modal&&!modal.hidden)check();
  });
  window.IphoneExperience={open,close,check,status};
  // The existing Notifications home card owns the opt-in button. This module
  // adds setup/status without changing its server-side subscription workflow.
})();