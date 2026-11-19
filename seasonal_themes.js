/* Presentation only: no account, pick, scoring, or league data operations. */
(() => {
  const model = window.SeasonalThemesModel;
  if (!model) return;
  const root = document.documentElement;
  const meta = document.querySelector('meta[name="theme-color"]');
  const originalColor = meta?.getAttribute('content') || '#10151e';
  let timer;
  let mounted = false;
  let rendered;

  const thanksgiving = '<div class="tg-garland" aria-hidden="true">🍁 🍂 🌽 🍁 🥧 🍂 🍁</div><div class="tg-feast-body"><span class="tg-turkey" aria-hidden="true">🦃</span><div class="tg-copy"><div class="tg-kicker">NOVEMBER 19–26</div><h2>Thanksgiving Week</h2></div><span class="tg-harvest" aria-hidden="true">🎃<span>🏈 🍁</span></span></div>';
  const christmas = '<div class="holiday-art" aria-hidden="true"><img class="holiday-bough holiday-bough-left" src="holiday-assets/christmas-left.svg" alt=""><img class="holiday-bough holiday-bough-right" src="holiday-assets/christmas-right.svg" alt=""><img class="holiday-lights" src="holiday-assets/christmas-lights.svg" alt=""></div><div class="holiday-copy"><div class="holiday-date">DECEMBER 1–25</div><h2>Christmas at Pick’em</h2></div>';
  const newyear = '<div class="holiday-art" aria-hidden="true"><img class="holiday-firework holiday-firework-left" src="holiday-assets/newyear-firework.svg" alt=""><img class="holiday-firework holiday-firework-right" src="holiday-assets/newyear-firework.svg" alt=""></div><div class="holiday-copy"><div class="holiday-date">DECEMBER 31–JANUARY 1</div><h2>Happy New Year</h2><div class="holiday-year">2027</div></div>';
  const designs = {
    thanksgiving: { name: 'Thanksgiving Week', markup: thanksgiving },
    christmas: { name: 'Christmas at Pick’em', markup: christmas },
    newyear: { name: 'Happy New Year 2027', markup: newyear }
  };

  function render(id) {
    if (!mounted || rendered === id) return;
    for (const node of document.querySelectorAll('[data-seasonal-banner]')) node.remove();
    rendered = id;
    if (!id) return;
    const design = designs[id];
    for (const target of ['mainContent', 'auth']) {
      const parent = document.getElementById(target);
      if (!parent) continue;
      const banner = document.createElement('aside');
      banner.id = target === 'mainContent' ? 'seasonalBanner' : 'seasonalWelcome';
      banner.className = (id === 'thanksgiving' ? 'tg-feast' : 'holiday-banner holiday-' + id) + (target === 'auth' ? ' holiday-welcome' : '');
      banner.setAttribute('data-seasonal-banner', id);
      banner.setAttribute('aria-label', design.name);
      banner.innerHTML = design.markup;
      if (id === 'thanksgiving' && target === 'auth') {
        banner.className = 'tg-welcome';
        banner.innerHTML = '<span aria-hidden="true">🍁 🦃 🥧 🎃 🍂</span><strong>Thanksgiving Week</strong><small>November 19–26</small>';
      }
      parent.prepend(banner);
    }
  }

  function sync() {
    const now = Date.now();
    const season = model.at(now);
    for (const candidate of model.seasons) root.classList.toggle(candidate.id, season?.id === candidate.id);
    if (meta) meta.setAttribute('content', season?.color || originalColor);
    render(season?.id || null);
    clearTimeout(timer);
    // Wake exactly at a boundary, and also recheck for a changed device clock.
    const boundary = model.nextBoundary(now);
    timer = setTimeout(sync, boundary === null ? 60000 : Math.max(1, Math.min(60000, boundary - now)));
  }

  sync(); // Set the palette in the head before the page paints.
  function mount() { mounted = true; sync(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pageshow', sync);
})();
