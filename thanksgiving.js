/* Thanksgiving 2026: display only, expires at midnight Eastern Nov 27. */
(() => {
  const START = Date.parse('2026-11-19T00:00:00-05:00');
  const END = Date.parse('2026-11-27T00:00:00-05:00');
  const root = document.documentElement;
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const originalColor = themeMeta?.getAttribute('content');
  function sync() {
    const now = Date.now();
    const active = now >= START && now < END;
    root.classList.toggle('thanksgiving', active);
    if (themeMeta) themeMeta.setAttribute('content', active ? '#21140f' : originalColor);
    document.querySelectorAll('[data-thanksgiving]').forEach(node => { node.hidden = !active; });
  }
  function mount() {
    const main = document.getElementById('mainContent');
    if (main && !document.getElementById('thanksgivingFeast')) {
      const banner = document.createElement('aside');
      banner.id = 'thanksgivingFeast';
      banner.className = 'tg-feast';
      banner.setAttribute('data-thanksgiving', '');
      banner.setAttribute('aria-label', 'Thanksgiving week');
      banner.innerHTML = '<div class="tg-garland" aria-hidden="true">🍁 🍂 🌽 🍁 🥧 🍂 🍁</div><div class="tg-feast-body"><span class="tg-turkey" aria-hidden="true">🦃</span><div class="tg-copy"><div class="tg-kicker">NOVEMBER 19–26</div><h2>Thanksgiving Week</h2></div><span class="tg-harvest" aria-hidden="true">🎃<span>🏈 🍁</span></span></div>';
      main.prepend(banner);
    }
    const auth = document.getElementById('auth');
    if (auth && !document.getElementById('thanksgivingWelcome')) {
      const welcome = document.createElement('div');
      welcome.id = 'thanksgivingWelcome';
      welcome.className = 'tg-welcome';
      welcome.setAttribute('data-thanksgiving', '');
      welcome.innerHTML = '<span aria-hidden="true">🍁 🦃 🥧 🎃 🍂</span><strong>Thanksgiving Week</strong><small>November 19–26</small>';
      auth.prepend(welcome);
    }
    sync();
  }
  sync();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
  setInterval(sync, 30000);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pageshow', sync);
})();
