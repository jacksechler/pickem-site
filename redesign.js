// Layout composition only: keep the existing renderers, data calls and action handlers.
(() => {
  const $ = id => document.getElementById(id);
  const states = new Map();
  const busy = new Set();
  const mobile = window.matchMedia('(max-width: 820px)');

  function closeMore(restoreFocus = false) {
    const button = $('moreNav');
    const wasOpen = button?.getAttribute('aria-expanded') === 'true';
    $('secondaryNavigation')?.classList.remove('menu-open');
    button?.setAttribute('aria-expanded', 'false');
    if (restoreFocus && wasOpen) button.focus();
  }

  function updateNavigation(id) {
    const navigationId = id === 'gameday' ? 'league' : id;
    const labels = {home: 'Home', picks: 'My picks', league: 'League picks', standings: 'Standings', stats: 'Stats & records', history: 'Week history', commissioner: 'Commissioner', notificationstatus: 'Notification health'};
    document.querySelectorAll('nav [data-page]').forEach(button => {
      const page = button.dataset.page;
      const label = mobile.matches ? ({picks: 'Picks', league: 'League'}[page] || labels[page]) : labels[page];
      if (label && button.textContent !== label) button.textContent = label;
      button.classList.toggle('active', page === navigationId);
      if (page === navigationId) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    const secondary = !['home', 'picks', 'league', 'standings', 'player'].includes(navigationId);
    $('moreNav')?.classList.toggle('active', secondary);
    const page = $(id);
    page?.querySelectorAll('h1').forEach(heading => { heading.tabIndex = -1; });
  }

  function installNavigation() {
    const nav = document.querySelector('.topinner > nav');
    if (!nav || $('moreNav')) return;
    nav.setAttribute('aria-label', 'Main navigation');
    const more = document.createElement('button');
    more.id = 'moreNav';
    more.className = 'navbtn nav-more';
    more.type = 'button';
    more.textContent = 'More';
    more.setAttribute('aria-expanded', 'false');
    more.setAttribute('aria-controls', 'secondaryNavigation');
    const panel = document.createElement('div');
    panel.id = 'secondaryNavigation';
    panel.className = 'nav-secondary-panel';
    nav.querySelectorAll('[data-page]').forEach(button => {
      if (!['home', 'picks', 'league', 'standings'].includes(button.dataset.page)) panel.appendChild(button);
    });
    nav.append(more, panel);
    more.addEventListener('click', () => {
      const open = more.getAttribute('aria-expanded') !== 'true';
      more.setAttribute('aria-expanded', String(open));
      panel.classList.toggle('menu-open', open);
    });
    document.addEventListener('click', event => { if (!nav.contains(event.target)) closeMore(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMore(true); });
    mobile.addEventListener('change', () => {
      closeMore();
      updateNavigation(document.querySelector('.page:not(.hidden)')?.id || 'home');
    });
    updateNavigation(document.querySelector('.page:not(.hidden)')?.id || 'home');
  }

  function fold(node, key, label, order, parent = $('home')) {
    if (!node || !parent) return;
    let details = $(key);
    if (!details) {
      details = document.createElement('details');
      details.id = key;
      details.className = 'clean-disclosure';
      details.style.order = String(order);
      const summary = document.createElement('summary');
      summary.textContent = label;
      const content = document.createElement('div');
      content.className = 'fold-body';
      details.append(summary, content);
      parent.appendChild(details);
    }
    const content = details.querySelector('.fold-body');
    if (node.parentElement !== content) content.appendChild(node);
  }

  function organizeHome() {
    const dashboard = $('homeDashboardExtra');
    if (dashboard && !dashboard.dataset.cleanOrganized) {
      dashboard.dataset.cleanOrganized = 'true';
      const grid = dashboard.querySelector(':scope > .grid');
      if (grid) {
        const cards = Array.from(grid.children);
        if (cards.length > 3) {
          const extra = document.createElement('div');
          extra.className = 'grid three';
          cards.slice(3).forEach(card => extra.appendChild(card));
          // The dashboard is rebuilt as a whole, so its disclosure travels with it.
          fold(extra, 'homeWeekDetails', 'This week & last week', 0, dashboard);
        }
      }
    }
    fold($('thisWeekPickem'), 'homeStoryDetails', 'League storylines', 20);
    fold($('whatJustHappenedHome'), 'homeActivityDetails', 'Recent league activity', 30);
    fold($('playerDirectoryCard'), 'homePlayerDetails', 'All league players', 40);
    fold($('notificationCard'), 'homeNotificationDetails', 'Notification preferences', 50);
  }

  function refreshHomeSummary() {
    if (!profile) return;
    const firstName = String(profile.display_name || 'Player').trim().split(/\s+/)[0];
    if ($('homeSubtitle')) $('homeSubtitle').textContent = 'Welcome back, ' + firstName + '.';
    if ($('homeSubmitted')) $('homeSubmitted').textContent = submission ? 'Submitted' : 'Not submitted';
    if (!week) return;
    const action = $('homeAction');
    const isLocked = locked();
    const isFinal = week.status === 'published';
    if (action) {
      action.classList.remove('hidden');
      action.textContent = isFinal ? 'View final results' : isLocked ? 'View league picks' : submission ? 'Edit my picks' : Object.keys(myPicks).length ? 'Continue my picks' : 'Make my picks';
      action.onclick = () => {
        const target = isLocked ? 'league' : 'picks';
        showPage(target, document.querySelector('[data-page="' + target + '"]'));
      };
    }
    const status = $('homeLock');
    if (status) {
      const deadline = new Date(week.lock_at);
      status.textContent = isFinal ? 'This week is complete. The final standings are ready.' : isLocked ? 'Picks are locked. Follow the results in League picks.' : 'Picks close ' + deadline.toLocaleString([], {weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'}) + '.';
    }
  }

  const configs = {
    commissionerBox: {
      label: 'Commissioner tools',
      tabs: [['setup', 'Week setup'], ['results', 'Results & publish'], ['players', 'Players'], ['messages', 'Messages'], ['archive', 'History & corrections']],
      initial: () => week && locked() && week.status !== 'published' ? 'results' : 'setup',
      context: () => week?.id || 'new',
      classify: node => {
        const id = node.id;
        const heading = node.querySelector('h2')?.textContent || '';
        if (['finishWeekCard', 'liveResultEntry', 'postseasonFinish'].includes(id) || /Results & Scoring|Enter Results/.test(heading)) return 'results';
        if (/Player Accounts|Submission Status/.test(heading)) return 'players';
        if (id === 'notificationCenter') return 'messages';
        if (id === 'finalCorrectionCard' || /Archive|What Changed/.test(heading)) return 'archive';
        return 'setup';
      }
    },
    leagueBox: {
      label: 'League views',
      tabs: [['results', 'Weekly standings'], ['picks', 'Pick grid'], ['paths', 'Path to the win'], ['details', 'Details & sharing']],
      initial: () => 'results',
      classify: node => {
        if (node.querySelector('select[onchange*="setLeagueHistoryWeek"]')) return 'toolbar';
        if (node.id === 'weeklyStandingsV2') return 'results';
        if (node.id === 'pathToWinCard') return 'paths';
        const eyebrow = node.querySelector('.eyebrow')?.textContent.trim();
        if (['LIVE WEEK', 'FINAL WEEK'].includes(eyebrow)) return 'context';
        if (node.matches('.notice')) return 'context';
        if (node.querySelector('table th')?.textContent.trim() === 'Question') return 'picks';
        if (node.matches('.quality-tie-card') || /SCREENSHOT GRID|WHAT JUST HAPPENED/.test(eyebrow || '')) return 'details';
        return 'results';
      }
    },
    historyBox: {
      label: 'Week history views',
      tabs: [['results', 'Results'], ['picks', 'Pick grid'], ['details', 'Details & sharing']],
      initial: () => 'results',
      classify: node => {
        if (node.querySelector('select[onchange*="setHistoryWeek"]')) return 'toolbar';
        if (node.querySelector('.eyebrow')?.textContent.trim() === 'WEEK ARCHIVE') return 'context';
        if (node.querySelector('table th')?.textContent.trim() === 'Question') return 'picks';
        if (node.matches('.quality-tie-card') || node.querySelector('.eyebrow')?.textContent.trim() === 'SCREENSHOT GRID') return 'details';
        return 'results';
      }
    },
    statsBox: {
      label: 'Stats views',
      tabs: [['stats', 'Season stats'], ['trophies', 'Trophies'], ['records', 'Records']],
      initial: () => 'stats',
      classify: node => node.querySelector('#statsViewSelect') ? 'toolbar' : node.id === 'trophyCase' ? 'trophies' : node.id === 'seasonRecordBook' ? 'records' : 'stats'
    },
    standingsBox: {
      label: 'Season standings views',
      tabs: [['table', 'Season standings'], ['movement', 'Rank history']],
      initial: () => 'table',
      classify: node => /Rank Tracker/.test(node.querySelector('h2')?.textContent || '') ? 'movement' : 'table'
    }
  };

  function selectTab(box, key, focus = false) {
    const state = states.get(box.id);
    if (!state) return;
    state.active = key;
    box.querySelectorAll(':scope > .clean-panelset > .clean-tabs > .clean-tab').forEach(button => {
      const selected = button.dataset.tab === key;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      if (selected && focus) button.focus();
    });
    box.querySelectorAll(':scope > .clean-panelset > .clean-panel').forEach(panel => {
      panel.hidden = panel.dataset.tab !== key;
    });
  }

  function organizePanels(id) {
    if (busy.has(id)) return;
    const box = $(id), config = configs[id];
    if (!box || !config) return;
    let state = states.get(id);
    const context = config.context?.() || '';
    if (!state || state.context !== context) {
      state = {active: config.initial(), context};
      states.set(id, state);
    }
    const incoming = Array.from(box.children).filter(node => !node.classList.contains('clean-panelset') && !node.dataset.cleanFixed);
    if (!incoming.length) return;
    let set = box.querySelector(':scope > .clean-panelset');
    for (const node of incoming) {
      const section = config.classify(node);
      if (section === 'toolbar' || section === 'context') {
        node.dataset.cleanFixed = 'true';
        if (section === 'toolbar') node.classList.add('clean-toolbar');
        else if (!node.classList.contains('notice')) node.classList.add('clean-week-context');
        if (set) box.insertBefore(node, set);
        continue;
      }
      if (!set) {
        set = document.createElement('div');
        set.className = 'clean-panelset';
        const tabs = document.createElement('div');
        tabs.className = 'clean-tabs';
        tabs.setAttribute('role', 'tablist');
        tabs.setAttribute('aria-label', config.label);
        set.appendChild(tabs);
        config.tabs.forEach(([key, label]) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.id = id + '-tab-' + key;
          button.className = 'clean-tab';
          button.dataset.tab = key;
          button.textContent = label;
          button.setAttribute('role', 'tab');
          button.setAttribute('aria-controls', id + '-panel-' + key);
          button.addEventListener('click', () => selectTab(box, key));
          button.addEventListener('keydown', event => {
            if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const buttons = Array.from(tabs.children).filter(b => !b.hidden);
            const index = buttons.indexOf(button);
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
            selectTab(box, buttons[next].dataset.tab, true);
          });
          tabs.appendChild(button);
          const panel = document.createElement('div');
          panel.id = id + '-panel-' + key;
          panel.className = 'clean-panel';
          panel.dataset.tab = key;
          panel.setAttribute('role', 'tabpanel');
          panel.setAttribute('aria-labelledby', button.id);
          panel.tabIndex = 0;
          set.appendChild(panel);
        });
        box.appendChild(set);
      }
      set.querySelector('.clean-panel[data-tab="' + section + '"]')?.appendChild(node);
    }
    if (!set) return;
    const available = [];
    config.tabs.forEach(([key]) => {
      const panel = set.querySelector('.clean-panel[data-tab="' + key + '"]');
      const hasContent = Array.from(panel.children).some(node => node.style.display !== 'none');
      set.querySelector('.clean-tab[data-tab="' + key + '"]').hidden = !hasContent;
      if (hasContent) available.push(key);
    });
    set.querySelector('.clean-tabs').hidden = available.length < 2;
    if (!available.includes(state.active)) state.active = available[0] || config.initial();
    selectTab(box, state.active);
  }

  function observe(boxId, update, subtree = false) {
    const box = $(boxId);
    if (!box) return;
    let pending = false;
    new MutationObserver(() => {
      if (pending || busy.has(boxId)) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; update(); });
    }).observe(box, {childList: true, subtree});
  }

  installNavigation();
  const originalShowPage = window.showPage;
  window.showPage = function(id) {
    const previous = document.querySelector('.page:not(.hidden)')?.id;
    const result = originalShowPage.apply(this, arguments);
    closeMore();
    updateNavigation(id);
    if (id !== previous) {
      window.scrollTo({top: 0, behavior: 'instant'});
      $(id)?.querySelector('h1')?.focus({preventScroll: true});
    }
    return result;
  };

  const originalHome = window.renderHome;
  window.renderHome = function() {
    const result = originalHome.apply(this, arguments);
    refreshHomeSummary();
    organizeHome();
    return result;
  };
  const renderers = {renderCommissioner: 'commissionerBox', renderLeague: 'leagueBox', renderHistory: 'historyBox', renderStats: 'statsBox', renderStandings: 'standingsBox'};
  Object.entries(renderers).forEach(([name, id]) => {
    const original = window[name];
    if (typeof original !== 'function') return;
    window[name] = async function() {
      busy.add(id);
      try { return await original.apply(this, arguments); }
      finally { busy.delete(id); organizePanels(id); }
    };
    observe(id, () => organizePanels(id));
    organizePanels(id);
  });
  observe('home', organizeHome, true);
  refreshHomeSummary();
  organizeHome();
})();
