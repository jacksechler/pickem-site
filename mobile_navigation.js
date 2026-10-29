// Compact, thumb-friendly navigation for the mobile Pick'em site.
// Desktop sidebar navigation and the existing page router remain untouched.
(() => {
  const app=document.getElementById('app');
  if(!app||document.getElementById('mobileNav'))return;
  const media=window.matchMedia('(max-width: 820px)');
  const primary=[
    {id:'home',label:'Home',icon:'home'},
    {id:'picks',label:'My Picks',icon:'picks'},
    {id:'league',label:'League',icon:'league'},
    {id:'standings',label:'Standings',icon:'standings'}
  ];
  const groups=[
    {title:'THE SEASON',items:[
      {id:'playoffs',label:'Playoffs',detail:'Brackets & survival',icon:'trophy'},
      {id:'championship',label:'Championship',detail:'The final matchup',icon:'trophy'},
      {id:'sharegrid',label:'Share Pick Grid',detail:'All members at a glance',icon:'grid'},
      {id:'seasoncalendar',label:'Season Calendar',detail:'Upcoming weeks',icon:'calendar'}
    ]},
    {title:'COVERAGE & STATS',items:[
      {id:'news',label:'LTSPN',detail:'League news articles',icon:'news'},
      {id:'studio',label:'SportsCenter',detail:'Weekly rundown',icon:'studio'},
      {id:'stats',label:'Stats & Records',detail:'Player numbers',icon:'stats'},
      {id:'awards',label:'Awards',detail:'Hall of Fame',icon:'award'}
    ]},
    {title:'MANAGEMENT',items:[
      {id:'commissioner',label:'Commissioner',detail:'League administration',icon:'settings'}
    ]}
  ];
  const glyph={
    home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    picks:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 9 2 2 5-5M8 16h8"/>',
    league:'<path d="M4 19V5m0 14h16M7 16v-5m5 5V8m5 8V5"/>',
    standings:'<path d="M3 21h18M5 18v-6h4v6m2 0V8h4v10m2 0V4h4v14"/>',
    more:'<circle cx="5" cy="12" r="1.25"/><circle cx="12" cy="12" r="1.25"/><circle cx="19" cy="12" r="1.25"/>',
    trophy:'<path d="M8 21h8m-4-4v4M7 4h10v6a5 5 0 0 1-10 0V4Zm0 2H4v3a4 4 0 0 0 4 4m9-7h3v3a4 4 0 0 1-4 4"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
    news:'<path d="M4 4h14v16H6a2 2 0 0 1-2-2V4Zm14 4h2v10a2 2 0 0 1-2 2M8 9h6M8 13h6M8 17h4"/>',
    studio:'<rect x="4" y="8" width="16" height="11" rx="2"/><path d="m8 8 3-5h4l-3 5M8 12h8M8 15h5"/>',
    stats:'<path d="M4 19V9m6 10V5m6 14v-8m5 8H2"/>',
    award:'<circle cx="12" cy="9" r="5"/><path d="m9 13-2 8 5-2 5 2-2-8"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>'
  };
  const icon=id=>'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round">'+glyph[id]+'</svg>';
  const create=(tag,cls)=>{const node=document.createElement(tag);node.className=cls;return node;};
  const bar=create('nav','mnav-bar');
  bar.id='mobileNav';
  bar.setAttribute('aria-label','Mobile primary navigation');
  const buttons=new Map();
  primary.forEach(item=>{
    const b=create('button','mnav-tab');
    b.type='button';b.dataset.mobilePage=item.id;
    b.setAttribute('aria-label',item.label);
    b.innerHTML=icon(item.icon)+'<span>'+item.label+'</span>';
    b.addEventListener('click',()=>navigate(item.id));
    bar.append(b);buttons.set(item.id,b);
  });
  const more=create('button','mnav-tab mnav-more');
  more.type='button';more.id='mobileMore';
  more.setAttribute('aria-label','All pages');
  more.setAttribute('aria-expanded','false');
  more.setAttribute('aria-controls','mobilePageMenu');
  more.innerHTML=icon('more')+'<span>More</span>';
  bar.append(more);
  const overlay=create('div','mnav-overlay');
  overlay.id='mobileNavOverlay';overlay.hidden=true;
  const backdrop=create('div','mnav-backdrop');
  backdrop.setAttribute('aria-hidden','true');
  const panel=create('section','mnav-sheet');
  panel.id='mobilePageMenu';panel.setAttribute('role','dialog');
  panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','mobileMenuTitle');
  const top=create('div','mnav-sheet-top');
  const heading=create('div','mnav-sheet-heading');
  const h=create('h2','');h.id='mobileMenuTitle';h.textContent='Explore the League';
  const p=create('p','');p.textContent='Every page is one tap away.';
  heading.append(h,p);
  const close=create('button','mnav-close');close.type='button';close.id='mobileMenuClose';
  close.setAttribute('aria-label','Close page menu');close.textContent='✕';
  top.append(heading,close);
  const content=create('div','mnav-sheet-content');
  panel.append(top,content);overlay.append(backdrop,panel);
  app.append(overlay,bar);
  let lastPage=null,returnFocus=null;
  const sourceButton=id=>document.querySelector('.topinner > nav button[data-page="'+id+'"]');
  const allowed=id=>{
    const original=sourceButton(id);
    if(!original||original.classList.contains('hidden'))return false;
    const page=document.getElementById(id);
    return !!page&&!page.classList.contains('unavailable');
  };
  const selected=()=>document.querySelector('main .page:not(.hidden)')?.id||'home';
  function update(active=selected()){
    const effective=active==='gameday'?'league':active;
    lastPage=active;
    buttons.forEach((button,id)=>{
      const on=effective===id;
      button.classList.toggle('is-active',on);
      if(on)button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    });
    const other=!buttons.has(effective);
    more.classList.toggle('is-active',other);
    if(other)more.setAttribute('aria-current','page');
    else more.removeAttribute('aria-current');
    content.querySelectorAll('button[data-mobile-page]').forEach(b=>{
      const on=b.dataset.mobilePage===active;
      b.classList.toggle('is-active',on);
      if(on)b.setAttribute('aria-current','page');
      else b.removeAttribute('aria-current');
    });
  }
  function renderMenu(){
    content.replaceChildren();
    for(const group of groups){
      const items=group.items.filter(item=>allowed(item.id));
      if(!items.length)continue;
      const section=create('section','mnav-group');
      const label=create('h3','mnav-group-label');label.textContent=group.title;
      section.append(label);
      const grid=create('div','mnav-grid');
      items.forEach(item=>{
        const b=create('button','mnav-menu-item');
        b.type='button';b.dataset.mobilePage=item.id;
        b.setAttribute('aria-label',item.label);
        const art=create('span','mnav-menu-icon');art.innerHTML=icon(item.icon);
        const words=create('span','mnav-menu-words');
        const strong=create('strong','');strong.textContent=item.label;
        const small=create('small','');small.textContent=item.detail;
        words.append(strong,small);
        b.append(art,words);
        b.addEventListener('click',()=>navigate(item.id));
        grid.append(b);
      });
      section.append(grid);content.append(section);
    }
    update(lastPage||selected());
  }
  function isOpen(){return !overlay.hidden;}
  function open(){
    if(!media.matches||isOpen())return;
    returnFocus=document.activeElement;
    renderMenu();overlay.hidden=false;more.setAttribute('aria-expanded','true');
    document.body.classList.add('mnav-open');
    const active=content.querySelector('.is-active');
    (active||close).focus();
  }
  function dismiss(restore=true){
    if(!isOpen())return;
    overlay.hidden=true;more.setAttribute('aria-expanded','false');
    document.body.classList.remove('mnav-open');
    if(restore&&(returnFocus?.isConnected?returnFocus:more)?.focus){
      (returnFocus?.isConnected?returnFocus:more).focus();
    }
    returnFocus=null;
  }
  function navigate(id){
    if(!allowed(id))return;
    dismiss(false);
    const original=sourceButton(id);
    window.showPage?.(id,original);
    update(id);
  }
  more.addEventListener('click',()=>isOpen()?dismiss():open());
  close.addEventListener('click',()=>dismiss());
  backdrop.addEventListener('click',()=>dismiss());
  overlay.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();dismiss();return;}
    if(event.key!=='Tab')return;
    const focusables=[...panel.querySelectorAll('button:not([disabled])')].filter(b=>b.offsetParent!==null);
    if(!focusables.length)return;
    const first=focusables[0],last=focusables.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&isOpen()){event.preventDefault();dismiss();}
  });
  const originalShow=window.showPage;
  if(typeof originalShow==='function')window.showPage=function(id){
    const result=originalShow.apply(this,arguments);
    dismiss(false);update(id);return result;
  };
  const onBreakpoint=()=>{dismiss(false);update();};
  if(media.addEventListener)media.addEventListener('change',onBreakpoint);
  else if(media.addListener)media.addListener(onBreakpoint);
  // Profile, GameDay and commissioner pages may be opened by their own modules
  // without calling the page router. Observe page visibility for accurate indicators.
  const pages=document.getElementById('mainContent');
  if(pages&&typeof MutationObserver!=='undefined'){
    const observer=new MutationObserver(records=>{
      if(records.some(r=>r.attributeName==='class'&&r.target.classList.contains('page')))update();
    });
    observer.observe(pages,{attributes:true,attributeFilter:['class'],subtree:true});
  }
  update();
  window.MobileNavigation={open,close:dismiss,navigate,update,isOpen};
})();