// Mobile layout keeps League Picks as the full question-by-player grid.
(() => {
  const mobile = window.matchMedia('(max-width: 820px)');
  function refresh(){
    document.querySelectorAll('#leagueBox .tablewrap, #historyBox .tablewrap').forEach(wrap => {
      if (!mobile.matches) return;
      wrap.classList.add('mobile-picks-ready');
      const table = wrap.querySelector(':scope > table');
      if (table) table.style.display = 'table';
      wrap.querySelector('.mobile-pick-cards')?.remove();
    });
  }
  const watch = id => {
    const root=document.getElementById(id); if(!root) return;
    new MutationObserver(() => requestAnimationFrame(refresh)).observe(root,{childList:true,subtree:true});
  };
  refresh(); watch('leagueBox'); watch('historyBox'); mobile.addEventListener('change',refresh);
})();
