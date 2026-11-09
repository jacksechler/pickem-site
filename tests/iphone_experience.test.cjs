const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
function harness({ios=true,installed=false,permission='default',subscribed=false,loggedIn=true}={}){
  const elements={},events={},statusBox={innerHTML:'',textContent:''},enableButton={disabled:false,textContent:''};
  const setupButton={isConnected:true,focus(){document.activeElement=this;}};
  const closeButton={focus(){document.activeElement=this;}};
  const body={children:[],classList:{values:new Set(),add(x){this.values.add(x)},remove(x){this.values.delete(x)},
    contains(x){return this.values.has(x)}},append(el){this.children.push(el)}};
  const document={
    activeElement:setupButton,hidden:false,body,
    createElement(tag){
      const obj={
        tag,hidden:false,innerHTML:'',className:'',id:'',events:{},
        addEventListener(name,fn){this.events[name]=fn;},
        querySelector(q){return q==='.ip-close'?closeButton:null;},
        querySelectorAll(q){return q==='button:not([disabled])'?[closeButton]:[];}
      };
      elements.created=obj;return obj;
    },
    getElementById(id){
      if(id==='ipStatus')return statusBox;
      if(id==='ipEnable')return enableButton;
      return elements[id]||null;
    },
    addEventListener(name,fn){events[name]=fn;}
  };
  let permissionRequests=0,enableRequests=0,subscriptionChecks=0;
  const navigator={
    userAgent:ios?'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X)':'Mozilla/5.0 Mac',
    standalone:installed,
    serviceWorker:{async getRegistration(){
      subscriptionChecks++;
      return {pushManager:{getSubscription:async()=>subscribed?{endpoint:'safe-test'}:null}};
    }}
  };
  const window={
    navigator,Notification:function(){},PushManager:function(){},
    matchMedia:()=>({matches:installed}),
    async enableLeagueNotifications(){enableRequests++;}
  };
  const Notification={permission,requestPermission(){permissionRequests++;return Promise.resolve(permission)}};
  const scope={document,navigator,window,Notification,session:loggedIn?{user:{id:'member'}}:null};
  vm.runInNewContext(read('iphone_experience.js'),scope,{filename:'iphone_experience.js'});
  return {window,document,statusBox,enableButton,body,setupButton,closeButton,
    get modal(){return elements.created},
    get permissionRequests(){return permissionRequests},
    get enableRequests(){return enableRequests},
    get subscriptionChecks(){return subscriptionChecks},
    click(selector){
      const t={matches(q){return q===selector}};
      elements.created.events.click({target:{closest(){return t}}});
    }
  };
}
test('iPhone home screen setup checks installation, permission and actual subscription',async()=>{
  const h=harness({installed:true,permission:'granted',subscribed:true});
  const result=await h.window.IphoneExperience.status();
  assert.equal(result.ios,true);
  assert.equal(result.installed,true);
  assert.equal(result.supported,true);
  assert.equal(result.permission,'granted');
  assert.equal(result.subscribed,true);
  assert.equal(result.subscriptionChecked,true);
});
test('iPhone Safari browser mode is not misreported as an installed web app',async()=>{
  const h=harness();
  const result=await h.window.IphoneExperience.status();
  assert.equal(result.installed,false);
  h.window.IphoneExperience.open();
  await h.window.IphoneExperience.check();
  assert.equal(h.enableButton.disabled,true);
  assert.match(h.statusBox.innerHTML,/not detected/);
  assert.match(h.enableButton.textContent,/Install to Enable Alerts/);
});
test('permission status alone is not presented as verified push delivery',async()=>{
  const h=harness({installed:true,permission:'granted',subscribed:false});
  h.window.IphoneExperience.open();await h.window.IphoneExperience.check();
  assert.match(h.statusBox.innerHTML,/subscription: not active/);
  assert.match(h.statusBox.innerHTML,/needed to verify end-to-end delivery/);
  assert.equal(h.enableButton.disabled,false);
});
test('opening guide never requests permission automatically',()=>{
  const h=harness({installed:true});
  h.window.IphoneExperience.open();
  assert.equal(h.permissionRequests,0);
  assert.equal(h.enableRequests,0);
  assert.equal(h.modal.hidden,false);
  assert.equal(h.body.classList.contains('ip-open'),true);
});
test('enable notifications happens only after an explicit tap',async()=>{
  const h=harness({installed:true});
  h.window.IphoneExperience.open();
  h.click('[data-ip-enable]');
  await Promise.resolve();await Promise.resolve();await Promise.resolve();
  assert.equal(h.enableRequests,1);
});
test('guide can be closed with the Close button and restores focus',()=>{
  const h=harness();
  h.window.IphoneExperience.open();
  assert.equal(typeof h.window.IphoneExperience.open,'function');
  h.window.IphoneExperience.close();
  assert.equal(h.modal.hidden,true);
  assert.equal(h.document.activeElement,h.setupButton);
  assert.equal(h.body.classList.contains('ip-open'),false);
});
test('logged-out users cannot open protected setup',()=>{
  const h=harness({loggedIn:false});
  h.window.IphoneExperience.open();
  assert.equal(h.modal,undefined);
});
test('installed iPhone with denied permission shows a settings requirement',async()=>{
  const h=harness({installed:true,permission:'denied'});
  h.window.IphoneExperience.open();await h.window.IphoneExperience.check();
  assert.equal(h.enableButton.disabled,true);
  assert.match(h.enableButton.textContent,/Settings/);
});
test('modals are not displayed until the user explicitly opens setup',()=>{
  const h=harness({ios:false});
  assert.equal(h.modal,undefined);
  assert.equal(h.body.children.length,0);
});
test('HTML describes web app installation, not native live activity',()=>{
  const s=read('iphone_experience.js');
  assert.match(s,/Add to Home Screen/);
  assert.match(s,/Open as Web App/);
  assert.match(s,/not a native Live Activity/);
  assert.match(s,/from a user tap/);
  assert.doesNotMatch(s,/new Notification\(/);
});
test('small mobile sheet respects safe-area and touch behavior',()=>{
  const css=read('iphone_experience.css');
  assert.match(css,/@media\(max-width:620px\)/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(css,/\.ip-overlay\[hidden\]\{display:none!important\}/);
  assert.match(css,/overscroll-behavior:contain/);
});

function updateHarness({remembered='2099.01.01.1',storageBlocked=false,remote='2099.01.01.2'}={}){
  const elements={};
  const stored=new Map([['pickemAppliedVersion',remembered]]);
  const document={
    hidden:false,addEventListener(){},
    getElementById:id=>elements[id]||null,
    createElement(){return {style:{},remove(){delete elements[this.id]}}},
    body:{appendChild(node){elements[node.id]=node;elements.pickemUpdateBtn={};}}
  };
  let destination=null;
  const window={};
  vm.runInNewContext(read('app_update.js'),{
    window,document,URL,Date,navigator:{},history:{replaceState(){}},
    location:{href:'https://example.test/pickem/?appv='+remote,replace(url){destination=url}},
    localStorage:{getItem:k=>stored.get(k),setItem(k,v){if(storageBlocked)throw Error('Storage blocked');stored.set(k,v)}},
    fetch:async()=>({ok:true,json:async()=>({version:remote})}),
    setTimeout(){},setInterval(){},console
  });
  return {window,elements,stored,get destination(){return destination}};
}
test('a remembered update cannot conceal that older code is still running',async()=>{
  const h=updateHarness();
  // Simulate a stored acknowledgement left by an older tab after this tab loaded.
  h.stored.set('pickemAppliedVersion','2099.01.01.2');
  await h.window.checkPickemUpdate();
  assert.ok(h.elements.pickemUpdateBanner);
  await h.window.forcePickemUpdate();
  assert.equal(new URL(h.destination).searchParams.get('appv'),'2099.01.01.2');
  assert.equal(h.elements.pickemUpdateBtn.disabled,true);
});
test('blocked local storage does not prevent update detection',async()=>{
  const h=updateHarness({storageBlocked:true});
  await h.window.checkPickemUpdate();
  assert.ok(h.elements.pickemUpdateBanner);
});
test('the running build does not keep prompting for its own version',async()=>{
  const current=JSON.parse(read('app-version.json')).version;
  const h=updateHarness({remote:current});
  await h.window.checkPickemUpdate();
  assert.equal(h.elements.pickemUpdateBanner,undefined);
  assert.equal(h.stored.get('pickemAppliedVersion'),current);
});
