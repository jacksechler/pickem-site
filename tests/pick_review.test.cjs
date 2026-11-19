const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
function harness(){
  const nodes=new Map(),writes=[],alerts=[];
  const get=id=>{
    if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',disabled:false,style:{},buttons:[],_html:'',
      get innerHTML(){return this._html;},
      set innerHTML(value){
        this._html=value;
        if(id==='pickBox'){
          const tb=value.match(/id="tbInput"[^>]*value="([^"]*)"/);
          if(tb)get('tbInput').value=tb[1];else nodes.delete('tbInput');
          this.buttons=[...value.matchAll(/data-review-edit="(\d+)"/g)].map(m=>({dataset:{reviewEdit:m[1]}}));
        }
      },
      querySelectorAll(selector){return selector==='[data-review-edit]'||selector==='button'?this.buttons:[];}
    });
    return nodes.get(id);
  };
  const context={
    session:{user:{id:'me'}},week:{id:'week',name:'Week 12',questions_released_at:'2026-11-18',tiebreaker_prompt:'Total points?'},
    questions:[{id:'q1',prompt:'A or B?',answer_options:['A','B']},{id:'q2',prompt:'C or D?',answer_options:['C','D']},{id:'fun',prompt:'Just for fun?',counts_for_score:false}],
    myPicks:{q1:'A',q2:'D'},submission:null,step:3,
    el:id=>id==='tbInput'&&!nodes.has(id)?null:get(id),
    esc:value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
    alert:msg=>alerts.push(msg),renderHome(){},locked:()=>!!context.week?.auto_locked_at,
    db:async(path,opt)=>{
      if(opt){const body=JSON.parse(opt.body);writes.push({path,...opt,body});return path.startsWith('submissions')?[body]:null;}
      return [context.week];
    }
  };
  context.window=context;
  vm.createContext(context);
  vm.runInContext(html.slice(html.indexOf('function renderPicks(){'),html.indexOf('async function renderLeague(){')),context);
  vm.runInContext(fs.readFileSync('pick_review.js','utf8'),context);
  const input=value=>{get('tbInput').value=value;get('tbInput').oninput?.();};
  return {c:context,get,writes,alerts,input};
}
test('review shows every saved answer, missing optional picks, and unsubmitted status',()=>{
  const {c,get}=harness();c.renderPicks();
  assert.match(get('pickBox').innerHTML,/Review your picks/);
  assert.match(get('pickBox').innerHTML,/Not submitted/);
  assert.match(get('pickBox').innerHTML,/A or B\?/);
  assert.match(get('pickBox').innerHTML,/C or D\?/);
  assert.match(get('pickBox').innerHTML,/Just for fun · not scored/);
  assert.equal(get('nextPickBtn').disabled,false,'unanswered optional question does not block submission');
});
test('missing scored picks and invalid tiebreaker cannot submit',async()=>{
  const {c,get,writes,alerts,input}=harness();
  c.myPicks={};c.renderPicks();assert.equal(get('nextPickBtn').disabled,true);
  input('42');await c.nextPick();assert.equal(writes.length,0);assert.match(alerts.pop(),/every scored pick/);
  c.myPicks={q1:'A',q2:'C'};c.renderPicks();
  for(const value of ['', 'Infinity', 'nonsense']){input(value);await c.nextPick();}
  assert.equal(writes.length,0);assert.equal(alerts.length,3);
});
test('editing a review pick returns to the review without losing the tiebreaker',async()=>{
  const {c,get,input,writes}=harness();c.renderPicks();input('42.5');
  get('pickBox').buttons[0].onclick();assert.equal(c.step,0);
  await c.choosePick('q1','B');assert.equal(c.myPicks.q1,'B');assert.equal(c.step,3);
  assert.equal(get('tbInput').value,'42.5');
  assert.equal(writes.length,1);assert.match(writes[0].path,/^picks\?/);
});
test('confirmed submission displays receipt and remains confirmed if lock refresh fails',async()=>{
  const {c,get,input}=harness();c.renderPicks();input('0');
  c.db=async(path,opt)=>{if(opt)return [JSON.parse(opt.body)];throw Error('Read failed');};
  await c.nextPick();
  assert.equal(c.submission.tiebreaker_answer,0);
  assert.match(get('pickBox').innerHTML,/Submitted at/);
  assert.equal(get('nextPickBtn').textContent,'Save entry changes');
});
test('failed or unconfirmed submission never displays a success receipt and retains answers',async()=>{
  for(const response of ['reject','empty','other-user']){
    const {c,get,input}=harness();c.renderPicks();input('42');
    c.db=async()=>{if(response==='reject')throw Error('Offline');return response==='empty'?[]:[{week_id:'week',user_id:'someone-else',submitted_at:'now'}];};
    await c.nextPick();
    assert.equal(c.submission,null);assert.equal(c.myPicks.q1,'A');assert.equal(get('tbInput').value,'42');
    assert.match(get('pickReviewStatus').textContent,/Could not confirm/);
    assert.equal(get('nextPickBtn').disabled,false);
    assert.doesNotMatch(get('pickBox').innerHTML,/Submitted at/);
  }
});
test('last entry triggering early lock gets a confirmed read-only review',async()=>{
  const {c,get,input}=harness();c.renderPicks();input('42');
  c.db=async(path,opt)=>opt?[JSON.parse(opt.body)]:[{...c.week,auto_locked_at:'2026-11-19T14:00:00Z'}];
  await c.nextPick();
  assert.match(get('pickBox').innerHTML,/Submitted at/);
  assert.match(get('pickBox').innerHTML,/Your entry is locked/);
  assert.doesNotMatch(get('pickBox').innerHTML,/data-review-edit/);
  assert.equal(get('nextPickBtn').disabled,true);
});
test('locked or unreleased weeks cannot be mutated through review handlers',async()=>{
  const {c,writes,input}=harness();c.renderPicks();input('42');
  c.week.auto_locked_at='now';await c.PickReview.choose('q1','B');await c.PickReview.submit();
  c.week.auto_locked_at=null;c.week.questions_released_at=null;
  await c.PickReview.choose('q1','B');await c.PickReview.submit();assert.equal(writes.length,0);
});
test('double clicks cannot duplicate writes or skip two questions',async()=>{
  const {c}=harness();let resolve,calls=0;
  c.step=0;c.renderPicks();c.db=()=>{calls++;return new Promise(r=>resolve=r);};
  const first=c.choosePick('q1','B');await c.choosePick('q1','A');await c.nextPick();c.previousPick();
  assert.equal(calls,1);assert.equal(c.step,0);
  resolve(null);await first;assert.equal(c.step,1);assert.equal(c.myPicks.q1,'B');
});
test('a response from an old week cannot replace the current entry',async()=>{
  const {c,input}=harness();let resolve;
  c.renderPicks();input('42');c.db=(path,opt)=>new Promise(r=>resolve=()=>r([JSON.parse(opt.body)]));
  const pending=c.nextPick();c.week={...c.week,id:'new-week'};resolve();await pending;
  assert.equal(c.submission,null);assert.equal(c.week.id,'new-week');
});
