// Commissioner-only operational health check. Shows counts/status only; never reveals pick answers.
(() => {
  const $ = id => document.getElementById(id);
  let busy = false, last = null;

  const expectedBonus = [10,8,7,5,4,3,2,0];
  const fmtTime = value => value ? new Date(value).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : 'Never';
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const rpc = body => db('rpc/commissioner_diagnostics', {method:'POST', body:JSON.stringify(body)});

  function injectStyle() {
    if ($('commissionerDiagnosticsStyle')) return;
    const style = document.createElement('style');
    style.id = 'commissionerDiagnosticsStyle';
    style.textContent = `
      .diag-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin:12px 0}
      .diag-item{border:1px solid var(--border,#334155);border-radius:12px;padding:12px;background:rgba(15,23,42,.28)}
      .diag-item b{display:block;margin-bottom:4px}
      .diag-state{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:800;border-radius:999px;padding:4px 8px;margin-bottom:7px}
      .diag-ok{background:rgba(34,197,94,.14);color:#86efac}
      .diag-warn{background:rgba(245,158,11,.14);color:#fcd34d}
      .diag-bad{background:rgba(239,68,68,.14);color:#fca5a5}
      .diag-neutral{background:rgba(148,163,184,.14);color:#cbd5e1}
      .diag-detail{font-size:12px;color:var(--muted,#94a3b8);line-height:1.45}
      .diag-summary{font-weight:800;margin:6px 0 0}
      .diag-list{margin:7px 0 0;padding-left:18px;font-size:12px;color:var(--muted,#94a3b8)}
      .diag-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
    `;
    document.head.appendChild(style);
  }

  function badge(kind, text) {
    return '<span class="diag-state diag-'+kind+'">'+esc(text)+'</span>';
  }
  function item(title, kind, state, detail, extra='') {
    return '<div class="diag-item">'+badge(kind,state)+'<b>'+esc(title)+'</b><div class="diag-detail">'+detail+'</div>'+extra+'</div>';
  }

  function evaluate(d) {
    const checks = [];
    const leagueOk = d.league.members === 8 && d.league.commissioners === 1 && d.league.active_weeks === 1;
    checks.push({title:'League & database',kind:leagueOk?'ok':'bad',state:leagueOk?'Healthy':'Needs attention',
      detail:esc(d.league.members+' members · '+d.league.commissioners+' commissioner · '+d.league.active_weeks+' active week')});

    const players = d.entries.players || [];
    const incomplete = players.filter(p => !p.complete);
    const entriesComplete = d.entries.submitted >= d.entries.required && incomplete.length === 0;
    const entryKind = entriesComplete ? 'ok' : d.week.locked ? 'bad' : 'warn';
    const entryState = entriesComplete ? 'Complete' : d.week.locked ? 'Incomplete after lock' : 'In progress';
    checks.push({title:'Submissions & picks',kind:entryKind,state:entryState,
      detail:esc(d.entries.submitted+' / '+d.entries.required+' required submitted · '+d.entries.pick_rows+' pick rows'),
      extra: incomplete.length ? '<ul class="diag-list">'+incomplete.map(p=>'<li>'+esc(p.display_name+': '+p.picks+'/'+p.expected_picks+' picks'+(p.submitted?'':' · not submitted'))+'</li>').join('')+'</ul>' : ''});

    const q=d.questions;
    const orderOk = q.decided === q.result_ordered && q.result_ordered === q.result_order_distinct &&
      (q.decided === 0 || (q.result_order_min === 1 && q.result_order_max === q.decided));
    checks.push({title:'Results & result order',kind:orderOk?'ok':'bad',state:orderOk?'Healthy':'Broken order',
      detail:esc(q.decided+' / '+q.scored+' scored results entered · '+q.result_ordered+' ordered')});

    const allResults = q.scored > 0 && q.decided === q.scored;
    let tbKind='neutral',tbState='Not needed yet';
    if (allResults && d.week.locked) { tbKind=d.week.tiebreaker_result_saved?'ok':'warn'; tbState=d.week.tiebreaker_result_saved?'Saved':'Still needed'; }
    checks.push({title:'Tiebreaker',kind:tbKind,state:tbState,
      detail:esc(d.week.tiebreaker_result_saved?'Actual tiebreaker is saved.':'Save the actual tiebreaker before final scoring.')});

    const scoresOk = d.week.status === 'published' ? d.scores.rows === d.scores.expected_when_published : d.scores.rows === 0;
    checks.push({title:'Score rows',kind:scoresOk?'ok':'bad',state:scoresOk?'Healthy':'Unexpected rows',
      detail:esc(d.week.status === 'published' ? d.scores.rows+' / '+d.scores.expected_when_published+' final score rows' : d.scores.rows+' final score rows before publish')});

    const sources=d.live_scores.sources||[];
    const liveBad=sources.some(s=>!s.cached || Number(s.failure_count)>0);
    const liveKind=liveBad?'warn':d.live_scores.connected_questions?'ok':'neutral';
    const liveState=liveBad?'Provider/cache issue':d.live_scores.connected_questions?'Healthy':'No games connected';
    const liveExtra=sources.length?'<ul class="diag-list">'+sources.map(s=>'<li>'+esc((s.league||'scoreboard')+': '+s.game_count+' games · '+(s.failure_count?'retrying after '+s.failure_count+' failure(s)':'cache OK')+' · checked '+fmtTime(s.fetched_at))+'</li>').join('')+'</ul>':'';
    checks.push({title:'Live scores',kind:liveKind,state:liveState,
      detail:esc(d.live_scores.connected_questions+' / '+d.live_scores.question_count+' questions connected · '+sources.length+' scoreboard source(s)'),extra:liveExtra});

    const n=d.notifications;
    const notifyKind=n.cron_active?'ok':'bad';
    const test=n.last_test;
    checks.push({title:'Notifications',kind:notifyKind,state:n.cron_active?'Automation running':'Cron stopped',
      detail:esc(n.subscription_users+' / '+d.league.members+' members enabled · '+n.subscriptions+' device subscription(s)'+(test?' · last test '+fmtTime(test.created_at):' · no test logged'))});

    const p=d.postseason;
    const bonusOk=same((p.starting_bonuses||[]).map(Number),expectedBonus);
    checks.push({title:'Postseason engine',kind:bonusOk?'ok':'bad',state:bonusOk?'Ready':'Bonus mismatch',
      detail:esc('Status: '+(p.status||'not configured')+' · bonuses '+(p.starting_bonuses||[]).join('/')+' · '+p.rounds_created+' round(s) created')});

    return checks;
  }

  function reportText(d, checks) {
    return [
      'PICK’EM COMMISSIONER HEALTH CHECK',
      d.week.name+' · '+d.week.phase+' · '+(d.week.locked?'LOCKED':'OPEN'),
      'Checked '+fmtTime(d.checked_at),
      '',
      ...checks.map(c => '['+c.state.toUpperCase()+'] '+c.title+' — '+c.detail.replace(/<[^>]+>/g,'')),
      '',
      'Postseason bonuses: '+(d.postseason.starting_bonuses||[]).join('/'),
    ].join('\n');
  }

  function render(d) {
    injectStyle();
    const checks=evaluate(d);
    const bad=checks.filter(c=>c.kind==='bad').length;
    const warn=checks.filter(c=>c.kind==='warn').length;
    const box=$('commissionerDiagnostics');
    if(!box) return;
    box.innerHTML =
      '<div class="eyebrow">COMMISSIONER HEALTH CHECK</div>'+
      '<h2>League diagnostics</h2>'+
      '<p class="muted">Checks the current week, database counts, result order, live-score cache, notifications, and postseason setup. It never displays anyone’s pick answers.</p>'+
      '<p class="diag-summary">'+(bad?bad+' problem'+(bad===1?'':'s')+' need attention':warn?warn+' warning'+(warn===1?'':'s')+' · core checks passed':'All core checks passed')+'</p>'+
      '<div class="diag-grid">'+checks.map(c=>item(c.title,c.kind,c.state,c.detail,c.extra||'')).join('')+'</div>'+
      '<div class="diag-actions"><button class="btn secondary" type="button" data-diag-refresh>Run health check</button><button class="btn secondary" type="button" data-diag-copy>Copy report</button></div>'+
      '<p class="diag-detail">Checked '+esc(fmtTime(d.checked_at))+' · '+esc(d.week.name)+' · '+(d.week.locked?'locked':'open')+'</p>';
    box.dataset.report=reportText(d,checks);
  }

  async function load(force=false) {
    if (busy || profile?.role !== 'commissioner' || !week?.id) return;
    busy=true;
    const button=$('commissionerDiagnostics')?.querySelector('[data-diag-refresh]');
    if(button){button.disabled=true;button.textContent='Checking…';}
    try {
      last=await rpc({p_week_id:week.id});
      render(last);
    } catch (error) {
      const box=$('commissionerDiagnostics');
      if(box) box.innerHTML='<div class="eyebrow">COMMISSIONER HEALTH CHECK</div><h2>Diagnostics unavailable</h2><p class="muted">'+esc(error?.message||'Could not run the health check.')+'</p><button class="btn secondary" type="button" data-diag-refresh>Try again</button>';
    } finally { busy=false; }
  }

  function mount() {
    if(profile?.role!=='commissioner' || !week || !$('commissionerBox')) return;
    $('commissionerDiagnostics')?.remove();
    const card=document.createElement('section');
    card.id='commissionerDiagnostics';
    card.className='card';
    card.innerHTML='<div class="eyebrow">COMMISSIONER HEALTH CHECK</div><h2>League diagnostics</h2><p class="muted">Running checks…</p>';
    $('commissionerBox').prepend(card);
    load(true);
  }

  document.addEventListener('click', async event => {
    const refresh=event.target.closest('[data-diag-refresh]');
    if(refresh){await load(true);return;}
    const copy=event.target.closest('[data-diag-copy]');
    if(copy){
      const text=$('commissionerDiagnostics')?.dataset.report||'';
      if(!text)return;
      try{await navigator.clipboard.writeText(text);copy.textContent='Copied';setTimeout(()=>copy.textContent='Copy report',1200);}
      catch{alert(text);}
    }
  });

  const before=window.renderCommissioner;
  window.renderCommissioner=async function(){
    const result=await before.apply(this,arguments);
    mount();
    return result;
  };

  window.CommissionerDiagnostics={run:()=>load(true)};
})();
