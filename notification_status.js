// Commissioner-only notification opt-in status page.
(() => {
  function installNotificationStatusUI(){
    const nav=document.querySelector('nav');
    if(nav && !document.querySelector('[data-page="notificationstatus"]')){
      nav.insertAdjacentHTML('beforeend','<button id="notificationStatusNav" class="navbtn hidden" data-page="notificationstatus" onclick="showPage(\'notificationstatus\',this);renderNotificationStatus()">Notis</button>');
    }
    const main=document.querySelector('main.wrap');
    if(main && !document.getElementById('notificationstatus')){
      main.insertAdjacentHTML('beforeend','<section id="notificationstatus" class="page hidden"><div class="hero"><div><div class="eyebrow">COMMISSIONER</div><h1>Notification Status</h1><div class="muted">See who is ready to receive league push notifications.</div></div><button class="btn secondary" onclick="renderNotificationStatus()">Refresh</button></div><div id="notificationStatusBox"></div></section>');
    }
  }

  window.renderNotificationStatus=async function(){
    installNotificationStatusUI();
    const box=document.getElementById('notificationStatusBox');
    if(!box) return;
    if(profile?.role!=='commissioner'){
      box.innerHTML='<div class="notice">Commissioner access only.</div>';
      return;
    }
    box.innerHTML='<div class="card muted">Checking notification setup…</div>';
    try{
      const [profiles,subs]=await Promise.all([
        db('profiles?select=id,display_name,username,role&order=display_name.asc'),
        db('push_subscriptions?select=user_id,updated_at')
      ]);
      const devices={};
      const last={};
      subs.forEach(s=>{
        devices[s.user_id]=(devices[s.user_id]||0)+1;
        const t=s.updated_at?new Date(s.updated_at):null;
        if(t && (!last[s.user_id] || t>last[s.user_id])) last[s.user_id]=t;
      });
      const people=[...profiles].sort((a,b)=>(a.display_name||a.username||'').localeCompare(b.display_name||b.username||''));
      const enabled=people.filter(p=>(devices[p.id]||0)>0).length;
      const missing=people.length-enabled;
      let h='<div class="grid three">'+
        '<div class="card"><div class="muted">Enabled</div><div class="big good">'+enabled+'/'+people.length+'</div></div>'+
        '<div class="card"><div class="muted">Need Setup</div><div class="big '+(missing?'bad':'good')+'">'+missing+'</div></div>'+
        '<div class="card"><div class="muted">Enabled Devices</div><div class="big">'+subs.length+'</div></div>'+
      '</div>';
      h+='<div class="card"><div class="eyebrow">LEAGUE STATUS</div><h2 style="margin:4px 0">Who has notifications on?</h2><div class="muted">Enabled means Pick\'em currently has at least one push subscription saved for that player.</div><div style="margin-top:12px">';
      people.forEach(p=>{
        const count=devices[p.id]||0;
        const on=count>0;
        const when=last[p.id];
        h+='<div class="row" style="padding:12px 0;border-bottom:1px solid var(--line);gap:12px;align-items:center">'+
          '<div style="min-width:0;flex:1"><div style="font-weight:950">'+esc(p.display_name||p.username||'Player')+(p.role==='commissioner'?' <span class="mini">(Commissioner)</span>':'')+'</div>'+
          (on?'<div class="mini">'+count+' device'+(count===1?'':'s')+(when?' · updated '+esc(when.toLocaleString()):'')+'</div>':'<div class="mini">Has not enabled push notifications yet.</div>')+'</div>'+
          (on?'<span class="pill good">✓ Enabled</span>':'<span class="pill wait">Needs setup</span>')+
        '</div>';
      });
      h+='</div></div>';
      box.innerHTML=h;
    }catch(e){
      console.error(e);
      box.innerHTML='<div class="notice">Could not load notification status.</div>';
    }
  };

  installNotificationStatusUI();
  const baseHome=window.renderHome;
  window.renderHome=function(){
    baseHome();
    installNotificationStatusUI();
    const btn=document.getElementById('notificationStatusNav');
    if(btn) btn.classList.toggle('hidden',profile?.role!=='commissioner');
  };
})();
