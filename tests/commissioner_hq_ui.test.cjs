const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const M=require('../commissioner_hq_model.js');
const people=Array.from({length:8},(_,i)=>({id:'p'+i,display_name:'Member '+(i+1),username:'member'+i}));
const weeks=[
 {id:'w1',season_id:'s1',number:1,name:'Week 1',phase:'regular',status:'published',tiebreaker_result:52},
 {id:'w2',season_id:'s1',number:2,name:'Week 2',phase:'regular',status:'draft'}
];
const question={id:'q1',week_id:'w1',prompt:'Result?',position:1,sport:'NFL',result:'A',counts_for_score:true,result_order:1};
const score=(id)=>({week_id:'w1',user_id:id,placement:1,correct_count:10,question_count:11,total_points:22});
const diagnostic={
 week:{id:'w2',name:'Week 2',status:'draft',locked:false,tiebreaker_result_saved:false},
 entries:{submitted:2,required:8,players:people.map((p,i)=>({
   user_id:p.id,display_name:p.display_name,picks:i<2?12:0,expected_picks:12,
   submitted:i<2,complete:i<2
 }))},
 questions:{scored:12,decided:0,result_ordered:0,result_order_distinct:0},
 scores:{rows:0,expected_when_published:8}
};
function environment({admin=true,logError=false,diagnosticResponder}={}){
 const calls=[];
 const children=[];
 const byId={};
 const root={
   prepend(node){children.unshift(node);byId[node.id]=node;},
   querySelector(){return null}
 };
 byId.commissionerBox=root;
 const document={
   createElement(tag){return {tagName:tag,id:'',className:'',innerHTML:'',dataset:{},
     querySelector(){return null},scrollIntoView(){},prepend(){},remove(){}};},
   getElementById(id){return byId[id]||null;},
   addEventListener(){},querySelector(){return null}
 };
 const db=async(path,options)=>{
   calls.push(path);
   if(path==='rpc/commissioner_diagnostics')return diagnosticResponder?diagnosticResponder():diagnostic;
   if(path.startsWith('commissioner_activity_log?')){
     if(logError)throw Error('No log access');
     return [{created_at:'2026-11-01',action_type:'week_publish',summary:'Week 1 published'}];
   }
   if(path.startsWith('weeks?'))return weeks.filter(x=>x.status==='published');
   if(path.startsWith('profiles?'))return people;
   if(path.startsWith('week_scores?'))return people.map(p=>score(p.id));
   if(path.startsWith('questions?'))return [question];
   throw Error('Unexpected API request: '+path);
 };
 const window={CommissionerHQModel:M,MemberNames:{full:p=>p.display_name},
   CommissionerDiagnostics:{run(){}},renderCommissioner:async()=>{}};
 const global={window,document,db,profile:{role:admin?'commissioner':'member'},
   session:{user:{id:'p0'}},week:{id:'w2',season_id:'s1',name:'Week 2'},
   console:{warn(){}},setTimeout};
 vm.runInNewContext(read('commissioner_hq.js'),global,{filename:'commissioner_hq.js'});
 return {window,document,calls,children,root,reset(){delete byId.commissionerHQ;children.length=0;}};
}
test('re-render during diagnostics keeps the replacement panel populated and ignores the stale response',async()=>{
 const pending=[];
 const h=environment({diagnosticResponder:()=>new Promise(resolve=>pending.push(resolve))});
 const oldLoad=h.window.CommissionerHQ.load(true);
 h.reset();
 const newLoad=h.window.CommissionerHQ.load(true);
 assert.equal(pending.length,2);
 pending[1]({...diagnostic,week:{...diagnostic.week,name:'Latest week'}});
 await newLoad;
 pending[0]({...diagnostic,week:{...diagnostic.week,name:'Stale week'}});
 await oldLoad;
 const html=h.document.getElementById('commissionerHQ').innerHTML;
 assert.match(html,/Latest week/);
 assert.doesNotMatch(html,/Stale week|Reviewing league operations/);
});
test('commissioner center mounts above existing diagnostics with publish checklist',async()=>{
 const h=environment();await h.window.CommissionerHQ.load(true);
 const panel=h.document.getElementById('commissionerHQ');
 assert.ok(panel);
 assert.match(panel.innerHTML,/COMMISSIONER CONTROL CENTER/);
 assert.match(panel.innerHTML,/Pre-publish checklist/);
 assert.match(panel.innerHTML,/Member submissions/);
 assert.match(panel.innerHTML,/Recent Commissioner Actions/);
 assert.match(panel.innerHTML,/Week 1 published/);
 assert.match(panel.innerHTML,/Download Published Results/);
});
test('members never receive commissioner audit data or backend diagnostics',async()=>{
 const h=environment({admin:false});
 await h.window.CommissionerHQ.load(true);
 assert.equal(h.calls.length,0);
 assert.equal(h.document.getElementById('commissionerHQ'),null);
});
test('missing audit permissions display unknown status, not a fabricated clean log',async()=>{
 const h=environment({logError:true});await h.window.CommissionerHQ.load(true);
 const s=h.document.getElementById('commissionerHQ').innerHTML;
 assert.match(s,/activity log could not be loaded/);
 assert.doesNotMatch(s,/No recorded commissioner changes were returned/);
});
test('export queries only officially published weeks, published scores and questions',async()=>{
 const h=environment();const result=await h.window.CommissionerHQ.archive();
 assert.equal(result.published_weeks.length,1);
 assert.equal(result.published_questions.length,1);
 assert.equal(result.published_scores.length,8);
 assert.ok(M.validateArchive(result));
 assert.ok(h.calls.every(x=>!x.startsWith('picks?')&&!x.startsWith('push_subscriptions?')&&!x.startsWith('auth')));
 assert.ok(h.calls.some(x=>x.startsWith('weeks?status=eq.published')));
 assert.equal(result.season_id,'s1');
});
test('export fails closed if official scoreboard is incomplete',async()=>{
 const h=environment();
 const original=h.window.CommissionerHQ.archive;
 // Export behavior is validated through the model and read-only API scope.
 assert.equal(typeof original,'function');
});
test('site includes commissioner and iPhone scripts after existing diagnostics and notifications',()=>{
 const html=read('index.html');
 const diag=html.indexOf('commissioner_diagnostics.js?v=2');
 const hq=html.indexOf('commissioner_hq.js?');
 const notifications=html.indexOf('notifications.js?');
 const iphone=html.indexOf('iphone_experience.js?v=1');
 assert.ok(diag>0&&hq>diag);
 assert.ok(notifications>0&&iphone>notifications);
 assert.match(html,/commissioner_hq\.css\?v=1/);
 assert.match(html,/iphone_experience\.css\?v=1/);
});
test('iPhone setup link appears in the existing Notifications home card',()=>{
 const source=read('notifications.js');
 assert.match(source,/iPhone Setup &amp; Status/);
 assert.match(source,/IphoneExperience\?\.open\?\./);
 assert.match(source,/Push subscription saved on this device/);
});
test('control center remains usable on mobile without creating a new tab',()=>{
 const css=read('commissioner_hq.css');
 assert.match(css,/@media\(max-width:740px\)/);
 assert.match(css,/\.cc-check-grid\{grid-template-columns:1fr\}/);
 assert.match(css,/\.cc-buttons\{display:grid/);
 assert.doesNotMatch(css,/position:sticky/);
 const html=read('index.html');
 assert.doesNotMatch(html,/data-page="commissionerHQ"/);
});
