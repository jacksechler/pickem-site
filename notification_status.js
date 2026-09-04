// Commissioner-only notification health + test page.
(() => {
  const PUSH_FN=SUPABASE+'/functions/v1/push-notifications';
  const DAY=24*60*60*1000;

  function installNotificationStatusUI(){
    const nav=document.querySelector('nav');
    if(nav && !document.querySelector('[data-page="notificationstatus"]')){
      nav.insertAdjacentHTML('beforeend','<button id="notificationStatusNav" class="navbtn hidden" data-page="notificationstatus" onclick="showPage(\'notificationstatus\',this);renderNotificationStatus()">Notis</button>');
    }
    const main=document.querySelector('main.wrap');
    if(main && !document.getElementById('notificationstatus')){
      main.insertAdjacentHTML('beforeend','<section id="notificationstatus" class="page hidden"><div class="hero"><div><div class="eyebrow">COMMISSIONER</div><h1>Notification Health</h1><div class="muted">See who is enabled, who needs a retest, and whether a test push actually reaches each player.</div></div><button class="btn secondary" onclick="renderNotificationStatus()">Refresh</button></div><div id="notificationStatusBox"></div></section>');
    }
  }

  function testDetails(row){
    const d=row?.details;
    return d && typeof d==='object' ? d : {};
  }

  function healthFor(person,deviceRows,lastTest){
    if(!deviceRows.length) return {key:'off',label:'Not enabled',cls:'wait',detail:'No saved push subscription.'};
    const latestUpdated=deviceRows.reduce((m,s)=>Math.max(m,s.updated_at?new Date(s.updated_at).getTime():0),0);
    const age=Date.now()-latestUpdated;
    const td=testDetails(lastTest);
    const testAge=lastTest?.created_at ? Date.now()-new Date(lastTest.created_at).getTime() : Infinity;
    if(lastTest && Number(td.sent||0)>0 && testAge<30*DAY){
      const failed=Number(td.failed||0);
      return {key:failed?'partial':'working',label:failed?'Working · check device':'✓ Working',cls:failed?'wait':'good',detail:'Last successful test '+new Date(lastTest.created_at).toLocaleString()+(failed?' · '+failed+' device failed':'')};
    }
    if(lastTest && Number(td.sent||0)===0 && (Number(td.failed||0)>0 || Number(td.removed_stale||0)>0)){
      return {key:'problem',label:'Needs attention',cls:'bad',detail:'Last test failed'+(Number(td.removed_stale||0)?' · dead subscription removed':'')+' · '+new Date(lastTest.created_at).toLocaleString()};
    }
    if(age>30*DAY){
      return {key:'stale',label:'Stale · retest',cls:'wait',detail:'Subscription has not been refreshed in '+Math.floor(age/DAY)+' days.'};
    }
    return {key:'untested',label:'Enabled · untested',cls:'wait',detail:'Subscription is saved, but no recent successful test is recorded.'};
  }

  async function recordNotificationTest(userId,name,result){
    try{
      if(window.logCommissionerActivity){
        await window.logCommissionerActivity('notification_test','Notification test for '+name,{target_user_id:userId,sent:Number(result.sent||0),failed:Number(result.failed||0),removed_stale:Number(result.removed_stale||0)},null);
      }else{
        await db('commissioner_activity_log',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({actor_id:session.user.id,action_type:'notification_test',summary:'Notification test for '+name,details:{target_user_id:userId,sent:Number(result.sent||0),failed:Number(result.failed||0),removed_stale:Number(result.removed_stale||0)}})});
      }
    }catch(e){ console.debug('Could not record notification test',e); }
  }

  window.testPlayerNotification=async function(userId,name){
    const out=document.getElementById('notificationTest_'+userId);
    if(out) out.textContent='Sending test…';
    try{
      const r=await fetch(PUSH_FN,{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({title:"🔔 Pick'em test",body:'Notifications are working on this device.',target_user_id:userId,page:'home'})});
      const d=await r.json();
      if(!r.ok) throw new Error(d.error||'Test failed');
      await recordNotificationTest(userId,name,d);
      if(out){
        if(Number(d.sent||0)>0) out.innerHTML='<span class="good"><b>✓ Test delivered to '+d.sent+' device'+(d.sent===1?'':'s')+'.</b></span>'+(d.failed?' '+d.failed+' failed.':'');
        else out.innerHTML='<span class="bad"><b>No device received the test.</b></span>'+(d.removed_stale?' A dead subscription was removed.':'');
      }
      setTimeout(()=>renderNotificationStatus(),900);
    }catch(e){
      console.error(e);
      if(out) out.textContent=e.message||'Could not send test.';
    }
  };

  window.renderNotificationStatus=async function(){
    installNotificationStatusUI();
    const box=document.getElementById('notificationStatusBox');
    if(!box) return;
    if(profile?.role!=='commissioner'){
      box.innerHTML='<div class="notice">Commissioner access only.</div>';
      return;
    }
    box.innerHTML='<div class="card muted">Checking notification health…</div>';
    try{
      const [profiles,subs,tests]=await Promise.all([
        db('profiles?select=id,display_name,username,role&order=display_name.asc'),
        db('push_subscriptions?select=id,user_id,updated_at'),
        db('commissioner_activity_log?action_type=eq.notification_test&select=created_at,details&order=created_at.desc&limit=100')
      ]);
      const byUser={};
      subs.forEach(s=>(byUser[s.user_id]??=[]).push(s));
      const latestTest={};
      tests.forEach(t=>{
        const uid=testDetails(t).target_user_id;
        if(uid && !latestTest[uid]) latestTest[uid]=t;
      });
      const people=[...profiles].sort((a,b)=>(a.display_name||a.username||'').localeCompare(b.display_name||b.username||''));
      const health=people.map(p=>({p,h:healthFor(p,byUser[p.id]||[],latestTest[p.id])}));
      const working=health.filter(x=>x.h.key==='working'||x.h.key==='partial').length;
      const missing=health.filter(x=>x.h.key==='off').length;
      const attention=health.filter(x=>['problem','stale','untested'].includes(x.h.key)).length;
      let h='<div class="grid three">'+
        '<div class="card"><div class="muted">Working</div><div class="big good">'+working+'/'+people.length+'</div></div>'+
        '<div class="card"><div class="muted">Not Enabled</div><div class="big '+(missing?'bad':'good')+'">'+missing+'</div></div>'+
        '<div class="card"><div class="muted">Retest / Attention</div><div class="big '+(attention?'':'good')+'">'+attention+'</div></div>'+
      '</div>';
      h+='<div class="card"><div class="eyebrow">LEAGUE STATUS</div><h2 style="margin:4px 0">Notification Health</h2><div class="muted">“Working” means a commissioner test push was successfully delivered in the last 30 days. Dead push subscriptions are removed automatically when the push service reports them as gone.</div><div style="margin-top:12px">';
      health.forEach(({p,h:st})=>{
        const rows=byUser[p.id]||[];
        const count=rows.length;
        h+='<div style="padding:12px 0;border-bottom:1px solid var(--line)"><div class="row" style="gap:12px;align-items:center;flex-wrap:wrap">'+
          '<div style="min-width:0;flex:1"><div style="font-weight:950">'+esc(p.display_name||p.username||'Player')+(p.role==='commissioner'?' <span class="mini">(Commissioner)</span>':'')+'</div><div class="mini">'+esc(st.detail)+(count?' · '+count+' saved device'+(count===1?'':'s'):'')+'</div></div>'+
          '<span class="pill '+st.cls+'">'+esc(st.label)+'</span>'+
          (count?'<button class="btn secondary" style="padding:8px 10px" onclick="testPlayerNotification(\''+p.id+'\',\''+esc((p.display_name||p.username||'Player').replace(/'/g,"\\'"))+'\')">Send Test</button>':'')+
        '</div><div id="notificationTest_'+p.id+'" class="mini" style="margin-top:6px"></div></div>';
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
