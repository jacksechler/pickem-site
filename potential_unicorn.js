// Highlight potential Unicorn picks: exactly one submitted player chose that answer on an undecided question.
(() => {
  function markPotentialUnicorns(root){
    if(!root) return;
    root.querySelectorAll('table.table tbody tr').forEach(row=>{
      const cells=[...row.querySelectorAll('td')];
      if(cells.length<2) return;
      const label=(cells[0].innerText||'').trim().toLowerCase();
      if(label.startsWith('tiebreaker')) return;
      // Decided rows already have result text in the question cell and should use green/red styling instead.
      if(cells[0].querySelector('.mini.good')) return;

      const playerCells=cells.slice(1);
      const counts=new Map();
      playerCells.forEach(cell=>{
        const value=(cell.textContent||'').trim();
        if(!value || value==='—') return;
        counts.set(value,(counts.get(value)||0)+1);
      });

      playerCells.forEach(cell=>{
        const value=(cell.textContent||'').trim();
        cell.style.removeProperty('color');
        cell.style.removeProperty('font-weight');
        cell.style.removeProperty('text-shadow');
        if(value && value!=='—' && counts.get(value)===1){
          cell.style.setProperty('color','var(--gold)','important');
          cell.style.setProperty('font-weight','950','important');
          cell.style.setProperty('text-shadow','0 0 10px rgba(251,191,36,.18)');
          cell.title=(cell.title?cell.title+' · ':'')+'Potential Unicorn';
        }
      });
    });
  }

  function apply(){
    markPotentialUnicorns(document.getElementById('leagueBox'));
    markPotentialUnicorns(document.getElementById('historyBox'));
  }

  const wrapAsync=(name)=>{
    const base=window[name];
    if(typeof base!=='function') return;
    window[name]=async function(...args){
      const out=await base.apply(this,args);
      requestAnimationFrame(apply);
      return out;
    };
  };

  wrapAsync('renderLeague');
  wrapAsync('renderHistory');

  const observer=new MutationObserver(()=>requestAnimationFrame(apply));
  observer.observe(document.body,{subtree:true,childList:true});
  requestAnimationFrame(apply);
})();
