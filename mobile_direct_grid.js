// Final mobile League Picks renderer: show the real Question × Player matrix directly.
// This runs after all other League rendering wrappers, so mobile cannot fall back to
// the older card-based presentation.
(() => {
  const mobile = window.matchMedia('(max-width: 820px)');
  const original = window.renderLeague;
  if (typeof original !== 'function') return;

  function isolateMatrix() {
    if (!mobile.matches) return;
    const box = document.getElementById('leagueBox');
    if (!box) return;

    const tables = [...box.querySelectorAll('table')];
    const table = tables.find(t => (t.querySelector('thead th')?.textContent || '').trim() === 'Question');
    if (!table) return;

    const matrix = table.closest('.tablewrap') || table.parentElement;
    if (!matrix) return;

    const selector = box.querySelector('select[onchange*="setLeagueHistoryWeek"]');
    const toolbar = selector?.closest('.card');
    const title = [...box.querySelectorAll('.card')].find(card =>
      /LEAGUE PICKS|Live Pick Board|FINAL WEEK|LIVE WEEK/.test(card.textContent || '')
    );

    const newWrap = document.createElement('div');
    newWrap.className = 'card tablewrap mobile-direct-grid';
    newWrap.style.cssText = 'padding:0;width:100%;max-width:100%;overflow-x:auto!important;overflow-y:hidden!important;-webkit-overflow-scrolling:touch;';
    newWrap.appendChild(matrix.firstElementChild === table ? table : matrix.querySelector('table'));

    // Keep only the week selector + actual matrix on phones.
    box.innerHTML = '';
    if (toolbar) box.appendChild(toolbar);
    else if (selector) box.appendChild(selector.closest('.card') || selector);
    box.appendChild(newWrap);

    const finalTable = newWrap.querySelector('table');
    if (finalTable) {
      finalTable.style.display = 'table';
      finalTable.style.width = 'max-content';
      finalTable.style.minWidth = '1100px';
    }
  }

  window.renderLeague = async function() {
    await original.apply(this, arguments);
    requestAnimationFrame(isolateMatrix);
  };

  const box = document.getElementById('leagueBox');
  if (box) {
    new MutationObserver(() => {
      if (mobile.matches) requestAnimationFrame(isolateMatrix);
    }).observe(box, {childList:true, subtree:true});
  }
  mobile.addEventListener('change', isolateMatrix);
})();
