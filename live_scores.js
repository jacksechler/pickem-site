// Live game scores are informational. Official answers and league points stay in the commissioner workflow.
(() => {
  const M = window.LiveScoresModel;
  if (!M) return;
  const client = new M.Client(undefined, Date.now, {storage: () => window.localStorage, reader: async (league, sourcePage, signal) => {
    const url = SUPABASE + '/functions/v1/live-scores?' + new URLSearchParams({league, page: sourcePage});
    // This endpoint serves only public game facts. A project key keeps score
    // refreshes independent of an expiring member session.
    const response = await fetch(url, {signal, cache: 'no-store', headers: {apikey: KEY, Authorization: 'Bearer ' + KEY}});
    if (!response.ok) throw new Error('Score update unavailable.');
    return response.json();
  }}), boards = new Map(), latest = new Map(), failedLogos = new Set();
  const $ = id => document.getElementById(id);
  let timer, controller, generation = 0, busy = false, managerGeneration = 0;
  let managerGames = [], managerMatches = [], managerBusy = false;
  const gameKey = link => link.league + ':' + link.id;
  const connected = qs => qs.filter(q => M.link(q));
  const localDate = value => new Date(value).toLocaleString([], {weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'});
  const checkedTime = value => new Date(value).toLocaleString([], {...(new Date(value).toDateString() === new Date().toDateString() ? {} : {month: 'short', day: 'numeric'}), hour: 'numeric', minute: '2-digit'});
  const questionLabel = q => 'Q' + q.position + ' · ' + (Array.isArray(q.answer_options) ? q.answer_options.map(a => typeof a === 'string' ? a : '').filter(Boolean).join(' / ') : q.prompt);
  function visible(host) {
    if (!host.isConnected || host.closest('.hidden, [hidden]')) return false;
    for (let n = host.parentElement; n; n = n.parentElement) if (n.tagName === 'DETAILS' && !n.open) return false;
    return true;
  }
  function teamLogo(team) {
    const src = M.safeLogo(team.logo);
    return src && !failedLogos.has(src) ? '<img src="' + esc(src) + '" data-ls-abbr="' + esc(team.abbreviation) + '" alt="" width="30" height="30" loading="lazy" referrerpolicy="no-referrer">' : '<span class="ls-logo-fallback" aria-hidden="true">' + esc(team.abbreviation) + '</span>';
  }
  function card(q, item) {
    const g = item?.game;
    if (!g) return '<article class="ls-game ls-unavailable"><span class="ls-status">' + esc(questionLabel(q)) + '</span><p>' + (item ? 'Score temporarily unavailable.' : 'Loading game…') + '</p></article>';
    const status = g.state === 'scheduled' ? localDate(g.date) : g.status;
    return '<article class="ls-game' + (g.state === 'live' ? ' ls-in-progress' : '') + '"><div class="ls-game-top"><span class="ls-sport">' + esc(M.leagues[g.league].label) + '</span><span class="ls-status">' + esc(status) + '</span></div><div class="ls-teams">' + g.teams.map(t => '<div class="ls-team">' + teamLogo(t) + '<span>' + esc(t.name) + '</span><strong>' + (t.score == null ? '—' : t.score) + '</strong></div>').join('') + '</div><div class="ls-game-bottom"><span>' + (item.stale || (item.checkedAt && Date.now() - item.checkedAt > 180000) ? 'Update delayed' : g.state === 'final' ? 'Final score' : g.state === 'live' ? 'In progress' : g.state === 'paused' ? 'Schedule update' : 'Upcoming') + '</span><a href="' + esc(g.url) + '" target="_blank" rel="noopener noreferrer">CBS Sports <span aria-hidden="true">↗</span><span class="gd-sr">: ' + esc(g.name) + '</span></a></div></article>';
  }
  function paint(host, data) {
    const unique = [...new Map(connected(data.questions).map(q => [gameKey(M.link(q)), q])).values()];
    let html;
    if (!unique.length) html = '<p class="muted ls-empty">Live scores appear here once the commissioner connects this week’s games.</p>';
    else {
      const items = unique.map(q => latest.get(gameKey(M.link(q))));
      const stamps = items.map(x => x?.checkedAt).filter(Boolean), stale = navigator.onLine === false || items.some(x => x?.stale || (x?.checkedAt && Date.now() - x.checkedAt > 180000));
      const time = stamps.length ? Math.min(...stamps) : null;
      html = '<div class="ls-heading"><div><h2>Live game scores</h2><p class="ls-caption">' + (stale ? (navigator.onLine === false ? 'Offline' : 'Updates delayed') : time ? 'CBS Sports' : 'Connecting to CBS Sports…') + (time ? ' · Updated ' + esc(checkedTime(time)) : '') + '</p></div><button type="button" class="btn secondary" data-ls-refresh>Refresh scores</button></div><div class="ls-grid">' + unique.map(q => card(q, latest.get(gameKey(M.link(q))))).join('') + '</div>' + (data.compact ? '' : '<p class="ls-footnote">Game scores refresh every 30 seconds while you’re here. League results are confirmed by your commissioner.</p>');
    }
    if (host.innerHTML !== html) {
      const focusRefresh = host.contains(document.activeElement) && document.activeElement.hasAttribute('data-ls-refresh');
      host.innerHTML = html;
      host.querySelectorAll('img[data-ls-abbr]').forEach(img => {
        const fallback = () => {
          failedLogos.add(img.src);
          const label = document.createElement('span'); label.className = 'ls-logo-fallback';
          label.setAttribute('aria-hidden', 'true'); label.textContent = img.dataset.lsAbbr; img.replaceWith(label);
        };
        img.addEventListener('error', fallback, {once: true});
        if (img.complete && !img.naturalWidth) fallback();
      });
      if (focusRefresh) host.querySelector('[data-ls-refresh]')?.focus({preventScroll: true});
    }
  }
  function mount(host, w, qs, compact = false) {
    if (!host || !w) return;
    for (const q of connected(qs)) {
      const item = M.link(q), saved = client.peek(item);
      if (saved && !latest.has(gameKey(item))) latest.set(gameKey(item), saved);
    }
    boards.set(host, {weekId: w.id, questions: qs, compact});
    host.classList.add('ls-board');
    paint(host, boards.get(host));
    wake();
  }
  function stop() {
    clearTimeout(timer); controller?.abort(); controller = null; busy = false; generation++;
  }
  function wake() { clearTimeout(timer); if (!busy) timer = setTimeout(refresh, 80); }
  async function refresh(force = false) {
    if (busy || document.hidden || !session?.user?.id) return;
    for (const host of boards.keys()) if (!host.isConnected) boards.delete(host);
    const shown = [...boards].filter(([host]) => visible(host));
    if (!shown.length) return;
    if (navigator.onLine === false) { shown.forEach(([host, data]) => paint(host, data)); return; }
    const qs = [...new Map(shown.flatMap(([, data]) => connected(data.questions)).map(q => [q.id, q])).values()];
    if (!qs.length) return;
    busy = true; const ticket = ++generation; controller = new AbortController();
    try {
      const result = await client.readLinks(qs, controller.signal, force);
      if (ticket !== generation) return;
      result.forEach((item, key) => latest.set(key, item));
      for (const [host, data] of boards) if (visible(host)) paint(host, data);
    } catch { /* Navigation cancels requests. The client retains scores on provider errors. */ }
    finally { if (ticket === generation) { busy = false; controller = null; timer = setTimeout(refresh, 30000); } }
  }
  function mountHome() {
    if (!week || !$('home')) return;
    let details = $('homeLiveScores');
    if (!details) {
      details = document.createElement('details'); details.id = 'homeLiveScores'; details.className = 'clean-disclosure'; details.style.order = '10';
      details.innerHTML = '<summary>Live game scores</summary><div class="fold-body"><div id="homeScoresBoard"></div></div>';
      details.addEventListener('toggle', wake); $('home').appendChild(details);
    }
    mount($('homeScoresBoard'), week, questions);
  }
  function mountPicks() {
    const box = $('pickBox');
    if (!box || !week) return;
    $('pickLiveScores')?.remove();
    const qs = locked() ? questions : questions[step] ? [questions[step]] : [];
    if (!connected(qs).length) return;
    const host = document.createElement('div'); host.id = 'pickLiveScores';
    const title = box.querySelector('.question h2');
    if (title) title.after(host); else box.appendChild(host);
    mount(host, week, qs, !locked());
  }
  function mountGameDay(w, qs) {
    const host = $('gdLiveScores');
    if (!host) return;
    host.classList.add('card'); mount(host, w, qs);
  }
  async function weekWindow(w) {
    let slot;
    try { slot = (await db('season_calendar?season_id=eq.' + encodeURIComponent(w.season_id) + '&week_number=eq.' + Number(w.number) + '&select=starts_on,ends_on&limit=1'))?.[0]; } catch { /* Existing deadline remains a usable fallback. */ }
    return M.windowFor(w, slot);
  }
  function managerMessage(message) { if ($('lsManagerStatus')) $('lsManagerStatus').textContent = message; }
  function managerReady() { return profile?.role === 'commissioner' && week && week.status !== 'published'; }
  function setManagerBusy(value) {
    managerBusy = value;
    $('liveScoresManager')?.querySelectorAll('button, select, input').forEach(input => { input.disabled = value; });
    if (!value && $('lsConnectMatches')) $('lsConnectMatches').disabled = !managerMatches.length;
    if (!value && $('lsConnectGame')) $('lsConnectGame').disabled = !managerGames.length;
  }
  function managerCurrent(ticket, weekId) { return ticket === managerGeneration && week?.id === weekId && managerReady() && $('liveScoresManager'); }
  function mountManager() {
    managerGeneration++; managerBusy = false; managerGames = []; managerMatches = [];
    $('liveScoresManager')?.remove();
    if (!managerReady()) return;
    const box = $('commissionerBox'), node = document.createElement('section');
    node.className = 'card'; node.id = 'liveScoresManager';
    const count = connected(questions).length;
    node.innerHTML = '<h2>Connect live scores</h2><p class="muted">' + count + ' of ' + questions.length + ' questions connected. Choose the real game to show its score, status, and team logos to everyone.</p><div class="ls-manager-actions"><button class="btn secondary" type="button" data-ls-action="match">Find matching games</button><button class="btn" id="lsConnectMatches" type="button" data-ls-action="connect-matches" disabled>Connect matches</button></div><p id="lsManagerStatus" role="status" class="ls-caption"></p><div id="lsMatchPreview"></div><details class="ls-manual"><summary>Choose a game manually</summary><div class="ls-manager-fields"><label>Question<select id="lsQuestion">' + questions.map(q => '<option value="' + esc(q.id) + '">' + esc(questionLabel(q)) + '</option>').join('') + '</select></label><label>Sport<select id="lsLeague">' + Object.entries(M.leagues).map(([key, info]) => '<option value="' + key + '">' + info.label + '</option>').join('') + '</select></label><label>Game date <span class="muted">(Eastern)</span><input type="date" id="lsGameDate" value="' + esc(M.day(week.lock_at) || '') + '"></label></div><button class="btn secondary" type="button" data-ls-action="search">Find games</button><div id="lsGameSearch"></div></details>' + (count ? '<details class="ls-manual"><summary>Connected questions (' + count + ')</summary><div class="ls-connected-list">' + connected(questions).map(q => '<div><span>' + esc(questionLabel(q)) + '<small>' + esc(M.leagues[M.link(q).league].label + ' · ' + M.link(q).day) + '</small></span><button type="button" class="btn secondary" data-ls-action="disconnect" data-ls-question="' + esc(q.id) + '">Disconnect</button></div>').join('') + '</div></details>' : '') + '<p class="ls-footnote">Connecting a game does not change picks, deadlines, or official results.</p>';
    box.appendChild(node);
  }
  async function saveLink(questionId, game) {
    if (!managerReady() || !questions.some(q => q.id === questionId)) throw new Error('This question is no longer editable.');
    const payload = {team_meta: M.metadata(questions.find(q => q.id === questionId), game)};
    const saved = await db('questions?id=eq.' + encodeURIComponent(questionId) + '&week_id=eq.' + encodeURIComponent(week.id), {method: 'PATCH', headers: {Prefer: 'return=representation'}, body: JSON.stringify(payload)});
    if (!saved?.length) throw new Error('The connection was not saved.');
    Object.assign(questions.find(q => q.id === questionId), payload);
  }
  async function managerAction(button) {
    if (!managerReady() || managerBusy) return;
    const action = button.dataset.lsAction, weekId = week.id, ticket = managerGeneration;
    setManagerBusy(true);
    try {
      if (action === 'match') {
        managerMessage('Finding games for this week…'); managerMatches = [];
        const range = await weekWindow(week);
        const sports = Object.keys(M.leagues).filter(key => key !== 'mens-college-basketball' || questions.some(q => M.league(q.sport) === key));
        const feeds = await Promise.all(sports.map(key => client.readBoard(key, range.from, range.to)));
        if (!managerCurrent(ticket, weekId)) return;
        const games = feeds.flatMap(f => f.stale ? [] : f.games);
        for (const q of questions.filter(q => !M.link(q))) { const found = M.matches(q, games); if (found.length === 1) managerMatches.push({question: q, game: found[0]}); }
        $('lsMatchPreview').innerHTML = managerMatches.length ? '<ul class="ls-match-list">' + managerMatches.map(item => '<li><b>Q' + item.question.position + '</b> ' + esc(item.game.name) + '<small>' + esc(localDate(item.game.date)) + '</small></li>').join('') + '</ul>' : '';
        managerMessage(managerMatches.length + ' clear matches found.' + (questions.length > connected(questions).length + managerMatches.length ? ' Use the manual picker for the remaining questions.' : '') + (feeds.some(f => f.stale) ? ' Some schedules are temporarily unavailable.' : ''));
        $('lsConnectMatches').textContent = 'Connect ' + managerMatches.length + ' matches';
      } else if (action === 'search') {
        const key = $('lsLeague').value, date = $('lsGameDate').value;
        managerMessage('Loading games…');
        const feed = await client.readBoard(key, date, date, undefined, true);
        if (!managerCurrent(ticket, weekId)) return;
        managerGames = feed.stale ? [] : feed.games;
        $('lsGameSearch').innerHTML = managerGames.length ? '<label>Game<select id="lsSelectedGame">' + managerGames.map((g, i) => '<option value="' + i + '">' + esc(g.name + ' · ' + localDate(g.date)) + '</option>').join('') + '</select></label><button type="button" class="btn" id="lsConnectGame" data-ls-action="connect">Connect game</button>' : '<p class="muted">' + (feed.stale ? 'CBS Sports is unavailable. Try again shortly.' : 'No games found for this sport and date.') + '</p>';
        managerMessage(feed.stale ? 'Could not refresh CBS Sports.' : managerGames.length + ' games found.');
      } else if (action === 'connect-matches' || action === 'connect' || action === 'disconnect') {
        const changes = action === 'connect-matches' ? [...managerMatches] : action === 'connect' ? [{question: questions.find(q => q.id === $('lsQuestion').value), game: managerGames[Number($('lsSelectedGame')?.value)]}] : [{question: questions.find(q => q.id === button.dataset.lsQuestion), game: null}];
        if (!changes.length || changes.some(c => !c.question || (action !== 'disconnect' && !c.game))) throw new Error('Choose a question and game first.');
        let saved = 0;
        try { for (const change of changes) { if (!managerCurrent(ticket, weekId)) return; await saveLink(change.question.id, change.game); saved++; } }
        catch (error) { throw new Error(saved + ' connections saved. ' + (error.message || 'Try the remaining games again.')); }
        if (!managerCurrent(ticket, weekId)) return;
        mountManager(); mountHome();
        managerMessage(action === 'disconnect' ? 'Game disconnected.' : saved + (saved === 1 ? ' game connected.' : ' games connected.'));
      }
    } catch (error) { if (managerCurrent(ticket, weekId)) managerMessage(error.message || 'Could not connect games. Try again.'); }
    finally { if (ticket === managerGeneration) setManagerBusy(false); }
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (button?.hasAttribute('data-ls-refresh')) { stop(); refresh(true); }
    if (button?.dataset.lsAction) managerAction(button);
  });
  document.addEventListener('change', event => {
    if (!['lsLeague', 'lsGameDate'].includes(event.target.id)) return;
    managerGames = []; if ($('lsGameSearch')) $('lsGameSearch').innerHTML = '';
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else wake(); });
  window.addEventListener('online', wake);
  window.addEventListener('offline', () => { stop(); refresh(); });
  const homeBefore = window.renderHome;
  window.renderHome = function() { const result = homeBefore.apply(this, arguments); mountHome(); return result; };
  const picksBefore = window.renderPicks;
  window.renderPicks = function() { const result = picksBefore.apply(this, arguments); mountPicks(); return result; };
  const commissionerBefore = window.renderCommissioner;
  window.renderCommissioner = async function() { const result = await commissionerBefore.apply(this, arguments); mountManager(); return result; };
  const pageBefore = window.showPage;
  window.showPage = function() { stop(); const result = pageBefore.apply(this, arguments); wake(); return result; };
  window.LiveScores = {mountGameDay};
})();
