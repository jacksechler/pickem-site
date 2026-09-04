// Unicorn styling for full pick tables and the compact mini-grid.
// Potential Unicorn = exactly one submitted player chose an undecided answer.
// Confirmed Unicorn = that unique pick is later confirmed correct.
(() => {
  const style=document.createElement('style');
  style.textContent=`
    @keyframes unicornShimmer {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }

    .potential-unicorn-pick {
      font-weight: 950 !important;
      background: linear-gradient(90deg,#67e8f9,#8b5cf6,#f472b6,#67e8f9) !important;
      background-size: 220% 100% !important;
      -webkit-background-clip: text !important;
      background-clip: text !important;
      -webkit-text-fill-color: transparent !important;
      color: #f472b6 !important;
      text-shadow: 0 0 12px rgba(103,232,249,.18),0 0 14px rgba(244,114,182,.16);
      animation: unicornShimmer 3.2s ease-in-out infinite;
    }

    .confirmed-unicorn-pick {
      font-weight: 950 !important;
      color:#fff !important;
      -webkit-text-fill-color:#fff !important;
      background: linear-gradient(120deg,#22d3ee,#6366f1,#ec4899,#f9a8d4,#22d3ee) !important;
      background-size: 260% 260% !important;
      border-color:rgba(255,255,255,.65) !important;
      box-shadow:inset 0 0 18px rgba(255,255,255,.16),0 0 16px rgba(236,72,153,.24) !important;
      text-shadow:0 1px 3px rgba(0,0,0,.45) !important;
      animation:unicornShimmer 2.4s ease-in-out infinite;
    }

    .potential-unicorn-mini {
      background:linear-gradient(#223247,#223247) padding-box,
                 linear-gradient(120deg,#22d3ee,#8b5cf6,#ec4899,#22d3ee) border-box !important;
      background-size:100% 100%,220% 220% !important;
      border:1.5px solid transparent !important;
      box-shadow:0 0 8px rgba(34,211,238,.24),0 0 9px rgba(236,72,153,.20) !important;
      animation:unicornShimmer 3.2s ease-in-out infinite;
    }

    .confirmed-unicorn-mini {
      background:linear-gradient(120deg,#22d3ee,#6366f1,#ec4899,#f9a8d4,#22d3ee) !important;
      background-size:260% 260% !important;
      border-color:rgba(255,255,255,.75) !important;
      color:#fff !important;
      box-shadow:inset 0 0 8px rgba(255,255,255,.24),0 0 10px rgba(236,72,153,.28) !important;
      animation:unicornShimmer 2.4s ease-in-out infinite;
    }
  `;
  document.head.appendChild(style);

  const cleanAnswer=v=>String(v??'').trim().replace(/^[✓✕×]\s*/, '').trim();

  function findPickTable(root){
    if(!root) return null;
    return [...root.querySelectorAll('table.table')].find(t=>
      String(t.querySelector('thead th:first-child')?.textContent||'').trim().toLowerCase()==='question'
    ) || null;
  }

  function analyzeTable(table){
    if(!table) return {states:[],userCount:0};
    const userCount=Math.max(0,table.querySelectorAll('thead th').length-1);
    const states=[];

    table.querySelectorAll('tbody tr').forEach(row=>{
      const cells=[...row.querySelectorAll('td')];
      if(cells.length<2) return;
      const label=String(cells[0].innerText||'').trim().toLowerCase();
      if(label.startsWith('tiebreaker')) return;

      const playerCells=cells.slice(1,userCount+1);
      playerCells.forEach(c=>c.classList.remove('potential-unicorn-pick','confirmed-unicorn-pick'));

      const answers=playerCells.map(c=>cleanAnswer(c.textContent));
      const counts=new Map();
      answers.forEach(a=>{ if(a && a!=='—') counts.set(a,(counts.get(a)||0)+1); });
      const isDecided=!!cells[0].querySelector('.mini.good');
      const rowStates=[];

      playerCells.forEach((cell,i)=>{
        const answer=answers[i];
        let state=null;
        if(answer && answer!=='—' && counts.get(answer)===1){
          if(!isDecided){
            state='potential';
            cell.classList.add('potential-unicorn-pick');
            cell.title='Potential Unicorn — only one player chose this';
          } else if(/^✓/.test(String(cell.textContent||'').trim())){
            state='confirmed';
            cell.classList.add('confirmed-unicorn-pick');
            cell.title='Confirmed Unicorn';
          }
        }
        rowStates.push(state);
      });
      states.push(rowStates);
    });

    return {states,userCount};
  }

  function styleMiniGrid(root,analysis){
    if(!root || !analysis.userCount || !analysis.states.length) return;
    const cards=[...root.querySelectorAll('.card')];
    const card=cards.find(c=>String(c.querySelector('.eyebrow')?.textContent||'').trim()==='SCREENSHOT GRID');
    if(!card) return;
    const grid=[...card.querySelectorAll('div')].find(d=>String(d.style.gridTemplateColumns||'').includes('repeat('));
    if(!grid) return;

    const children=[...grid.children];
    const u=analysis.userCount;
    const maxQuestionRows=Math.max(0,Math.floor((children.length-u)/u)-1); // final row is TB
    const rows=Math.min(maxQuestionRows,analysis.states.length);

    for(let r=0;r<rows;r++){
      for(let c=0;c<u;c++){
        const cell=children[u + r*u + c];
        if(!cell) continue;
        cell.classList.remove('potential-unicorn-mini','confirmed-unicorn-mini');
        if(analysis.states[r]?.[c]==='potential'){
          cell.classList.add('potential-unicorn-mini');
          cell.title='Potential Unicorn';
        } else if(analysis.states[r]?.[c]==='confirmed'){
          cell.classList.add('confirmed-unicorn-mini');
          cell.title='Confirmed Unicorn';
        }
      }
    }
  }

  function applyRoot(root){
    const table=findPickTable(root);
    const analysis=analyzeTable(table);
    styleMiniGrid(root,analysis);
  }

  function apply(){
    applyRoot(document.getElementById('leagueBox'));
    applyRoot(document.getElementById('historyBox'));
  }

  const wrapAsync=name=>{
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

  let queued=false;
  const observer=new MutationObserver(()=>{
    if(queued) return;
    queued=true;
    requestAnimationFrame(()=>{ queued=false; apply(); });
  });
  observer.observe(document.body,{subtree:true,childList:true});
  requestAnimationFrame(apply);
})();
