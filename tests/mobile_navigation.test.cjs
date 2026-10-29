const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const primary=['home','picks','league','standings'];
const more=['playoffs','championship','sharegrid','seasoncalendar','news','studio','stats','awards','commissioner'];
function harness({desktop=false,commissioner=false,playoffs=true}={}){
  let document;
  const nodes=[];
  class Element {
    constructor(tag='div'){
      this.tagName=tag.toUpperCase();this.id='';this.children=[];this.parent=null;
      this._classes=new Set();this.hidden=false;this.dataset={};this.attrs={};this.events={};
      this.textContent='';this._html='';this.disabled=false;
      this.classList={
        contains:name=>this._classes.has(name),
        add:(...xs)=>xs.forEach(x=>this._classes.add(x)),
        remove:(...xs)=>xs.forEach(x=>this._classes.delete(x)),
        toggle:(name,on)=>{const next=on===undefined?!this._classes.has(name):on;
          if(next)this._classes.add(name);else this._classes.delete(name);return next;}
      };nodes.push(this);
    }
    get className(){return [...this._classes].join(' ')}
    set className(v){this._classes=new Set(String(v).split(/\s+/).filter(Boolean))}
    get innerHTML(){return this._html}
    set innerHTML(v){this._html=String(v)}
    get isConnected(){return true}
    get offsetParent(){return {}}
    setAttribute(k,v){this.attrs[k]=String(v)}
    getAttribute(k){return this.attrs[k]??null}
    removeAttribute(k){delete this.attrs[k]}
    addEventListener(type,fn){(this.events[type]??=[]).push(fn)}
    append(...items){items.forEach(x=>{x.parent=this;this.children.push(x)})}
    replaceChildren(...items){this.children=[];this.append(...items)}
    focus(){document.activeElement=this}
    emit(type,obj={}){for(const fn of this.events[type]||[])fn({
      target:this,key:obj.key,shiftKey:obj.shiftKey,preventDefault(){obj.prevented=true;}
    });return obj}
    all(){return this.children.flatMap(x=>[x,...x.all()])}
    querySelectorAll(q){
      if(q==='button[data-mobile-page]')return this.all().filter(x=>x.tagName==='BUTTON'&&x.dataset.mobilePage);
      if(q==='button:not([disabled])')return this.all().filter(x=>x.tagName==='BUTTON'&&!x.disabled);
      if(q==='button[data-page]')return this.all().filter(x=>x.tagName==='BUTTON'&&x.dataset.page);
      throw Error('Unsupported querySelectorAll '+q)
    }
    querySelector(q){
      if(q==='.is-active')return this.all().find(x=>x.classList.contains('is-active'))||null;
      throw Error('Unsupported querySelector '+q)
    }
  }
  const app=new Element();app.id='app';
  const content=new Element('main');content.id='mainContent';app.append(content);
  const originalButtons=new Map();
  for(const id of [...primary,...more]){
    const page=new Element('section');page.id=id;page.classList.add('page');
    if(id!=='home')page.classList.add('hidden');
    content.append(page);
    const source=new Element('button');source.dataset.page=id;
    if(id==='commissioner'&&!commissioner)source.classList.add('hidden');
    if(id==='playoffs'&&!playoffs)source.classList.add('hidden');
    originalButtons.set(id,source);
  }
  const body=new Element('body');
  const listeners={};
  document={
    body,activeElement:null,
    getElementById(id){return nodes.find(n=>n.id===id)||null},
    createElement:tag=>new Element(tag),
    querySelector(q){
      const original=q.match(/^\.topinner > nav button\[data-page="([^"]+)"\]$/);
      if(original)return originalButtons.get(original[1])||null;
      if(q==='main .page:not(.hidden)')return content.children.find(n=>n.classList.contains('page')&&!n.classList.contains('hidden'))||null;
      throw Error('Unsupported document querySelector '+q);
    },
    addEventListener(type,fn){(listeners[type]??=[]).push(fn)},
    emit(type,event){for(const fn of listeners[type]||[])fn(event)}
  };
  const media={
    matches:!desktop,
    events:[],
    addEventListener(type,cb){if(type==='change')this.events.push(cb)},
    update(v){this.matches=v;this.events.forEach(cb=>cb({matches:v}))}
  };
  const history=[];
  const window={
    matchMedia:()=>media,
    showPage(id,source){
      history.push({id,source:source?.dataset?.page});
      content.children.forEach(p=>p.classList.toggle('hidden',p.id!==id));
    }
  };
  const observer=[];
  class MutationObserverMock {
    constructor(cb){observer.push(cb)}
    observe(){}
  }
  const scope={document,window,MutationObserver:MutationObserverMock};
  vm.runInNewContext(read('mobile_navigation.js'),scope,{filename:'mobile_navigation.js'});
  return {document,window,app,body,media,nodes,history,originalButtons,
    bar:document.getElementById('mobileNav'),
    moreButton:document.getElementById('mobileMore'),
    overlay:document.getElementById('mobileNavOverlay'),
    menu:document.getElementById('mobilePageMenu'),
    close:document.getElementById('mobileMenuClose'),
    content,
    show:id=>window.MobileNavigation.navigate(id),
    open:()=>window.MobileNavigation.open(),
    dismiss:()=>window.MobileNavigation.close()};
}
test('five mobile targets replace the cluttered seven-tab dock',()=>{
 const h=harness();
 const targets=h.bar.children.filter(n=>n.tagName==='BUTTON');
 assert.equal(targets.length,5);
 assert.deepEqual([...targets.slice(0,4).map(n=>n.dataset.mobilePage)],primary);
 assert.equal(targets[4].id,'mobileMore');
 assert.equal(h.bar.getAttribute('aria-label'),'Mobile primary navigation');
 assert.match(h.bar.children[0].innerHTML,/<svg/);
});
test('More contains all league pages, grouped by season, reporting and management',()=>{
 const h=harness({commissioner:true});h.open();
 const items=h.menu.querySelectorAll('button[data-mobile-page]').map(b=>b.dataset.mobilePage);
 assert.deepEqual([...items],more);
 assert.equal(h.menu.getAttribute('role'),'dialog');
 assert.equal(h.menu.getAttribute('aria-modal'),'true');
 assert.equal(h.moreButton.getAttribute('aria-expanded'),'true');
 assert.equal(h.overlay.hidden,false);
 assert.equal(h.body.classList.contains('mnav-open'),true);
});
test('commissioner-only and not-yet-available playoff destinations are omitted',()=>{
 const h=harness({commissioner:false,playoffs:false});h.open();
 const items=h.menu.querySelectorAll('button[data-mobile-page]').map(b=>b.dataset.mobilePage);
 assert.equal(items.includes('commissioner'),false);
 assert.equal(items.includes('playoffs'),false);
 assert.equal(items.includes('championship'),true);
});
test('tap primary destination uses the existing showPage router',()=>{
 const h=harness();h.show('picks');
 assert.deepEqual(h.history,[{id:'picks',source:'picks'}]);
 assert.equal(h.content.children.find(p=>p.id==='picks').classList.contains('hidden'),false);
 assert.equal(h.bar.children[1].getAttribute('aria-current'),'page');
 assert.equal(h.bar.children[0].getAttribute('aria-current'),null);
});
test('More menu destinations open the correct page and close overlay',()=>{
 const h=harness();h.open();
 const award=h.menu.querySelectorAll('button[data-mobile-page]').find(x=>x.dataset.mobilePage==='awards');
 award.emit('click');
 assert.equal(h.history.at(-1).id,'awards');
 assert.equal(h.moreButton.getAttribute('aria-current'),'page');
 assert.equal(h.moreButton.getAttribute('aria-expanded'),'false');
 assert.equal(h.overlay.hidden,true);
 assert.equal(h.body.classList.contains('mnav-open'),false);
});
test('programmatic navigation updates active highlight after desktop router call',()=>{
 const h=harness();h.window.showPage('news',h.originalButtons.get('news'));
 assert.equal(h.moreButton.getAttribute('aria-current'),'page');
 h.window.showPage('league',h.originalButtons.get('league'));
 assert.equal(h.bar.children[2].getAttribute('aria-current'),'page');
 assert.equal(h.moreButton.getAttribute('aria-current'),null);
});
test('Escape closes More and returns focus to the trigger',()=>{
 const h=harness();h.moreButton.focus();h.moreButton.emit('click');
 assert.notEqual(h.document.activeElement,h.moreButton);
 h.overlay.emit('keydown',{key:'Escape'});
 assert.equal(h.overlay.hidden,true);
 assert.equal(h.document.activeElement,h.moreButton);
});
test('backdrop and close button both dismiss without changing the active page',()=>{
 const h=harness();h.open();
 h.overlay.children[0].emit('click');
 assert.equal(h.overlay.hidden,true);
 h.open();h.close.emit('click');
 assert.equal(h.overlay.hidden,true);
 assert.equal(h.history.length,0);
});
test('desktop retains its existing nav and cannot open mobile overlay',()=>{
 const h=harness({desktop:true});h.open();
 assert.equal(h.overlay.hidden,true);
 assert.equal(h.history.length,0);
 h.media.update(true);h.open();assert.equal(h.overlay.hidden,false);
 h.media.update(false);assert.equal(h.overlay.hidden,true);
});
test('mobile never navigates into hidden commissioner pages',()=>{
 const h=harness();h.show('commissioner');
 assert.equal(h.history.length,0);
});
test('mobile nav is scoped to app and does not duplicate original data-page selectors',()=>{
 const h=harness();assert.equal(h.bar.parent,h.app);assert.equal(h.overlay.parent,h.app);
 assert.equal(h.bar.querySelectorAll('button[data-mobile-page]').length,4);
 assert.equal(h.bar.children.every(n=>n.dataset.page===undefined),true);
});
test('mobile CSS intentionally hides the legacy nav and gives bottom bar five equal columns',()=>{
 const css=read('mobile_navigation.css');
 assert.match(css,/\.clean-ui \.topinner > nav\{display:none!important\}/);
 assert.match(css,/grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
 assert.match(css,/padding-bottom:calc\(108px \+ env\(safe-area-inset-bottom\)\)!important/);
 assert.match(css,/\.mnav-overlay\[hidden\]\{display:none!important\}/);
 assert.match(css,/max-height:calc\(100dvh/);
 assert.match(css,/@media\(max-width:820px\)/);
});
test('JS and CSS load after prior mobile and page scripts, without changing the desktop sidebar',()=>{
 const html=read('index.html');
 const old=html.indexOf('league_extras.js?v=2');
 const newJS=html.indexOf('mobile_navigation.js?v=1');
 const oldCss=html.indexOf('mobile_polish.css?v=3');
 const newCss=html.indexOf('mobile_navigation.css?v=1');
 assert.ok(old>=0&&newJS>old&&oldCss>=0&&newCss>oldCss);
 assert.match(read('mobile_navigation.js'),/const originalShow=window.showPage/);
});
