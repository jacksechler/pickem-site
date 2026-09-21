// Long-lived, low-friction authentication for the Pick'em web app.
// Keeps Supabase sessions refreshed so players normally sign in only once per device.
(() => {
  const SESSION_KEY='pickemSession';
  const USERNAME_KEY='pickemLastUsername';
  const REFRESH_MARGIN_SECONDS=5*60;
  let refreshInFlight=null;

  function storedPersistently(){
    try{return !!localStorage.getItem(SESSION_KEY);}catch{return true;}
  }

  function rememberThisDevice(){
    const box=document.getElementById('rememberDevice');
    return box ? box.checked : true;
  }

  function saveSession(next,{persistent=storedPersistently()}={}){
    if(!next?.access_token || !next?.refresh_token) throw new Error('Invalid session response.');
    session=next;
    const value=JSON.stringify(next);
    if(persistent){
      localStorage.setItem(SESSION_KEY,value);
      sessionStorage.removeItem(SESSION_KEY);
    }else{
      sessionStorage.setItem(SESSION_KEY,value);
      localStorage.removeItem(SESSION_KEY);
    }
    return next;
  }

  function clearSession(){
    try{localStorage.removeItem(SESSION_KEY);}catch{}
    try{sessionStorage.removeItem(SESSION_KEY);}catch{}
    session=null;
  }

  function jwtExpiry(accessToken){
    try{
      const payload=String(accessToken||'').split('.')[1];
      if(!payload) return 0;
      const normalized=payload.replace(/-/g,'+').replace(/_/g,'/');
      const padded=normalized+'='.repeat((4-normalized.length%4)%4);
      return Number(JSON.parse(atob(padded)).exp||0);
    }catch{return 0;}
  }

  function sessionExpiry(current=session){
    const explicit=Number(current?.expires_at||0);
    return explicit || jwtExpiry(current?.access_token);
  }

  function needsRefresh(current=session,marginSeconds=REFRESH_MARGIN_SECONDS){
    if(!current?.access_token || !current?.refresh_token) return true;
    const expiry=sessionExpiry(current);
    if(!expiry) return false; // Unknown expiry: let a 401 trigger one safe refresh attempt.
    return expiry-Math.floor(Date.now()/1000)<=marginSeconds;
  }

  async function refreshSession(force=false){
    if(!session?.refresh_token) throw new Error('No saved session.');
    if(!force && !needsRefresh(session)) return session;
    if(refreshInFlight) return refreshInFlight;

    const persistent=storedPersistently();
    const refreshToken=session.refresh_token;
    refreshInFlight=(async()=>{
      const response=await fetch(SUPABASE+'/auth/v1/token?grant_type=refresh_token',{
        method:'POST',
        headers:{apikey:KEY,'Content-Type':'application/json'},
        body:JSON.stringify({refresh_token:refreshToken})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error_description||data.msg||data.error||'Could not refresh session.');
      return saveSession(data,{persistent});
    })();

    try{return await refreshInFlight;}
    finally{refreshInFlight=null;}
  }

  function authHeaders(extra={}){
    return {
      apikey:KEY,
      Authorization:'Bearer '+(session?.access_token||''),
      'Content-Type':'application/json',
      ...extra
    };
  }

  async function requestDatabase(path,opt={},retried=false){
    if(!session) throw new Error('Not signed in.');
    try{await refreshSession(false);}catch(error){
      clearSession();
      throw error;
    }

    const response=await fetch(SUPABASE+'/rest/v1/'+path,{
      ...opt,
      headers:authHeaders(opt.headers||{})
    });

    if(response.status===401 && !retried){
      try{
        await refreshSession(true);
        return requestDatabase(path,opt,true);
      }catch(error){
        clearSession();
        throw new Error('Your saved login expired. Please sign in again.');
      }
    }

    if(response.status===401){
      clearSession();
      throw new Error('Your saved login expired. Please sign in again.');
    }
    if(!response.ok) throw new Error(await response.text());
    const text=await response.text();
    return text?JSON.parse(text):null;
  }

  window.headers=authHeaders;
  window.db=(path,opt={})=>requestDatabase(path,opt,false);

  window.loginAccount=async function(){
    const msg=el('authMsg');
    msg.textContent='Signing in…';
    const raw=(el('loginUser')?.value||'').trim();
    const username=normalizeUsername(raw);
    const password=el('loginPass')?.value||'';
    if(username.length<2){msg.textContent='Enter your name or username.';return;}
    if(!password){msg.textContent='Enter your password.';return;}

    try{
      const response=await fetch(SUPABASE+'/auth/v1/token?grant_type=password',{
        method:'POST',
        headers:{apikey:KEY,'Content-Type':'application/json'},
        body:JSON.stringify({email:username+'@pickem.test',password})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error_description||data.msg||data.error||'Login failed');

      const persistent=rememberThisDevice();
      saveSession(data,{persistent});
      if(persistent) localStorage.setItem(USERNAME_KEY,raw||username);
      else localStorage.removeItem(USERNAME_KEY);
      msg.textContent=persistent?'Signed in. This device will remember you.':'Signed in.';
      await boot();
    }catch(error){
      msg.textContent=error.message||'Login failed';
    }
  };

  window.logoutAccount=async function(){
    const token=session?.access_token;
    clearSession();
    try{
      if(token){
        await fetch(SUPABASE+'/auth/v1/logout',{
          method:'POST',
          headers:{apikey:KEY,Authorization:'Bearer '+token}
        });
      }
    }catch{}
    location.reload();
  };

  function prepareLogin(){
    const user=el('loginUser');
    const pass=el('loginPass');
    const remembered=localStorage.getItem(USERNAME_KEY)||'';
    if(user && !user.value && remembered) user.value=remembered;

    // A real form lets iOS/Android password managers recognize the login,
    // so saved credentials can be filled using Face ID, Touch ID, or device biometrics.
    const form=el('loginForm');
    if(form && !form.dataset.bound){
      form.dataset.bound='1';
      form.addEventListener('submit',event=>{
        event.preventDefault();
        loginAccount();
      });
    }

    if(pass) pass.addEventListener('keydown',event=>{
      if(event.key==='Enter' && !form){
        event.preventDefault();
        loginAccount();
      }
    });
  }

  async function start(){
    prepareLogin();
    if(!session) return;
    const msg=el('authMsg');
    if(msg) msg.textContent='Welcome back — signing you in…';
    try{
      await refreshSession(false);
      await boot();
    }catch(error){
      clearSession();
      if(msg) msg.textContent='Your saved login expired. Sign in once and this device can remember you again.';
    }
  }

  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden && session){
      refreshSession(false).catch(()=>{});
    }
  });

  window.PickemAuth={
    refreshSession,
    needsRefresh,
    sessionExpiry,
    clearSession
  };

  start();
})();
