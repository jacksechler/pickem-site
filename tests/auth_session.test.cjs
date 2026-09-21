const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'..','auth_session.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function storage(){
  const data=new Map();
  return {
    getItem:k=>data.has(k)?data.get(k):null,
    setItem:(k,v)=>data.set(k,String(v)),
    removeItem:k=>data.delete(k)
  };
}

function response(status,body){
  return {
    status,
    ok:status>=200&&status<300,
    json:async()=>body,
    text:async()=>typeof body==='string'?body:JSON.stringify(body)
  };
}

function harness(initialSession=null){
  const localStorage=storage(),sessionStorage=storage();
  if(initialSession) localStorage.setItem('pickemSession',JSON.stringify(initialSession));
  const calls=[];
  const queue=[];
  const document={
    hidden:false,
    getElementById:()=>null,
    addEventListener:()=>{}
  };
  const context={
    console,JSON,Math,Number,String,Date,Promise,
    SUPABASE:'https://example.supabase.co',
    KEY:'publishable',
    session:initialSession,
    localStorage,sessionStorage,document,
    location:{reload:()=>{}},
    atob:s=>Buffer.from(s,'base64').toString('binary'),
    fetch:async(url,opt={})=>{
      calls.push({url,opt});
      if(!queue.length) throw new Error('No queued response for '+url);
      return queue.shift();
    },
    el:()=>null,
    normalizeUsername:v=>String(v||'').trim().toLowerCase(),
    boot:async()=>{},
    window:null
  };
  context.window=context;
  vm.createContext(context);
  new vm.Script(source,{filename:'auth_session.js'}).runInContext(context);
  return {context,calls,queue,localStorage,sessionStorage};
}

test('login page defaults to remembering the device and loads session manager before app modules',()=>{
  assert.match(html,/id="rememberDevice"[^>]*checked/);
  assert.match(html,/Keep me signed in on this device/);
  assert.match(html,/Face ID, Touch ID, or your device unlock/);
  assert.ok(html.indexOf('auth_session.js?v=1')<html.indexOf('regular_scoring_core.js?v=1'));
  assert.equal(html.includes('if(session)boot();'),false);
});

test('expired saved session refreshes with Supabase refresh token and persists rotated tokens',async()=>{
  const old={access_token:'old-access',refresh_token:'old-refresh',expires_at:1,user:{id:'u1'}};
  const h=harness(null);
  h.context.session=old;
  h.localStorage.setItem('pickemSession',JSON.stringify(old));
  const fresh={access_token:'new-access',refresh_token:'new-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'u1'}};
  h.queue.push(response(200,fresh));

  const got=await h.context.PickemAuth.refreshSession(false);
  assert.equal(got.access_token,'new-access');
  assert.equal(h.context.session.refresh_token,'new-refresh');
  assert.equal(JSON.parse(h.localStorage.getItem('pickemSession')).access_token,'new-access');
  assert.match(h.calls[0].url,/grant_type=refresh_token/);
  assert.equal(JSON.parse(h.calls[0].opt.body).refresh_token,'old-refresh');
});

test('database request retries once after a 401 using a refreshed session',async()=>{
  const now=Math.floor(Date.now()/1000);
  const h=harness(null);
  const start={access_token:'access-1',refresh_token:'refresh-1',expires_at:now+3600,user:{id:'u1'}};
  h.context.session=start;
  h.localStorage.setItem('pickemSession',JSON.stringify(start));

  const fresh={access_token:'access-2',refresh_token:'refresh-2',expires_at:now+3600,user:{id:'u1'}};
  h.queue.push(
    response(401,{message:'expired'}),
    response(200,fresh),
    response(200,[{id:'ok'}])
  );

  const rows=await h.context.db('profiles?select=id');
  assert.equal(rows[0].id,'ok');
  assert.equal(h.calls.length,3);
  assert.match(h.calls[1].url,/grant_type=refresh_token/);
  assert.equal(h.calls[2].opt.headers.Authorization,'Bearer access-2');
});
