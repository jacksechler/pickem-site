// Scheduled multi-sport season and a separate cumulative postseason competition.
(() => {
  const $=id=>document.getElementById(id), cache=new Map();
  let latest=null, preview=null, correction=null, rendering=null;
  const fmt=v=>Number(v||0).toFixed(1).replace(/\.0$/,'');
  const label={active:'Active',eliminated:'Eliminated',champion:'Champion',runner_up:'Runner-up',projected_advance:'Projected to advance',projected_out:'Projected out',tiebreaker_pending:'Tiebreaker pending'};
  const date=v=>v?new Date(v+'T12:00:00Z').toLocaleDateString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric'}):'—';
  const stamp=v=>v?new Date(v).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}):'Review lock';
  const attr=v=>esc(v);
  const button=(text,action,extra='',secondary=true)=>'<button type="button" class="btn'+(secondary?' secondary':'')+'" data-ps-action="'+action+'" '+extra+'>'+text+'</button>';
  const rpc=(name,body)=>db('rpc/'+name,{method:'POST',body:JSON.stringify(body)});
  const currentSeason=()=>week?.season_id || latest?.settings.season_id;
  const live=()=>latest?.settings.status==='live'||latest?.settings.status==='complete';
  const member=(data,id=session?.user?.id)=>data?.entries.find(e=>e.user_id===id);
  const roundRow=(data,id=session?.user?.id)=>data?.current?.rows.find(r=>r.user_id===id);
  const status=(entry,data)=>{
    if(!entry)return 'No playoff entry';
    return (label[entry.status]||entry.status)+(entry.eliminated_round?' · '+(data.rounds.find(r=>r.round_number===entry.eliminated_round)?.label||'Round '+entry.eliminated_round):'');
  };

  async function load(sid=currentSeason(),wid=null,force=false) {
    if(!sid||!session)return null;
    const key=session.user.id+':'+sid+':'+(wid||'current'),hit=cache.get(key);
    if(!force&&hit&&Date.now()-hit.at<5000)return hit.value;
    const value=await rpc('postseason_state',{p_season_id:sid,p_week_id:wid});
    cache.set(key,{value,at:Date.now()});
    if(!wid&&value){latest=value;syncNavigation();}
    return value;
  }
  async function act(action,payload={}) {
    const result=await rpc('postseason_action',{p_action:action,p_payload:{season_id:currentSeason(),...payload}});
    if(!action.startsWith('preview'))cache.clear();
    return result;
  }

  function syncNavigation() {
    $('playoffsNav')?.classList.remove('hidden');
    $('copyPlayoffStandings')?.classList.toggle('hidden',!live());
  }
  function badge(data,id) {
    const e=member(data,id);if(!e)return '';
    const historical=data.current?.round.status==='finalized'?data.current.rows.find(r=>r.user_id===id):null;
    return '<span class="ps-badge">Seed #'+e.seed+' · '+esc(historical?(historical.status_after==='active'?'Advanced':label[historical.status_after]):status(e,data))+'</span>';
  }
  function funnel(data) {
    const current=(data.current?.round.round_number||1)+(data.current?.round.status==='finalized'?1:0);
    return '<ol class="ps-funnel" aria-label="Postseason progression">'+[[8,'Playoff Week 1'],[6,'Quarterfinals'],[4,'Semifinals'],[2,'Championship'],[1,'Champion']].map(([n,title],i)=>'<li class="'+(data.settings.status==='complete'?i===4?'ps-stage-current':'ps-stage-done':i===current-1?'ps-stage-current':i<current-1?'ps-stage-done':'')+'"><b>'+n+'</b><span>'+title+'</span></li>').join('')+'</ol>';
  }
  function raceTable(data,current=data.current) {
    if(!current)return '<div class="card muted">The next round is being prepared.</div>';
    const official=current.round.status==='finalized',cut=current.round.participants_after;
    let html='<section class="card ps-race"><div class="ps-heading"><div><div class="eyebrow">'+(official?'FINAL ROUND':'PLAYOFF RACE')+'</div><h2>'+esc(current.round.label)+'</h2></div><span class="ps-badge">'+current.round.participants_before+' → '+cut+'</span></div>';
    html+=(current.finalize_not_before?'<p class="ps-note">One extended semifinal card through '+date(current.ends_on)+'. The final cut opens '+stamp(current.finalize_not_before)+', after all scored results are entered.</p>':'');
    html+='<div class="tablewrap"><table class="table ps-table"><caption class="ps-sr">Cumulative playoff standings. Frozen regular-season points plus correct playoff picks.</caption><thead><tr><th>Place / seed</th><th>Member</th><th>Reg. pts</th><th>This round</th><th>Playoff pts</th><th>Total</th><th>Status</th></tr></thead><tbody>';
    current.rows.forEach((r,i)=>{
      if(i===cut)html+='<tr class="ps-cut"><td colspan="7">'+(official?'ADVANCEMENT CUT':'PROJECTED CUT LINE')+' · TOP '+cut+' '+(cut===1?'WINS':'ADVANCE')+'</td></tr>';
      const e=member(data,r.user_id),points=Number(r.cumulative_after)-Number(e?.regular_season_points||0);
      const text=official?(r.advanced?(r.status_after==='champion'?'Champion':'Advanced'):label[r.status_after]):!current.locked?'Awaiting lock':label[r.projected_status];
      const tb=current.locked?'<small>TB: '+(r.round_tiebreaker_answer==null?'No entry':fmt(r.round_tiebreaker_answer))+(r.round_tiebreaker_distance==null?'':' · '+fmt(r.round_tiebreaker_distance)+' away')+'</small>':'';
      html+='<tr class="'+(r.user_id===session?.user?.id?'ps-my-row':'')+'"><td><b>'+(r.tied?'T':'#')+r.round_rank+'</b><small>Seed #'+r.seed+'</small></td><th scope="row">'+esc(r.display_name)+(r.user_id===session?.user?.id?' <span class="ps-you">You</span>':'')+'</th><td>'+fmt(e?.regular_season_points)+'</td><td>+'+r.round_correct+'</td><td>+'+fmt(points)+'</td><td><strong>'+fmt(r.cumulative_after)+'</strong></td><td><span class="ps-state '+(text==='Projected out'||text==='Eliminated'?'bad':'')+'">'+esc(text)+'</span>'+tb+'</td></tr>';
    });
    html+='</tbody></table></div><p class="ps-note">'+(official?'Saved official round results.':current.tiebreaker_pending?'Tiebreaker pending. Equal totals stay tied until the actual result is entered.':'Ties use this round’s tiebreaker distance, then the frozen regular-season seed.')+(!current.tiebreaker_pending?' Actual tiebreaker: '+fmt(current.week.tiebreaker_result)+'.':'')+' Every correct scored pick adds 1. No placement points or bonuses.</p></section>';
    return html;
  }
  function personal(data,id=session?.user?.id) {
    const e=member(data,id);if(!e)return '';
    const r=roundRow(data,id),total=r&&e.status==='active'?r.cumulative_after:e.current_total;
    let margin='';
    if(e.status==='active'&&r&&data.current?.round.status!=='finalized') {
      const c=data.current,above=c.rows[c.round.participants_after-1],below=c.rows[c.round.participants_after];
      if(!c.locked)margin='Your picks stay private until this card locks';
      else if(r.cut_tie)margin='Tied across the cut line · tiebreaker pending';
      else if(r.sort_index<=c.round.participants_after&&below)margin=fmt(Number(r.cumulative_after)-Number(below.cumulative_after))+' points above the cut line';
      else if(above)margin=fmt(Number(above.cumulative_after)-Number(r.cumulative_after))+' points below the cut line';
    }
    return '<section class="card ps-personal"><div><div class="eyebrow">'+(id===session?.user?.id?'YOUR POSTSEASON':'POSTSEASON')+'</div><h2>'+esc(e.display_name)+'</h2><p>'+esc(status(e,data))+'</p><p class="ps-note">'+esc(margin||'Starting seed #'+e.seed+' · '+fmt(e.regular_season_points)+' frozen regular-season points')+'</p></div><div class="ps-total">'+fmt(total)+'<span>championship points</span></div></section>';
  }
  function eliminated(data) {
    const shown=new Set(data.current?.rows.map(r=>r.user_id)||[]);
    const rows=data.entries.filter(e=>!shown.has(e.user_id)&&e.status!=='active');
    return rows.length?'<details class="card ps-disclosure"><summary>Earlier eliminations <span>'+rows.length+'</span></summary>'+rows.map(e=>'<div class="ps-history-row"><div><b>'+esc(e.display_name)+'</b><small>'+esc(status(e,data))+'</small></div><b>'+fmt(e.current_total)+'</b></div>').join('')+'</details>':'';
  }
  function history(data) {
    return '<section class="ps-history"><h2>Round history</h2>'+data.rounds.filter(r=>r.status==='finalized').map(r=>{
      const rows=data.history.filter(h=>h.round_id===r.id);
      return '<details class="card ps-disclosure"><summary>'+esc(r.label)+'<span>'+r.participants_before+' → '+r.participants_after+'</span></summary>'+rows.map(h=>'<div class="ps-history-row"><div><b>#'+h.round_rank+' '+esc(h.display_name)+'</b><small>'+esc(label[h.status_after])+' · '+h.round_correct+' correct this round</small></div><b>'+fmt(h.cumulative_after)+'</b></div>').join('')+'<div class="ps-actions">'+button('View picks','history','data-week="'+r.week_id+'"')+(profile?.role==='commissioner'?button('Correct results','edit-correction','data-week="'+r.week_id+'"'):'')+'</div></details>';
    }).join('')+'</section>';
  }
  function champion(data) {
    const winner=data.entries.find(e=>e.status==='champion'),runner=data.entries.find(e=>e.status==='runner_up');
    if(!winner)return '';
    return '<section class="card ps-champion"><div class="eyebrow">🏆 2026 PICK’EM CHAMPION</div><h2>'+esc(winner.display_name)+'</h2><div class="ps-champion-total">'+fmt(winner.current_total)+' <span>points</span></div><p>Seed #'+winner.seed+' · '+fmt(winner.regular_season_points)+' regular season + '+winner.playoff_points+' playoff correct</p>'+(runner?'<p class="muted">Runner-up: '+esc(runner.display_name)+' · '+fmt(runner.current_total)+'</p>':'')+'</section>';
  }
  function formatAndSchedule(data) {
    const rounds=data.calendar.filter(c=>c.phase==='playoff').sort((a,b)=>a.round_number-b.round_number);
    const field=[[8,6],[6,4],[4,2],[2,1]];
    return '<section class="card ps-format"><div class="eyebrow">HOW IT WORKS</div><h2>Eight members. Four rounds. One champion.</h2><p>Your regular-season points become your starting playoff total. Keep adding points and stay above the cut.</p><div class="ps-format-grid">'+
      '<div><b>Bring your season points</b><p>Your final regular-season points and seeds are saved when playoffs start. Your total carries from round to round.</p></div>'+
      '<div><b>Every correct pick adds 1</b><p>Every scored sport counts equally. Playoff rounds award no placement points or bonuses.</p></div>'+
      '<div><b>Survive the cumulative cut</b><p>The top 6 advance, then 4, then 2. The finalist with the highest championship total wins.</p></div></div>'+
      '<details class="ps-rules"><summary>Ties, deadlines, and picking after elimination</summary><ul><li>Equal totals use this round’s tiebreaker distance, then the higher saved regular-season seed. Live ties stay tied while the actual result is pending.</li><li>A missing submission earns zero. A missing tiebreaker ranks behind a supplied answer.</li><li>Every card has one lock. It can lock early when all active contenders submit: 8, 6, 4, or 2 members.</li><li>Eliminated members can keep picking for fun until lock. Their championship total stays frozen, and their submissions do not trigger early lock.</li><li>The semifinal card spans both weeks. Submit all picks by its initial Thursday lock; the final cut happens after the extended round.</li></ul></details></section>'+
      '<section class="card ps-schedule"><div class="ps-heading"><div><div class="eyebrow">2027 PLAYOFF SCHEDULE</div><h2>Every round, at a glance</h2></div>'+button('Full season calendar','calendar')+'</div><p class="ps-note">All dates and lock times are Eastern. Proposed locks are confirmed when the commissioner selects each card’s games.</p><div class="tablewrap"><table class="table ps-table"><thead><tr><th>Round</th><th>Games / setup</th><th>Field</th><th>Card lock</th></tr></thead><tbody>'+rounds.map(c=>'<tr><th scope="row">'+esc(c.label)+(c.round_number===3?'<small class="ps-extended-label">Extended round</small>':'')+'</th><td><b>'+date(c.starts_on)+'–'+date(c.ends_on)+'</b><small>'+esc(c.sports.join(' · '))+'</small><small>Setup: Tue, '+date(c.setup_date)+'</small></td><td>'+field[c.round_number-1].join(' → ')+'</td><td>'+stamp(c.suggested_lock_at)+'<small>'+(c.lock_confirmed?'Confirmed':'Proposed')+'</small></td></tr>').join('')+'</tbody></table></div><p class="ps-note">Semifinals include January 28–February 8 with one entry and one final cut. The next week is Championship, ending on Super Bowl Sunday. There is no off week.</p><p class="ps-note">CFB and CFP games fit the earlier rounds; the CFP title game is January 25. The later schedule combines CBB and NFL, with CFB still selectable when a real game fits. <a href="https://collegefootballplayoff.com/news/2026/6/1/26-27-broadcast-sked" target="_blank" rel="noopener noreferrer">CFP dates</a></p></section>';
  }
  function renderPage() {
    if(rendering)return rendering;
    if(!session)return Promise.resolve();
    rendering=(async()=>{
    try {
      const data=await load(currentSeason(),null,true);if(!data)return;
      const box=$('playoffBox'), fingerprint=JSON.stringify([data.settings,data.calendar,data.entries,data.current,data.history]);
      if(box.dataset.fingerprint!==fingerprint) {
        const open=new Set([...box.querySelectorAll('details[open]')].map(d=>d.querySelector('summary')?.textContent));
        box.innerHTML=data.settings.status==='scheduled'?'<div class="notice ps-upcoming"><b>Playoffs start in January</b><p>Explore the format and schedule now. Regular-season scoring is active until the commissioner starts Playoff Week 1.</p></div>'+funnel(data)+formatAndSchedule(data):champion(data)+funnel(data)+personal(data)+raceTable(data)+eliminated(data)+history(data)+'<details class="card ps-disclosure"><summary>Playoff format & schedule</summary>'+formatAndSchedule(data)+'</details>';
        box.querySelectorAll('details').forEach(d=>{d.open=open.has(d.querySelector('summary')?.textContent);});
        box.dataset.fingerprint=fingerprint;
      }
      $('playoffSync').textContent='Checked '+new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+' · Refreshes every 20 seconds';
    } catch { $('playoffSync').textContent='Couldn’t refresh. Showing the last loaded standings; retrying automatically.'; }
    finally {rendering=null;}
    })();
    return rendering;
  }
  function calendarHtml(data,existing) {
    const map=new Map(existing.map(w=>[w.number,w]));
    return '<div class="card ps-calendar-intro"><h2>Tuesday setup. Thursday lock. Monday finish.</h2><p>NFL and regular-season CFB share each card. College basketball joins in November; bowls and the CFP follow in December and January.</p><p class="ps-note">All dates use Eastern Time. Locks marked “Review” are proposed until you confirm the selected games. Playoffs remain inactive until you start them in January. Semifinals run January 28–February 8 as one extended card. Championship runs February 11–14 and finishes Sunday. There is no off week.</p></div>'+data.calendar.map(c=>{
      const w=map.get(c.week_number),special=c.phase!=='regular'||[3,14,19,20].includes(c.week_number);
      return '<details class="card ps-calendar-row '+(special?'ps-calendar-special':'')+'"><summary><span><b>'+esc(c.label)+'</b><small>'+date(c.starts_on)+'–'+date(c.ends_on)+' · '+esc(c.sports.join(' / ')||'No championship scoring')+'</small></span><span class="ps-badge">'+(w?w.status==='published'?'Final':w.is_active?'Current':'Created':c.phase==='break'?'Off week':c.lock_confirmed?'Ready':'Review')+'</span></summary><div class="ps-calendar-body"><dl><div><dt>Make the card</dt><dd>Tue, '+date(c.setup_date)+'</dd></div><div><dt>'+(w?'Saved lock':'Proposed lock')+'</dt><dd>'+stamp(w?.lock_at||c.suggested_lock_at)+'</dd></div><div><dt>Card finishes</dt><dd>'+date(c.ends_on)+(c.round_number===4?' · Sunday':' · after Monday games')+'</dd></div></dl><p>'+esc(c.notes)+'</p>'+(c.source_url?'<a href="'+attr(c.source_url)+'" target="_blank" rel="noopener noreferrer">Schedule source</a>':'')+
        (profile?.role==='commissioner'&&!w&&c.phase!=='break'?'<form class="ps-calendar-form" data-ps-calendar="'+c.slot+'"><label for="psLock'+c.slot+'">Confirm card lock (your device’s local time)</label><input id="psLock'+c.slot+'" name="lock" type="datetime-local" required value="'+attr(c.suggested_lock_at?toLocalInputValue(c.suggested_lock_at):'')+'"><button class="btn secondary" type="submit">Save confirmed lock</button></form>':'')+'</div></details>';
    }).join('');
  }
  async function renderCalendar() {
    $('seasonCalendarBox').innerHTML='<div class="card muted">Loading the season calendar…</div>';
    try {
      const [data,existing]=await Promise.all([load(currentSeason(),null,true),db('weeks?season_id=eq.'+currentSeason()+'&select=id,number,status,is_active,lock_at')]);
      if(data)$('seasonCalendarBox').innerHTML=calendarHtml(data,existing);
    } catch {$('seasonCalendarBox').innerHTML='<div class="notice">Couldn’t load the season calendar. Reopen it to retry.</div>';}
  }
  async function renderCommissioner() {
    if(profile?.role!=='commissioner'||!week)return;
    const data=await load(week.season_id,null,true);if(!data)return;
    $('postseasonSetup')?.remove();$('postseasonFinish')?.remove();
    const box=$('commissionerBox'),scheduled=data.settings.status==='scheduled';
    if(week.phase==='playoff') {
      // Keep the familiar member checklist, with contender/fun status made explicit.
      const current=(await load(week.season_id,week.id)).current;
      const activeIds=new Set((current?.rows||[]).map(r=>r.user_id));
      const subs=await db('submissions?week_id=eq.'+week.id+'&select=user_id');
      const submitted=new Set(subs.map(s=>s.user_id));
      const count=subs.filter(s=>activeIds.has(s.user_id)).length,needed=current?.round.participants_before||8;
      for(const card of box.querySelectorAll('.card')) {
        if(card.querySelector('h2')?.textContent==='Submission Status') card.innerHTML='<h2>Submission Status</h2><p class="muted">'+count+' / '+needed+' contenders submitted · '+(subs.length-count)+' for fun</p>'+data.entries.map(e=>'<div class="ps-history-row"><div><b>'+esc(e.display_name)+'</b><small>'+(activeIds.has(e.user_id)?'Contender':'Picks for fun')+'</small></div><span class="ps-badge">'+(submitted.has(e.user_id)?'Submitted':'Not submitted')+'</span></div>').join('');
        const heading=card.querySelector('.muted');
        if(heading?.textContent==='Submissions') card.innerHTML='<div class="muted">Contender submissions</div><div class="big">'+count+' / '+needed+'</div><p class="ps-note">All contenders submitting locks this card early. Eliminated entries do not count toward auto-lock.</p>';
      }
    }
    let setup='<section class="card" id="postseasonSetup"><div class="eyebrow">SEASON PLAN</div><h2>'+(scheduled?'Postseason ready for January':'Postseason controls')+'</h2><p class="muted">'+(scheduled?'Regular-season scoring is active. Twenty regular-season cards lead into the 8 → 6 → 4 → 2 → 1 postseason.':'Starting points and seeds are frozen. Every correct playoff pick is worth one point.')+'</p><div class="ps-actions">'+button('Season calendar','calendar');
    if(scheduled)setup+=button('Review starting standings','preview-start');
    if(scheduled&&week.status==='published'&&Number(week.number)<data.settings.regular_week_count)setup+=button('Create next scheduled week','create-regular');
    if(!scheduled&&data.current?.round.status==='finalized'&&data.current.round.round_number<4)setup+=button('Create '+(['','Playoff Week 1','Quarterfinals','Semifinals','Championship'][data.current.round.round_number+1]),'create-round');
    if(!scheduled)setup+=button('Open Playoffs','playoffs');
    setup+='</div><div id="postseasonStartPreview"></div>';
    if(!scheduled)setup+='<details class="ps-danger"><summary>Reset postseason</summary><p>This removes all playoff rounds, entries, picks and results, then unlocks the regular season. A commissioner audit is retained.</p>'+button('Reset all playoffs','reset')+'</details>';
    setup+='</section>';box.insertAdjacentHTML('afterbegin',setup);
    if(week.phase==='playoff'&&week.status!=='published') {
      const current=(await load(week.season_id,week.id,true)).current;
      const timing=current.schedule_pending?'<p class="notice">This semifinal card continues through '+date(current.ends_on)+'. Finalize from '+stamp(current.finalize_not_before)+'.</p>':'';
      const text=typeof current?.submitted==='number'?current.submitted+' / '+current.round.participants_before+' contenders submitted':'Loading entries';
      box.insertAdjacentHTML('afterbegin','<section class="card" id="postseasonFinish"><div class="eyebrow">FINISH '+esc(week.playoff_label||'PLAYOFF ROUND').toUpperCase()+'</div><h2>Calculate playoff standings</h2>'+timing+'<ul class="ps-checklist"><li>'+current.decided_count+' / '+current.question_count+' scored results entered</li><li>'+(!current.tiebreaker_pending?'Actual tiebreaker saved':'Actual tiebreaker needed')+'</li><li>'+text+' · missing entries score zero</li></ul><label for="psActual">Actual tiebreaker result</label><input id="psActual" type="number" step="any" value="'+attr(week.tiebreaker_result??'')+'"><div class="ps-actions">'+button('Save tiebreaker','save-tiebreaker')+button('Calculate playoff standings','preview-round','',false)+'</div><p class="ps-note">'+current.fun_submitted+' eliminated members submitted for fun. They do not affect the cut or auto-lock.</p><div id="postseasonRoundPreview"></div></section>');
    }
  }
  function startPreviewHtml(p) {
    const ready=p.date_ready&&p.published_weeks===p.required_weeks&&p.rows.length===8;
    return '<h3>Starting standings preview</h3><p class="ps-note">'+p.published_weeks+' / '+p.required_weeks+' regular-season weeks published. Starting points are saved only when you confirm.</p><div class="tablewrap"><table class="table ps-table"><thead><tr><th>Seed</th><th>Member</th><th>Starting points</th></tr></thead><tbody>'+p.rows.map(r=>'<tr><td>#'+r.seed+'</td><td>'+esc(r.display_name)+'</td><td>'+fmt(r.points)+'</td></tr>').join('')+'</tbody></table></div><p class="ps-note">Seed ties: correct picks, weekly wins, final regular-season tiebreaker distance, then stable account ID. Available from '+stamp(p.start_not_before)+'. Confirm the Playoff Week 1 lock in the calendar first.</p>'+button('Lock Regular Season & Start Playoffs','start',ready?'':'disabled',false);
  }
  async function beginCorrection(wid) {
    const data=await load(currentSeason(),wid,true),qs=await db('questions?week_id=eq.'+wid+'&select=*&order=position.asc');
    correction={weekId:wid,data,questions:qs};
    let editor=$('postseasonCorrection');if(!editor){editor=document.createElement('section');editor.id='postseasonCorrection';editor.className='card';$('playoffBox').prepend(editor);}
    editor.innerHTML='<h2>Correct '+esc(data.current.round.label)+'</h2><p>Review the new standings before saving. If a later round exists, an explicit rebuild is required.</p>'+qs.filter(q=>q.counts_for_score!==false).map(q=>'<label for="psCorrection'+q.id+'">'+esc(q.prompt)+'</label><select id="psCorrection'+q.id+'" data-ps-question="'+q.id+'">'+q.answer_options.map((v,i)=>'<option value="'+i+'" '+(JSON.stringify(v)===JSON.stringify(q.result)?'selected':'')+'>'+esc(typeof v==='string'?v:JSON.stringify(v))+'</option>').join('')+'</select>').join('')+'<label for="psCorrectionActual">Actual tiebreaker</label><input id="psCorrectionActual" type="number" step="any" value="'+attr(data.current.week.tiebreaker_result??'')+'"><div class="ps-actions">'+button('Preview correction','preview-correction')+button('Cancel','cancel-correction')+'</div><div id="postseasonCorrectionPreview"></div>';
    editor.scrollIntoView({block:'start',behavior:'smooth'});
  }
  function copyText(data=latest) {
    const c=data?.current;if(!c)return 'Playoffs have not started.';
    const lines=['🏆 PICK’EM PLAYOFFS',c.round.label.toUpperCase(),c.round.participants_before+' ENTERED — TOP '+c.round.participants_after+' '+(c.round.participants_after===1?'WINS':'ADVANCE'),c.round.status==='finalized'?'FINAL':'PROVISIONAL',''];
    c.rows.forEach((r,i)=>{if(i===c.round.participants_after)lines.push('— CUT LINE —');const e=member(data,r.user_id);lines.push((r.tied?'T':'#')+r.round_rank+' '+r.display_name+' — '+fmt(r.cumulative_after),'   Seed #'+r.seed+' • Reg: '+fmt(e?.regular_season_points)+' • Playoff: +'+fmt(Number(r.cumulative_after)-Number(e?.regular_season_points||0)));});
    return lines.join('\n');
  }
  async function refreshAfterAction() {
    await loadData();await load(currentSeason(),null,true);renderHome();
    if(!$('commissioner').classList.contains('hidden'))await window.renderCommissioner();
    if(!$('playoffs').classList.contains('hidden'))await renderPage();
  }
  async function handle(action,b) {
    if(action==='calendar'){showPage('seasoncalendar',document.querySelector('[data-page="seasoncalendar"]'));return;}
    if(action==='playoffs'){showPage('playoffs',$('playoffsNav'));return;}
    if(action==='history'){openHistoryWeek(b.dataset.week);return;}
    if(action==='refresh'){await renderPage();return;}
    if(action==='preview-start'){preview=await act('preview_start');$('postseasonStartPreview').innerHTML=startPreviewHtml(preview);return;}
    if(action==='start'){
      if(!preview)return;if(!confirm('Freeze these regular-season points and seeds, then open Playoff Week 1?'))return;
      await act('start',{revision:preview.revision});preview=null;await refreshAfterAction();return;
    }
    if(action==='create-regular'||action==='create-round'){
      if(!confirm('Open the next scheduled card using its confirmed lock time?'))return;
      await act(action==='create-round'?'create_round':'create_regular_week');step=0;await refreshAfterAction();return;
    }
    if(action==='save-tiebreaker'){
      const value=$('psActual').value;if(value===''||!Number.isFinite(Number(value)))throw new Error('Enter the actual tiebreaker number.');
      await db('weeks?id=eq.'+week.id,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({tiebreaker_result:Number(value)})});cache.clear();await refreshAfterAction();return;
    }
    if(action==='preview-round'){
      const current=await act('preview_round',{week_id:week.id});preview=current;
      const data=await load(currentSeason(),week.id,true);
      $('postseasonRoundPreview').innerHTML=raceTable(data,current)+(current.ready?button('Finalize round · '+(current.round.participants_after===1?'crown champion':'eliminate 2'),'finalize','',false):'<p class="notice">'+(current.schedule_pending?'Semifinals continue through '+date(current.ends_on)+'. Finalize from '+stamp(current.finalize_not_before)+'.':'Enter all scored results and the actual tiebreaker, then calculate again.')+'</p>');return;
    }
    if(action==='finalize'){
      if(!preview?.revision)return;if(!confirm('Finalize these standings? The cut becomes official and eliminated members’ championship totals freeze.'))return;
      await act('finalize',{week_id:preview.week.id,revision:preview.revision});preview=null;await refreshAfterAction();return;
    }
    if(action==='edit-correction'){
      showPage('playoffs',$('playoffsNav'));await renderPage();await beginCorrection(b.dataset.week);return;
    }
    if(action==='cancel-correction'){$('postseasonCorrection')?.remove();correction=null;return;}
    if(action==='preview-correction'){
      if(!correction)return;const results={};
      $('postseasonCorrection').querySelectorAll('[data-ps-question]').forEach(select=>{const q=correction.questions.find(q=>q.id===select.dataset.psQuestion);results[q.id]=q.answer_options[Number(select.value)];});
      const raw=$('psCorrectionActual').value;if(raw===''||!Number.isFinite(Number(raw)))throw new Error('Enter a valid actual tiebreaker.');
      const p=await act('preview_correction',{week_id:correction.weekId,results,tiebreaker_result:Number(raw)});
      correction.payload={week_id:correction.weekId,results,tiebreaker_result:Number(raw),revision:p.revision};correction.preview=p;
      $('postseasonCorrectionPreview').innerHTML=raceTable(correction.data,{...correction.data.current,week:{...correction.data.current.week,tiebreaker_result:Number(raw)},round:{...p.round,status:'live'},rows:p.rows})+(p.rebuild_required?'<div class="notice">A later round exists. Rebuilding removes every later playoff round, including its picks and results. You will recreate those cards with the corrected survivors.</div>':'')+button(p.rebuild_required?'Rebuild playoffs from this round':'Save corrected standings','apply-correction','',false);return;
    }
    if(action==='apply-correction'){
      if(!correction?.payload)return;
      let confirmation;
      if(correction.preview.rebuild_required){confirmation=prompt('Type REBUILD PLAYOFFS FROM THIS ROUND to invalidate every later round and apply this correction.');if(confirmation!=='REBUILD PLAYOFFS FROM THIS ROUND')return;}
      else if(!confirm('Save these corrected results and recalculate this round’s survivors?'))return;
      await act('correct',{...correction.payload,confirmation});correction=null;$('postseasonCorrection')?.remove();await refreshAfterAction();return;
    }
    if(action==='reset'){
      const confirmation=prompt('This resets the entire postseason and unlocks regular-season corrections. Type RESET ALL PLAYOFFS to continue.');if(confirmation!=='RESET ALL PLAYOFFS')return;
      await act('reset',{confirmation});await refreshAfterAction();return;
    }
    if(action==='copy'){
      const text=copyText(await load(currentSeason(),null,true));
      try{await navigator.clipboard.writeText(text);b.textContent='Copied';}catch{const box=$('playoffCopyFallback');box.hidden=false;box.value=text;box.focus();box.select();}return;
    }
  }
  document.addEventListener('click',event=>{
    const b=event.target.closest('[data-ps-action]');if(!b||b.disabled)return;
    b.disabled=true;handle(b.dataset.psAction,b).catch(e=>alert(e.message||'Couldn’t complete that action.')).finally(()=>{b.disabled=false;});
  });
  document.addEventListener('submit',async event=>{
    const form=event.target;if(!form.matches('[data-ps-calendar]'))return;event.preventDefault();
    const submit=form.querySelector('button');submit.disabled=true;
    try{await act('save_calendar',{slot:Number(form.dataset.psCalendar),lock_at:new Date(form.elements.lock.value).toISOString()});await renderCalendar();}
    catch(e){alert(e.message||'Couldn’t save the lock.');}finally{submit.disabled=false;}
  });
  const oldShow=window.showPage;
  window.showPage=function(id){const out=oldShow.apply(this,arguments);if(id==='playoffs')renderPage();if(id==='seasoncalendar')renderCalendar();return out;};
  const oldCommissioner=window.renderCommissioner;
  window.renderCommissioner=async function(){const out=await oldCommissioner.apply(this,arguments);try{await renderCommissioner();}catch{$('commissionerBox')?.insertAdjacentHTML('afterbegin','<div class="notice">Season calendar is unavailable. Reopen Commissioner to retry.</div>');}return out;};
  const oldHome=window.renderHome;
  window.renderHome=function(){const out=oldHome.apply(this,arguments);load().then(data=>{
    $('postseasonHome')?.remove();if(!data||data.settings.status==='scheduled')return;
    const card=document.createElement('div');card.id='postseasonHome';card.innerHTML=personal(data)+button('Open playoff race','playoffs','',false);$('home').prepend(card);
  }).catch(()=>{});return out;};
  const oldPicks=window.renderPicks;
  window.renderPicks=function(){const out=oldPicks.apply(this,arguments);$('postseasonPicksNotice')?.remove();if(week?.phase==='playoff')load().then(data=>{
    const e=member(data),note=document.createElement('div');note.id='postseasonPicksNotice';note.className='notice';
    note.textContent=e?.status==='active'?'Playoff card: every correct scored pick adds 1 championship point.':'Picks for fun: your championship total is frozen, but you can still pick with the league until lock.';$('picks').prepend(note);
  }).catch(()=>{});return out;};
  const oldProfile=window.renderPlayerProfile;
  window.renderPlayerProfile=async function(id){const out=await oldProfile.apply(this,arguments);try{const data=await load();$('postseasonProfile')?.remove();if(data?.settings.status!=='scheduled'&&member(data,id))$('playerBox').insertAdjacentHTML('beforeend','<div id="postseasonProfile">'+personal(data,id)+'</div>');}catch{}return out;};
  const oldStandings=window.renderStandings;
  window.renderStandings=async function(){const out=await oldStandings.apply(this,arguments);try{const data=await load();if(data?.settings.frozen_at){
    const box=$('standingsBox'),copyButton=$('copySeasonStandingsBtn');const chart=[...box.querySelectorAll('.card')].find(c=>c.querySelector('.eyebrow')?.textContent==='SEASON MOVEMENT');
    box.innerHTML='<section class="card"><div class="eyebrow">FINAL REGULAR SEASON STANDINGS</div><h2>Regular-season champion: '+esc(data.entries.find(e=>e.seed===1)?.display_name||'')+'</h2><p class="ps-note">Frozen at playoff start. Postseason results appear in Playoffs.</p><div class="tablewrap"><table class="table ps-table"><thead><tr><th>Seed</th><th>Member</th><th>Regular-season points</th></tr></thead><tbody>'+data.entries.map(e=>'<tr><td>#'+e.seed+'</td><td>'+esc(e.display_name)+'</td><td>'+fmt(e.regular_season_points)+'</td></tr>').join('')+'</tbody></table></div></section>';if(chart)box.append(chart);
    if(copyButton){const actions=document.createElement('div');actions.className='ps-actions';actions.append(copyButton);box.prepend(actions);}
  }}catch{}return out;};
  const oldStats=window.renderStats;
  window.renderStats=async function(){const out=await oldStats.apply(this,arguments);try{const data=await load();$('postseasonStats')?.remove();if(data&&data.settings.status!=='scheduled')$('statsBox').insertAdjacentHTML('beforeend','<div id="postseasonStats">'+personal(data,$('statsViewSelect')?.value==='league'?session.user.id:$('statsViewSelect')?.value)+'</div>');}catch{}return out;};
  setInterval(()=>{if(!document.hidden&&session&&!$('playoffs').classList.contains('hidden')&&!correction)renderPage();},20000);
  window.Postseason={load,raceTable,personal,badge,copyText,live,renderCommissioner,createNext:()=>handle('create-regular',{}),gamedayHtml:data=>personal(data)+raceTable(data)};
  // The original login boot may finish while the extension scripts are loading.
  if(session&&week) window.renderHome();
})();
