// Mobile presentation helpers. Only changes how dense desktop content is presented on small screens.
(() => {
  const mobile = window.matchMedia('(max-width: 820px)');

  function text(value){
    return String(value ?? '').trim();
  }

  function buildMobilePickCards(table){
    if(!table || table.dataset.mobileCardsBuilt === 'true') return;
    const head = table.querySelector('thead tr');
    const bodyRows = [...table.querySelectorAll('tbody tr')];
    if(!head || !bodyRows.length) return;

    const headers = [...head.children].map(cell => text(cell.textContent));
    if(!headers.length || headers[0] !== 'Question') return;

    const holder = document.createElement('div');
    holder.className = 'mobile-pick-cards';
    holder.setAttribute('aria-label', 'League picks by question');

    bodyRows.forEach((row, rowIndex) => {
      const cells = [...row.children];
      if(!cells.length) return;
      const card = document.createElement('article');
      card.className = 'mobile-pick-card';

      const eyebrow = document.createElement('div');
      eyebrow.className = 'eyebrow';
      eyebrow.textContent = 'QUESTION ' + (rowIndex + 1);
      card.appendChild(eyebrow);

      const question = document.createElement('div');
      question.className = 'mobile-pick-question';
      question.textContent = text(cells[0].textContent) || 'Question';
      card.appendChild(question);

      const rows = document.createElement('div');
      rows.className = 'mobile-pick-rows';

      cells.slice(1).forEach((cell, index) => {
        const item = document.createElement('div');
        item.className = 'mobile-pick-row';

        const name = document.createElement('span');
        name.textContent = headers[index + 1] || 'Player ' + (index + 1);

        const pick = document.createElement('b');
        pick.textContent = text(cell.textContent) || '—';

        item.append(name, pick);
        rows.appendChild(item);
      });

      card.appendChild(rows);
      holder.appendChild(card);
    });

    table.appendChild(holder);
    table.dataset.mobileCardsBuilt = 'true';
  }

  function enhancePickTables(root){
    if(!root) return;
    root.querySelectorAll('.tablewrap > table').forEach(table => {
      buildMobilePickCards(table);
    });
  }

  function refresh(){
    const league = document.getElementById('leagueBox');
    const history = document.getElementById('historyBox');
    enhancePickTables(league);
    enhancePickTables(history);
  }

  function install(){
    refresh();
    const observe = root => {
      if(!root) return;
      const observer = new MutationObserver(() => {
        requestAnimationFrame(refresh);
      });
      observer.observe(root, {childList:true, subtree:true});
    };
    observe(document.getElementById('leagueBox'));
    observe(document.getElementById('historyBox'));

    mobile.addEventListener('change', refresh);
  }

  install();
})();
