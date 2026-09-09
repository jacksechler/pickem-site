// Personalized, read-only live view. Results come from the existing commissioner flow.
(() => {
  const M = window.GameDayModel;
  const $ = id => document.getElementById(id);
  const root = $('gameday');
  if (!M || !root) return;
  const state = {weekId: null, model: null, fingerprint: '', updates: null, checkedAt: null, filter: 'all', timer: null, controller: null, request: 0, busy: false};
  let entryRequest = 0;
  const selectedWeek = () => $('leagueBox')?.querySelector('select[onchange*="setLeagueHistoryWeek"]')?.value || week?.id;
  const active = () => !!session?.user?.id && !root.classList.contains('hidden') && !$('app').classList.contains('hidden');
  const fmt = n => Number(n).toFixed(1).replace(/\.0$/, '');
  const points = n => (n > 0 ? '+' : '') + fmt(n);
  const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
  const answer = value => esc(M.answerLabel(value));
  const time = value => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleTimeString([], {hour: 'numeric', minute: '2-digit', second: '2-digit'}) : '';
  };

  async function updateEntry() {
    const ticket = ++entryRequest, button = $('openGameDay'), id = selectedWeek();
    if (!button) return;
    button.hidden = true;
    if (!id || !session?.user?.id) return;
    try {
      const rows = await db('weeks?id=eq.' + encodeURIComponent(id) + '&select=id,status,lock_at,auto_locked_at&limit=1');
      if (ticket === entryRequest && selectedWeek() === id) button.hidden = !M.canOpen(rows[0]);
    } catch { /* League picks keeps its existing error state; opening stays unavailable. */ }
  }

  function setSync(message, status = '') {
    $('gdSync').textContent = message;
    $('gdSync').dataset.state = status;
  }

  function movementSummary(m, update) {
    if (!update) return '';
    const mine = update.movement.find(r => r.id === m.userId);
    const reasons = [];
    if (update.results.length) reasons.push(plural(update.results.length, 'result update'));
    if (update.tiebreaker) reasons.push('the tiebreaker update');
    if (update.publication) reasons.push(m.published ? 'final scores were published' : 'the week was reopened');
    if (mine) return 'You moved from ' + mine.from + ' to ' + mine.to + (reasons.length ? ' after ' + reasons.join(' and ') : ' after a standings update') + '.';
    if (update.publication) return m.published ? 'Final scores are published. Your official result is below.' : 'The week was reopened. Standings are provisional again.';
    if (update.tiebreaker) return 'The actual tiebreaker is in. Standings now include each member’s distance from it.';
    if (update.results.length) return plural(update.results.length, 'result') + ' updated.' + (m.me?.rank ? ' You’re ' + M.rankLabel(m.me) + '.' : '');
    return '';
  }

  function overview(m) {
    const me = m.me;
    if (!me?.entered && !me?.score) return '<div class="card gd-spectator"><div class="eyebrow">FOLLOW YOUR LEAGUE</div><h2>You don’t have an entry for this week.</h2><p class="muted">You can still follow every result and the league standings below.</p></div>';
    const rank = M.rankLabel(me);
    const leader = m.rows.find(r => r.rank);
    let detail = !m.resolved ? 'Your position appears after the first scored result.' : me.rank === 1 ? (me.tied ? 'You’re sharing the lead.' : 'You’re leading the week.') : leader && me.rank ? (leader.correct > me.correct ? plural(leader.correct - me.correct, 'correct pick') + ' behind the lead.' : 'Level on correct picks. The tiebreaker separates you.') : 'Waiting for your official score.';
    if (m.published && me.score) detail = 'Final result · ' + fmt(me.score.total_points) + ' league points';
    const summary = movementSummary(m, state.updates);
    return '<div class="card gd-overview"><div class="gd-position"><div class="eyebrow">' + (m.published ? 'YOUR FINAL POSITION' : 'YOUR LIVE POSITION') + '</div><div class="gd-rank">' + rank + '<span> / ' + m.rows.filter(r => r.entered || r.score).length + '</span></div><p>' + esc(detail) + '</p></div>' +
      '<dl class="gd-metrics"><div><dt>Correct / ' + (m.published ? 'total' : 'decided') + '</dt><dd>' + me.correct + '<span> / ' + (m.published ? me.total : m.resolved) + '</span></dd></div><div><dt>' + (m.published ? 'League points' : 'Picks remaining') + '</dt><dd>' + (me.score ? fmt(me.score.total_points) : me.remaining) + '</dd></div></dl>' +
      (summary ? '<p class="gd-update">' + esc(summary) + '</p>' : '') + '</div>';
  }

  function keyPicks(m) {
    if (m.published) return '';
    let body = '';
    if (!m.me?.entered) body = '<p class="muted">The live standings and every member’s picks are below.</p>';
    else if (!m.total) body = '<p class="muted">There are no scored questions in this week yet.</p>';
    else if (m.complete) body = '<p class="muted">Every scored result is in. ' + (m.hasTiebreaker ? 'Waiting for the commissioner to publish the final standings.' : 'The actual tiebreaker is still to come.') + '</p>';
    else if (!m.keyPicks.length) body = '<p class="muted">Your remaining picks match the other submitted entries, or there aren’t enough entries to compare yet.</p>';
    else body = m.keyPicks.slice(0, 3).map(item => {
      const q = m.questions.find(q => q.id === item.questionId);
      const rivals = item.opponents.slice(0, 2).map(id => m.rows.find(r => r.id === id));
      const solo = m.bonusReady && m.rows.filter(r => r.entered && M.same(r.answers[q.id], m.me.answers[q.id])).length === 1;
      return '<article class="gd-matchup"><div class="gd-question-meta">' + esc(q.sport || 'PICK') + (solo ? ' <span>Potential Unicorn · +3</span>' : '') + '</div><h3>' + esc(q.prompt) + '</h3><div class="gd-your-pick"><span>Your pick</span><strong>' + answer(m.me.answers[q.id]) + '</strong></div>' +
        rivals.map(r => '<div class="gd-rival"><span>' + esc(r.name) + ' <small>' + M.rankLabel(r) + '</small></span><strong>' + answer(r.answers[q.id]) + '</strong></div>').join('') +
        '<p class="gd-scenario">If your pick is correct, you gain one on ' + rivals.map(r => esc(r.name)).join(' and ') + (item.opponents.length > 2 ? ' and ' + plural(item.opponents.length - 2, 'other member') : '') + '. You’d be <b>' + item.projectedRank + '</b> on current results.</p></article>';
    }).join('');
    return '<section class="card gd-key-picks" aria-labelledby="gdKeyTitle"><div class="gd-section-heading"><h2 id="gdKeyTitle">Picks that matter to you</h2>' + (!m.complete ? '<span class="gd-caption">Unresolved</span>' : '') + '</div>' + body + '</section>';
  }

  function leaderboard(m) {
    const movement = new Map((state.updates?.movement || []).map(r => [r.id, r]));
    return '<section class="card gd-leaderboard" aria-labelledby="gdBoardTitle"><div class="gd-section-heading"><h2 id="gdBoardTitle">The league</h2><span class="gd-caption">' + (m.published ? 'Final' : 'Provisional') + '</span></div>' +
      '<table class="gd-table"><caption class="gd-sr">' + esc(m.week.name) + ' standings. ' + (m.published ? 'Official published placements.' : 'Ranked by correct picks, then the tiebreaker when available.') + '</caption><thead><tr><th scope="col">Place</th><th scope="col">Member</th><th scope="col">Correct</th><th scope="col">' + (m.published ? 'Points' : 'Move') + '</th></tr></thead><tbody>' + m.rows.map(r => {
        const move = movement.get(r.id), mine = r.id === m.userId;
        const movementHtml = move ? '<span class="gd-movement ' + (move.delta > 0 ? 'good' : 'bad') + '" aria-label="' + (move.delta > 0 ? 'Up ' : 'Down ') + plural(Math.abs(move.delta), 'place') + ' since the last update">' + (move.delta > 0 ? '↑' : '↓') + Math.abs(move.delta) + '</span>' : '<span class="muted">—</span>';
        return '<tr class="' + (mine ? 'gd-me ' : '') + (move ? 'gd-moved' : '') + '"><td><b>' + M.rankLabel(r) + '</b></td><th scope="row">' + esc(r.name) + (mine ? '<span class="gd-you">You</span>' : '') + (!r.entered && !r.score ? '<small>No entry</small>' : m.published && !r.score ? '<small>Score pending</small>' : '') + '</th><td>' + (r.entered || r.score ? r.correct + '<span class="muted">/' + (m.published ? r.total : m.resolved) + '</span>' : '—') + '</td><td>' + (m.published ? (r.score ? fmt(r.score.total_points) : '—') : movementHtml) + '</td></tr>';
      }).join('') + '</tbody></table><p class="gd-footnote">' + (!m.resolved && !m.published ? 'Positions appear after the first scored result. ' : '') + (m.published ? 'Placements and points are the published scores.' : 'Correct picks first. ' + (m.hasTiebreaker ? 'Ties use the closest tiebreaker answer.' : 'Tiebreaker pending.')) + ' T means tied.</p></section>';
  }

  function bonusPanel(m) {
    if (!m.me?.entered && !m.me?.score) return '';
    const me = m.me;
    let content = m.bonuses.length ? '<ul class="gd-bonuses">' + m.bonuses.map(b => '<li><span>' + esc(b.label) + (b.count ? '<small>' + plural(b.count, 'pick') + '</small>' : '') + '</span><strong class="' + (b.points > 0 ? 'good' : 'bad') + '">' + points(b.points) + '</strong></li>').join('') + '</ul>' : '<p class="muted">' + (m.published ? (me.score ? 'No bonuses this week.' : 'Waiting for your official score.') : !m.bonusReady ? 'Bonus tracking starts when all 8 complete entries are available.' : 'No bonuses yet. Your results will update this panel.') + '</p>';
    if (!m.published && m.bonusReady && m.resolved && !m.complete && me.correct === m.resolved) content += '<p class="gd-footnote">Perfect week still possible · +5 if every scored pick is correct.</p>';
    if (!m.published && me.streakEligible && m.bonusReady) content += '<p class="gd-footnote">Your previous perfect week unlocks +0.5 per opening correct pick, until your first miss.</p>';
    return '<section class="card gd-bonus-panel" aria-labelledby="gdBonusTitle"><div class="gd-section-heading"><h2 id="gdBonusTitle">Your bonuses</h2><span class="gd-caption">' + (me.score ? 'Final' : 'So far') + '</span></div>' + content + (!m.published ? '<p class="gd-footnote">Provisional until the week is published.</p>' : '') + '</section>';
  }

  function recentResults(m) {
    const updates = state.updates?.results || [];
    const recent = updates.length ? updates.slice(-4).reverse().map(u => ({...m.questions.find(q => q.id === u.id), corrected: u.corrected})) : m.questions.filter(M.decided).sort(M.resultOrder).slice(-3).reverse();
    let body = '<p class="muted">Waiting for the first result. This screen updates as the commissioner enters results.</p>';
    if (recent.length) body = '<ul class="gd-results">' + recent.map(q => {
      const known = M.decided(q), ownAnswer = m.me?.answers[q.id], correct = known && ownAnswer !== undefined && M.same(ownAnswer, q.result);
      const outcome = !known ? 'Result cleared' : q.counts_for_score === false ? 'Not scored' : ownAnswer === undefined ? 'No pick' : correct ? 'You got it' : 'Your pick missed';
      const winners = m.rows.filter(r => r.entered && known && M.same(r.answers[q.id], q.result));
      const bonus = correct && q.counts_for_score !== false && m.bonusReady && !m.published ? winners.length === 1 ? ' · Unicorn +3' : winners.length === 2 ? ' · Upset +0.5' : '' : '';
      return '<li><div class="gd-result-mark ' + (correct && q.counts_for_score !== false ? 'good' : 'muted') + '" aria-hidden="true">' + (correct ? '✓' : '•') + '</div><div><h3>' + esc(q.prompt) + '</h3><p>' + (known ? answer(q.result) : 'Waiting for a new result') + '</p><small class="' + (correct ? 'good' : 'muted') + '">' + (q.corrected ? 'Updated · ' : '') + outcome + bonus + '</small></div></li>';
    }).join('') + '</ul>';
    return '<section class="card gd-recent-panel" aria-labelledby="gdRecentTitle"><h2 id="gdRecentTitle">' + (updates.length ? 'Just updated' : 'Latest results') + '</h2>' + body + '</section>';
  }

  function questionDetails(q, m) {
    const known = M.decided(q);
    const groups = [];
    for (const option of Array.isArray(q.answer_options) ? q.answer_options : []) if (!groups.some(g => M.same(g.answer, option))) groups.push({answer: option, members: []});
    for (const r of m.rows.filter(r => r.entered || r.score)) {
      const value = r.answers[q.id];
      let group = groups.find(g => M.same(g.answer, value));
      if (!group) { group = {answer: value, members: []}; groups.push(group); }
      group.members.push(r);
    }
    const mine = m.me?.answers[q.id];
    const status = known ? 'Result: ' + M.answerLabel(q.result) : 'Unresolved';
    return '<details class="gd-question" data-gd-key="q-' + esc(q.id) + '"><summary id="gd-question-' + esc(q.id) + '"><span><small>' + esc(q.sport || 'PICK') + (q.counts_for_score === false ? ' · Not scored' : '') + '</small><strong>' + esc(q.prompt) + '</strong><span class="gd-caption">Your pick: ' + answer(mine) + '</span></span><span class="gd-question-status ' + (known && mine !== undefined && M.same(mine, q.result) ? 'good' : '') + '">' + esc(status) + '</span></summary><div class="gd-answer-groups">' + groups.map(g => '<div class="gd-answer-group"><b>' + answer(g.answer) + (known && M.same(g.answer, q.result) ? '<span class="good"> · Correct</span>' : '') + '</b><div>' + (g.members.length ? g.members.map(r => '<span class="gd-member ' + (r.id === m.userId ? 'gd-member-me' : '') + '">' + esc(r.name) + (r.id === m.userId ? ' (you)' : '') + '</span>').join('') : '<span class="muted">No one picked this</span>') + '</div></div>').join('') + '</div></details>';
  }

  function allPicks(m) {
    const filtered = m.questions.filter(q => state.filter === 'all' || (state.filter === 'decided' ? M.decided(q) : !M.decided(q)));
    const me = m.me;
    return '<details class="card gd-all-picks" data-gd-key="all"><summary id="gdAllPicksSummary"><span>Every pick</span><span class="gd-caption">' + m.questions.length + ' questions</span></summary><div class="gd-filters" role="group" aria-label="Filter questions">' + [['all', 'All'], ['pending', 'Unresolved'], ['decided', 'Decided']].map(([id, label]) => '<button class="btn secondary" type="button" id="gd-filter-' + id + '" data-gd-filter="' + id + '" aria-pressed="' + (state.filter === id) + '">' + label + '</button>').join('') + '</div>' + (filtered.map(q => questionDetails(q, m)).join('') || '<p class="muted">No questions in this view.</p>') +
      '<div class="gd-tiebreaker"><h3>Tiebreaker</h3><p>' + esc(m.week.tiebreaker_prompt || 'Tiebreaker answer') + '</p><p class="gd-caption">Your answer: <b>' + (M.numeric(me?.tiebreaker) ? esc(me.tiebreaker) : '—') + '</b> · Actual: <b>' + (m.hasTiebreaker ? esc(m.week.tiebreaker_result) : 'Pending') + '</b></p><ul>' + m.rows.filter(r => r.entered || r.score).map(r => '<li><span>' + esc(r.name) + (r.id === m.userId ? ' (you)' : '') + '</span><span>' + (M.numeric(r.tiebreaker) ? esc(r.tiebreaker) : '—') + (r.distance !== null ? ' · ' + fmt(r.distance) + ' away' : '') + '</span></li>').join('') + '</ul></div></details>';
  }

  function render(m) {
    const content = $('gdContent');
    const open = new Set([...content.querySelectorAll('details[open][data-gd-key]')].map(d => d.dataset.gdKey));
    const focusedId = content.contains(document.activeElement) ? document.activeElement.id : null;
    const scroll = {page: window.scrollY, root: root.scrollTop};
    $('gdWeek').textContent = (m.week.name || 'Week ' + m.week.number) + ' · ' + (m.published ? 'Final' : 'Picks locked');
    content.innerHTML = overview(m) + '<div class="gd-progress"><span>' + m.resolved + ' of ' + m.total + ' scored results in</span><progress value="' + m.resolved + '" max="' + Math.max(1, m.total) + '" aria-label="Scored results entered"></progress></div>' +
      '<div class="gd-columns"><div class="gd-main-column">' + keyPicks(m) + recentResults(m) + '</div><div class="gd-side-column">' + leaderboard(m) + bonusPanel(m) + '</div></div>' + allPicks(m) +
      '<p class="gd-source">Results entered by your commissioner · Checks for updates every 20 seconds while you’re here.</p>';
    content.querySelectorAll('details[data-gd-key]').forEach(d => { d.open = open.has(d.dataset.gdKey); });
    if (focusedId) $(focusedId)?.focus({preventScroll: true});
    root.scrollTop = scroll.root;
    if (window.scrollY !== scroll.page) window.scrollTo({top: scroll.page, behavior: 'instant'});
  }

  function stop() {
    clearTimeout(state.timer);
    state.controller?.abort();
    state.controller = null;
    state.busy = false;
    state.request++;
    $('gdRefresh').disabled = false;
  }

  async function refresh() {
    if (!active() || document.hidden || !state.weekId || state.busy) return;
    clearTimeout(state.timer);
    if (navigator.onLine === false) {
      setSync('Offline' + (state.checkedAt ? ' · Last checked ' + time(state.checkedAt) : ''), 'offline');
      $('gdError').hidden = false;
      $('gdError').textContent = state.model ? 'You’re offline. Showing the last loaded results; updates resume when you reconnect.' : 'You’re offline. Reconnect to load GameDay.';
      return;
    }
    const ticket = ++state.request, userId = session.user.id;
    const controller = new AbortController();
    state.controller = controller;
    state.busy = true;
    $('gdRefresh').disabled = true;
    if (!state.model) {
      setSync('Loading your week…');
      $('gdContent').innerHTML = '<div class="card gd-empty" aria-busy="true">Getting your picks and the latest results…</div>';
    }
    const deadline = setTimeout(() => controller.abort(), 15000);
    try {
      const bundle = await M.loadBundle(path => db(path, {signal: controller.signal}), state.weekId);
      if (ticket !== state.request || !active() || session.user.id !== userId) return;
      if (bundle.private) {
        state.model = null; state.fingerprint = ''; state.updates = null; state.checkedAt = null;
        $('gdWeek').textContent = bundle.week?.name || 'Your league';
        $('gdContent').innerHTML = '<div class="card gd-empty"><h2>GameDay opens after picks lock.</h2><p class="muted">Everyone’s picks stay private until then. You can return to League picks above.</p></div>';
        $('gdError').hidden = true;
        setSync('Picks private');
        return;
      }
      const model = M.build(bundle, userId), fingerprint = JSON.stringify(model);
      if (fingerprint !== state.fingerprint) {
        const update = M.changes(state.model, model);
        // A quiet poll leaves the last movement visible. A real update replaces it.
        state.updates = update;
        state.model = model;
        state.fingerprint = fingerprint;
        render(model);
        $('gdAnnouncement').textContent = movementSummary(model, update);
      }
      state.checkedAt = Date.now();
      $('gdError').hidden = true;
      setSync((model.published ? 'Final' : 'Auto updates on') + ' · Checked ' + time(state.checkedAt), model.published ? 'final' : 'live');
    } catch {
      if (ticket !== state.request || !active() || document.hidden) return;
      $('gdError').hidden = false;
      $('gdError').textContent = state.model ? 'Couldn’t refresh. Showing the last loaded results; retrying automatically.' : 'Couldn’t load GameDay. Try Refresh; we’ll also retry automatically.';
      if (!state.model) $('gdContent').innerHTML = '';
      setSync(state.checkedAt ? 'Last checked ' + time(state.checkedAt) : 'Update unavailable', 'offline');
    } finally {
      clearTimeout(deadline);
      if (ticket === state.request) {
        state.busy = false; state.controller = null;
        $('gdRefresh').disabled = false;
        if (active() && !document.hidden) state.timer = setTimeout(refresh, 20000);
      }
    }
  }

  function expanded() { return root.classList.contains('gd-expanded') || document.fullscreenElement === root; }
  function syncFullscreen() {
    const on = expanded();
    document.body.classList.toggle('gameday-expanded', on);
    $('gdFullscreen').textContent = on ? 'Exit full screen' : 'Full screen';
    $('gdFullscreen').setAttribute('aria-pressed', String(on));
    if (root.classList.contains('gd-expanded')) { root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); }
    else { root.removeAttribute('role'); root.removeAttribute('aria-modal'); }
  }
  async function exitFullscreen() {
    root.classList.remove('gd-expanded');
    if (document.fullscreenElement === root) { try { await document.exitFullscreen(); } catch {} }
    syncFullscreen();
  }
  async function toggleFullscreen() {
    if (expanded()) await exitFullscreen();
    else {
      try {
        if (!root.requestFullscreen || !document.fullscreenEnabled) throw new Error('Use expanded view');
        await root.requestFullscreen();
      } catch { root.classList.add('gd-expanded'); }
      syncFullscreen();
    }
    $('gdFullscreen').focus({preventScroll: true});
  }

  $('openGameDay').addEventListener('click', () => {
    const id = selectedWeek();
    if (!id) return;
    if (state.weekId !== id || state.model?.userId !== session?.user?.id) {
      stop(); state.model = null; state.fingerprint = ''; state.updates = null; state.checkedAt = null; state.filter = 'all';
      $('gdContent').innerHTML = ''; $('gdAnnouncement').textContent = ''; $('gdError').hidden = true;
    }
    state.weekId = id;
    window.showPage('gameday', document.querySelector('[data-page="league"]'));
  });
  root.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button || !root.contains(button)) return;
    if (button.dataset.gdFilter) { state.filter = button.dataset.gdFilter; if (state.model) render(state.model); }
    if (button.dataset.gdAction === 'refresh') refresh();
    if (button.dataset.gdAction === 'fullscreen') await toggleFullscreen();
    if (button.dataset.gdAction === 'back') {
      await exitFullscreen();
      window.showPage('league', document.querySelector('[data-page="league"]'));
    }
  });
  root.addEventListener('keydown', event => {
    if (!expanded()) return;
    if (event.key === 'Escape' && root.classList.contains('gd-expanded')) { event.preventDefault(); exitFullscreen(); $('gdFullscreen').focus(); }
    if (event.key === 'Tab') {
      const focusable = [...root.querySelectorAll('button:not(:disabled), summary, a[href], [tabindex="0"]')].filter(node => node.getClientRects().length);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  document.addEventListener('fullscreenchange', syncFullscreen);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (active()) refresh(); else if (!$('league').classList.contains('hidden')) updateEntry(); });
  window.addEventListener('online', () => { if (active()) refresh(); });
  window.addEventListener('offline', () => { if (active()) { stop(); refresh(); } });
  const previousShowPage = window.showPage;
  window.showPage = function(id) {
    if (id !== 'gameday') { stop(); if (expanded()) exitFullscreen(); }
    const result = previousShowPage.apply(this, arguments);
    if (id === 'gameday') { state.weekId ||= selectedWeek(); refresh(); }
    return result;
  };
  const previousLeague = window.renderLeague;
  window.renderLeague = async function() {
    ++entryRequest;
    $('openGameDay').hidden = true;
    try { return await previousLeague.apply(this, arguments); }
    finally { updateEntry(); }
  };
  setInterval(() => { if (!document.hidden && !$('league').classList.contains('hidden') && session?.user?.id) updateEntry(); }, 20000);
})();
