// Commissioner HQ — role-gated, read-only operational overview and exports.
(() => {
  const Model=window.CommissionerHQModel;
  if(!Model)return;
  const $=id=>document.getElementById(id);
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const commissioner=()=>typeof profile!=='undefined'&&profile?.role==='commissioner'
    &&typeof session!=='undefined'&&!!session?.user?.id;
  const currentWeek=()=>typeof week!=='undefined'?week:null;
  const name=p=>window.MemberNames?.full(p)||p?.display_name||'Member';
  const date=raw=>{
    if(!raw)return 'Unknown';
    const t=new Date(raw);return Number.isFinite(t.getTime())?
      t.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Unknown';
  };
  let last=null,loading=false,lastError=null,request=0;
  const displayLabel=state=>({
    published:'Published · verified',ready:'Ready for commissioner review',
    open:'Open · monitoring',not_locked:'Waiting for lock',
    attention:'Needs attention',unknown:'Unable to verify'
  }[state]||'Review required');
  function styleClass(status){
    return ['ready','published'].includes(status)?'cc-green':status==='attention'?'cc-red':'cc-amber';
  }
  function panel(model){
    const metrics=model.metrics||[];
    const checks=model.checks||[];
    const html='<div class="cc-overview">'+
      '<header class="cc-heading"><div><div class="cc-eyebrow">COMMISSIONER CONTROL CENTER</div>'+
      '<h2>League Operations</h2><p>One place to check the week, review changes, and preserve published results.</p></div>'+
      '<span class="cc-status '+styleClass(model.readiness)+'">'+escape(displayLabel(model.readiness))+'</span></header>'+
      '<div class="cc-metrics">'+metrics.map(m=>
        '<div class="cc-metric"><small>'+escape(m.label)+'</small><strong>'+escape(m.value)+'</strong></div>').join('')+
      '</div>'+
      (model.kind==='unavailable'?
        '<div class="cc-notice cc-amber">Commissioner diagnostics are unavailable. Readiness cannot be verified.</div>':
        '<section class="cc-checks"><div class="cc-section-head"><h3>Pre-publish checklist</h3>'+
        '<span>'+escape(model.weekName||'Current week')+'</span></div>'+
        '<div class="cc-check-grid">'+checks.map(check=>
          '<div class="cc-check"><span aria-hidden="true" class="cc-bubble '+(check.passed?'cc-green':'cc-amber')+'">'+
          (check.passed?'✓':'!')+'</span><div><strong>'+escape(check.label)+'</strong>'+
          '<small>'+escape(check.detail)+'</small></div></div>').join('')+'</div>'+
        (model.reasons?.length?'<div class="cc-notice '+(model.readiness==='attention'?'cc-red':'cc-amber')+'">'+
          model.reasons.map(reason=>'<div>'+escape(reason)+'</div>').join('')+'</div>':'')+
        (model.failed?.length?'<div class="cc-missing"><strong>Members needing attention</strong>'+
          '<div>'+model.failed.map(x=>'<span>'+escape(x.name)+': '+x.picks+'/'+x.expected+' picks'+
            (x.submitted?'':' · not submitted')+'</span>').join('')+'</div></div>':'')+
        '<p class="cc-footnote">This is a read-only review. It does not publish, edit, or unlock picks. The checklist cannot replace the final commissioner scoring review.</p>'+
        '</section>')+
      '<section class="cc-audit"><div class="cc-section-head"><h3>Recent Commissioner Actions</h3>'+
      '<span>Recorded audit entries only</span></div>'+
      (!model.auditAvailable?'<p class="cc-muted">The activity log could not be loaded. Audit status is unknown; no events have been invented.</p>':
       model.activity.length?'<ol class="cc-audit-list">'+model.activity.slice(0,12).map(e=>
         '<li><span class="cc-audit-dot" aria-hidden="true"></span><div><strong>'+escape(e.summary)+'</strong>'+
         '<small>'+escape(e.actionType.replace(/_/g,' '))+' · '+escape(date(e.createdAt))+'</small></div></li>').join('')+'</ol>':
         '<p class="cc-muted">No recorded commissioner changes were returned.</p>')+'</section>'+
      '<section class="cc-actions"><div><h3>Recovery &amp; Checks</h3>'+
      '<p>Export completed results as a JSON snapshot. This is <strong>not</strong> a full database restore backup; it excludes private submissions, login data, and device tokens.</p></div>'+
      '<div class="cc-buttons"><button type="button" class="cc-btn" data-cc-export>Download Published Results</button>'+
      '<button type="button" class="cc-btn cc-secondary" data-cc-refresh>Refresh Operations</button>'+
      '<button type="button" class="cc-btn cc-secondary" data-cc-diagnostics>Detailed Health Check</button>'+
      '<button type="button" class="cc-btn cc-secondary" data-cc-notifications>Notification Health</button></div>'+
      '<p id="ccExportStatus" class="cc-muted" role="status"></p></section>'+
      '<p class="cc-footnote">Only the signed-in commissioner can open this panel. Report generated '+escape(date(new Date().toISOString()))+'.</p>'+
      '</div>';
    return html;
  }
  function mount(){
    if(!commissioner())return null;
    const root=$('commissionerBox');
    if(!root)return null;
    let node=$('commissionerHQ');
    if(!node){
      node=document.createElement('section');
      node.id='commissionerHQ';node.className='card cc-host';
      root.appendChild(node);
    }
    return node;
  }
  async function load(force=false){
    const box=mount();
    if(!box||(loading&&!force))return;
    const w=currentWeek();
    const myRequest=++request;
    loading=true;
    if(!last||force)box.innerHTML='<div class="cc-loading">Reviewing league operations…</div>';
    try{
      const [diag,logResult]=await Promise.allSettled([
        w?.id?db('rpc/commissioner_diagnostics',{method:'POST',body:JSON.stringify({p_week_id:w.id})}):
          Promise.reject(new Error('No active week')),
        db('commissioner_activity_log?select=actor_id,week_id,action_type,summary,created_at&order=created_at.desc&limit=30')
      ]);
      if(!commissioner()||myRequest!==request||currentWeek()?.id!==w?.id)return;
      const activity=logResult.status==='fulfilled'&&Array.isArray(logResult.value)?logResult.value:[];
      const auditAvailable=logResult.status==='fulfilled'&&Array.isArray(logResult.value);
      const diagnostic=diag.status==='fulfilled'?diag.value:null;
      last=Model.analyze(diagnostic,activity,{auditAvailable});
      box.innerHTML=panel(last);
    }catch(e){
      if(myRequest!==request||!commissioner())return;
      lastError=e;console.warn('Commissioner control center unavailable',e);
      box.innerHTML='<p>Operations unavailable. Please check the detailed diagnostics and refresh.</p>'+
        '<button type="button" class="cc-btn" data-cc-refresh>Retry</button>';
    }finally{if(myRequest===request)loading=false;}
  }
  async function paged(path,pageSize=500,maxRows=5000){
    const rows=[];
    for(let offset=0;offset<maxRows;offset+=pageSize){
      const result=await db(path+(path.includes('?')?'&':'?')+'limit='+pageSize+'&offset='+offset);
      if(!Array.isArray(result))throw Error('Published history retrieval failed.');
      rows.push(...result);
      if(result.length<pageSize)return rows;
    }
    // Fail closed: a truncated export is not a usable history snapshot.
    throw Error('Published history is too large for this download; no partial backup was created.');
  }
  async function archive(){
    if(!commissioner())throw Error('Commissioner access required.');
    const week=currentWeek(),seasonId=week?.season_id||null;
    // Read-only, published cards only; no picks, subscriptions, or auth credentials.
    const [allWeeks,profiles]=await Promise.all([
      paged('weeks?status=eq.published&select=id,season_id,number,name,phase,status,published_at,lock_at,tiebreaker_result&order=number.asc'),
      db('profiles?select=id,display_name,username')
    ]);
    const published=allWeeks.filter(w=>!seasonId||w.season_id===seasonId);
    const weekIds=published.map(w=>w.id);
    let scores=[],questions=[];
    if(weekIds.length){
      const scope='week_id=in.('+weekIds.join(',')+')';
      [scores,questions]=await Promise.all([
        paged('week_scores?'+scope+'&select=week_id,user_id,placement,correct_count,question_count,total_points,placement_points,perfect_bonus,unicorn_bonus,upset_bonus,streak_bonus,cold_bonus'),
        paged('questions?'+scope+'&select=id,week_id,position,prompt,sport,counts_for_score,result,result_order')
      ]);
    }
    if(!Array.isArray(profiles))throw Error('Member names could not be verified.');
    const snapshot=Model.summarizeArchive({seasonId,weeks:published,scores,questions,
      profiles:profiles.map(p=>({id:p.id,display_name:name(p)}))});
    if(!Model.validateArchive(snapshot))throw Error('Archive verification failed.');
    // A published week should have a complete official scorecard. Do not pretend
    // a truncated or RLS-filtered result is a complete archive.
    const missing=published.filter(w=>scores.filter(s=>s.week_id===w.id).length!==8);
    if(missing.length)throw Error('Archive incomplete: '+missing.length+
      ' published week(s) do not have all eight official scores. No download was produced.');
    return snapshot;
  }
  async function download(){
    const status=$('ccExportStatus');
    if(status)status.textContent='Preparing published-results snapshot…';
    try{
      const data=await archive();
      if(!commissioner())throw Error('Commissioner session ended.');
      const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;a.download='pickem-published-results-'+new Date().toISOString().slice(0,10)+'.json';
      document.body.append(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),15000);
      if(status)status.textContent='Published-results snapshot prepared. Keep this file somewhere safe.';
    }catch(error){
      if(status)status.textContent=error?.message||'Archive download unavailable.';
    }
  }
  document.addEventListener('click',e=>{
    const button=e.target?.closest?.('[data-cc-export],[data-cc-refresh],[data-cc-diagnostics],[data-cc-notifications]');
    if(!button||!commissioner())return;
    if(button.matches('[data-cc-export]')){download();return;}
    if(button.matches('[data-cc-refresh]')){load(true);return;}
    if(button.matches('[data-cc-diagnostics]')){
      window.CommissionerDiagnostics?.run?.();
      $('commissionerDiagnostics')?.scrollIntoView?.({behavior:'smooth',block:'center'});
      return;
    }
    if(button.matches('[data-cc-notifications]')){
      const nav=document.querySelector('[data-page="notificationstatus"]');
      if(nav)window.showPage?.('notificationstatus',nav);
      if(typeof window.renderNotificationStatus==='function')window.renderNotificationStatus();
    }
  });
  const original=window.renderCommissioner;
  if(typeof original==='function')window.renderCommissioner=async function(){
    const result=await original.apply(this,arguments);
    if(commissioner())await load(true);
    return result;
  };
  window.CommissionerHQ={load,archive,analyze:Model.analyze};
})();
