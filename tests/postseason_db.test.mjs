import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const pglitePath=process.env.PGLITE_MODULE;
if(!pglitePath) throw new Error('Set PGLITE_MODULE to the installed @electric-sql/pglite/dist/index.js path.');
const {PGlite}=await import(pathToFileURL(pglitePath));
const db=new PGlite();
const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
const base=await fs.readFile(new URL('./postseason_base.sql',import.meta.url),'utf8');
const migration=await fs.readFile(new URL('../database/postseason.sql',import.meta.url),'utf8');
await db.exec(base);
const sid=(await q("insert into seasons(year,name) values(2026,'Test season') returning id"))[0].id;
const players=[];
for(let i=0;i<8;i++) {
 const p=(await q('insert into profiles(username,display_name,role) values($1,$2,$3) returning id',[`member${i}`,`Member ${i}`,i===0?'commissioner':'player']))[0].id;
 players.push(p);
 if(i) await q('insert into player_slots(slot,display_name,claimed_by) values($1,$2,$3)',[i,`Member ${i}`,p]);
}
await db.exec(migration);
await db.exec('create trigger submissions_auto_lock_week after insert or update on submissions for each row execute function private.auto_lock_week_if_full();');
async function asUser(id,fn) {
 await db.exec('begin; set local role authenticated;');
 await q("select set_config('request.jwt.claim.sub',$1,true)",[id]);
 try { const v=await fn();await db.exec('commit');return v; } catch(e) {await db.exec('rollback');throw e;}
}
const action=(name,payload={})=>asUser(players[0],async()=> (await q('select postseason_action($1,$2::jsonb) value',[name,JSON.stringify({season_id:sid,...payload})]))[0].value);
const state=(user=players[0],wid=null)=>asUser(user,async()=> (await q('select postseason_state($1,$2) value',[sid,wid]))[0].value);

test('postseason acceptance cases in isolated PostgreSQL',async t=>{
 t.after(()=>db.close());
 await t.test('migration is inactive and creates a complete season calendar',async()=>{
  const s=await state(); assert.equal(s.settings.status,'scheduled'); assert.equal(s.entries.length,0); assert.equal(s.rounds.length,0);
  assert.equal(s.calendar.filter(c=>c.phase==='regular').length,20); assert.equal(s.calendar.filter(c=>c.phase==='playoff').length,4);
  assert.equal(s.calendar.find(c=>c.phase==='break').week_number,null);
  assert.equal(s.calendar.find(c=>c.round_number===4).ends_on,'2027-02-14');
  assert.ok(s.calendar.find(c=>c.week_number===10).sports.includes('CBB'));
  assert.match(s.calendar.find(c=>c.week_number===19).notes,/Wednesday December 30/);
 });
 await t.test('calendar and engine are read-only to members, and anonymous RPC access is denied',async()=>{
  await assert.rejects(asUser(players[1],()=>q("update postseason_seasons set status='live'")),/permission denied/);
  await assert.rejects(asUser(players[1],()=>q("select postseason_action('start',$1::jsonb)",[JSON.stringify({season_id:sid})])),/Commissioner/);
  await db.exec('set role anon'); await assert.rejects(q('select postseason_state($1)',[sid]),/permission denied/); await db.exec('reset role');
 });
 // Test dates below are changed only inside this isolated database.
 await q("update postseason_seasons set start_not_before=now()+interval '4 months' where season_id=$1",[sid]);
 await t.test('start is blocked months before postseason',async()=>{
  await assert.rejects(action('start'),/cannot start yet/);
  assert.equal((await state()).entries.length,0);
 });
 await t.test('Tuesday setup and confirmed locks are required to create regular cards',async()=>{
  await assert.rejects(action('create_regular_week'),/Confirm this week/);
  await q("update season_calendar set setup_date=current_date,starts_on=current_date+2,ends_on=current_date+6 where season_id=$1 and slot=4",[sid]);
  await action('save_calendar',{slot:4,lock_at:new Date(Date.now()+2*86400000).toISOString()});
  assert.equal((await state()).calendar.find(c=>c.slot===4).lock_confirmed,true);
  await q("update season_calendar set setup_date=current_date+2,starts_on=current_date+3,ends_on=current_date+7,suggested_lock_at=now()+interval '3 days',lock_confirmed=true where season_id=$1 and slot=1",[sid]);
  await assert.rejects(action('create_regular_week'),/Tuesday morning/);
  await assert.rejects(asUser(players[0],()=>q("insert into weeks(season_id,number,name,lock_at) values($1,21,'Wrong path',now()+interval '1 day')",[sid])),/season calendar/);
  assert.equal((await q('select count(*)::integer n from weeks'))[0].n,0);
 });

 // All dates changed below belong only to this isolated test database.
 await q("update postseason_seasons set start_not_before=now()-interval '1 day' where season_id=$1",[sid]);
 for(let n=1;n<=20;n++) {
  const wid=(await q("insert into weeks(season_id,number,name,lock_at,status,tiebreaker_result,published_at) values($1,$2,$3,now()-interval '1 day','published',48,now()) returning id",[sid,n,`Week ${n}`]))[0].id;
  for(let i=0;i<8;i++) await q('insert into week_scores(week_id,user_id,placement,correct_count,question_count,pick_percentage,placement_points,total_points) values($1,$2,$3,5,10,50,0,$4)',[wid,players[i],i+1,[104,100,96,94,91,88,85,81][i]/20]);
 }
 await q("update season_calendar set setup_date=current_date-2,starts_on=current_date,ends_on=current_date+10,suggested_lock_at=now()+interval '1 day',lock_confirmed=true where season_id=$1 and phase='playoff'",[sid]);
 let wildcard;
 await t.test('start snapshots exactly eight fixed seeds and points and is idempotent',async()=>{
  await q("update weeks set number=99 where season_id=$1 and number=20",[sid]);
  await assert.rejects(action('start'),/Publish all regular-season/);
  await q("update weeks set number=20 where season_id=$1 and number=99",[sid]);
  const preview=await action('preview_start'); assert.deepEqual(preview.rows.map(r=>Number(r.points)),[104,100,96,94,91,88,85,81]);
  await assert.rejects(action('start',{revision:'stale'}),/changed/);
  wildcard=(await action('start',{revision:preview.revision})).week_id;
  const s=await state(); assert.equal(s.entries.length,8); assert.deepEqual(s.entries.map(r=>r.seed),[1,2,3,4,5,6,7,8]);
  assert.equal(s.entries[0].regular_season_points,104); assert.equal(s.settings.status,'live');
  await assert.rejects(action('start',{revision:preview.revision}),/already started/);
 });
 await t.test('regular-season corrections and direct playoff scoring are blocked',async()=>{
  const regular=(await q("select id from weeks where phase='regular' limit 1"))[0].id;
  await assert.rejects(asUser(players[0],()=>q('update week_scores set total_points=99 where week_id=$1',[regular])),/frozen/);
  await assert.rejects(asUser(players[0],()=>q("update weeks set status='published' where id=$1",[wildcard])),/finalize/);
  const question=(await q("insert into questions(week_id,position,sport,question_type,prompt,answer_options) values($1,1,'CFB','custom','Frozen result','[\"A\",\"B\"]') returning id",[regular]))[0].id;
  await assert.rejects(asUser(players[0],()=>q('update questions set week_id=$1 where id=$2',[wildcard,question])),/cannot be moved/);
  // Existing commissioner RPCs are also SECURITY DEFINER. They must not bypass the freeze.
  await db.exec("create function public.test_legacy_editor(qid uuid) returns void language sql security definer set search_path='' as $$ update public.questions set prompt='Changed through legacy editor' where id=qid $$; grant execute on function public.test_legacy_editor(uuid) to authenticated;");
  await assert.rejects(asUser(players[0],()=>q('select test_legacy_editor($1)',[question])),/frozen/);
 });
 async function card(wid,counts,missing=[]) {
  const questions=[];
  for(let j=0;j<14;j++) questions.push((await q("insert into questions(week_id,position,sport,question_type,prompt,answer_options,counts_for_score) values($1,$2,'NFL','custom',$3,'[\"A\",\"B\"]',$4) returning id",[wid,j+1,`Pick ${j+1}`,j<13]))[0].id);
  const entries=(await state()).entries;
  const order=Array.from({length:8},(_,i)=>i).sort((a,b)=>Number(entries.find(e=>e.user_id===players[a]).status==='active')-Number(entries.find(e=>e.user_id===players[b]).status==='active'));
  for(const i of order) {
   if(missing.includes(i))continue;
   await asUser(players[i],async()=>{
    for(let j=0;j<14;j++) await q('insert into picks(week_id,question_id,user_id,answer) values($1,$2,$3,$4::jsonb)',[wid,questions[j],players[i],JSON.stringify(j<counts[i]?'A':'B')]);
    await q('insert into submissions(week_id,user_id,tiebreaker_answer) values($1,$2,$3)',[wid,players[i],40+i]);
   });
   if(entries.find(e=>e.user_id===players[i]).status!=='active') assert.equal((await q('select auto_locked_at from weeks where id=$1',[wid]))[0].auto_locked_at,null,'Fun submissions cannot trigger early lock');
  }
  return questions;
 }
 const qs=await card(wildcard,[8,11,10,9,11,8,9,12]);
 await t.test('all contenders trigger early lock and non-scored questions add zero',async()=>{
  assert.ok((await q('select auto_locked_at from weeks where id=$1',[wildcard]))[0].auto_locked_at);
  await q("update questions set result='\"A\"' where week_id=$1",[wildcard]);
  await q('update weeks set tiebreaker_result=48 where id=$1',[wildcard]);
  const p=await action('preview_round',{week_id:wildcard});
  assert.equal(p.ready,true); assert.equal(p.question_count,13);
  assert.deepEqual(p.rows.map(r=>Number(r.cumulative_after)),[112,111,106,103,102,96,94,93]);
 });
 await t.test('multi-way cut ties wait for the actual tiebreaker, then use distance and fixed seed',async()=>{
  await db.exec('begin');
  const rid=(await q('select id from playoff_rounds where week_id=$1',[wildcard]))[0].id;
  const project=async()=> (await q('select private.playoff_projection($1) value',[rid]))[0].value;
  const current=await project();
  for(const row of current) await q('update playoff_entries set regular_season_points=$1 where user_id=$2',[100-row.round_correct,row.user_id]);
  await q('update weeks set tiebreaker_result=null where id=$1',[wildcard]);
  assert.ok((await project()).every(r=>r.round_rank===1 && r.cut_tie && r.projected_status==='tiebreaker_pending'));
  await q('update weeks set tiebreaker_result=44 where id=$1',[wildcard]);
  const sorted=await project();assert.deepEqual(sorted.map(r=>r.user_id),[4,3,5,2,6,1,7,0].map(i=>players[i]));
  assert.equal(sorted.find(r=>r.user_id===players[1]).projected_status,'projected_advance');
  assert.equal(sorted.find(r=>r.user_id===players[7]).projected_status,'projected_out');
  await q('update submissions set tiebreaker_answer=null where week_id=$1 and user_id in ($2,$3)',[wildcard,players[0],players[7]]);
  const missing=await project();assert.deepEqual(missing.slice(-2).map(r=>r.user_id),[players[0],players[7]]);
  await db.exec('rollback');
 });
 await t.test('finalization is atomic, persists elimination and awards only correct-pick points',async()=>{
  const p=await action('preview_round',{week_id:wildcard});
  await assert.rejects(action('finalize',{week_id:wildcard,revision:'stale'}),/changed after your preview/);
  assert.equal((await state()).entries.filter(e=>e.status==='active').length,8);
  await assert.rejects(action('finalize',{week_id:wildcard,revision:'stale'}),/changed/);
  assert.equal((await state()).entries.filter(e=>e.status==='active').length,8);
  await action('finalize',{week_id:wildcard,revision:p.revision});
  const s=await state(players[1]); assert.equal(s.entries.filter(e=>e.status==='active').length,6);
  assert.equal(s.entries.find(e=>e.user_id===players[7]).current_total,93);
  const scores=await q('select * from week_scores where week_id=$1',[wildcard]);
  assert.equal(scores.length,8);
  assert.ok(scores.every(x=>Number(x.total_points)===x.correct_count && ['placement_points','perfect_bonus','unicorn_bonus','upset_bonus','streak_bonus','cold_bonus'].every(k=>Number(x[k])===0)));
  assert.equal(s.history.length,8); assert.equal(s.current.round.status,'finalized');
  await assert.rejects(action('finalize',{week_id:wildcard,revision:p.revision}),/already finalized/);
 });
 let divisional=(await action('create_round')).week_id;
 await t.test('unlocked live state does not reveal other members’ tiebreaker guesses',async()=>{
  await asUser(players[0],()=>q('insert into submissions(week_id,user_id,tiebreaker_answer) values($1,$2,999)',[divisional,players[0]]));
  const s=await state(players[1]); assert.ok(s.current.rows.every(r=>r.round_tiebreaker_answer===null));
  await q('delete from submissions where week_id=$1',[divisional]);
 });
 await card(divisional,[1,1,1,1,1,1,13,13]);
 await t.test('six contenders lock Divisional without eliminated members; eliminated scores freeze',async()=>{
  assert.ok((await q('select auto_locked_at from weeks where id=$1',[divisional]))[0].auto_locked_at);
  await q("update questions set result='\"A\"' where week_id=$1",[divisional]);await q('update weeks set tiebreaker_result=44 where id=$1',[divisional]);
  const p=await action('preview_round',{week_id:divisional});assert.equal(p.rows.length,6);
  await action('finalize',{week_id:divisional,revision:p.revision});
  const s=await state(); assert.equal(s.entries.filter(e=>e.status==='active').length,4);
  assert.equal(s.entries.find(e=>e.user_id===players[7]).current_total,93);
  assert.equal(Number((await q('select total_points from week_scores where week_id=$1 and user_id=$2',[divisional,players[7]]))[0].total_points),13);
 });
 let conference=(await action('create_round')).week_id;
 await card(conference,[0,0,0,0,0,0,0,0],[3,4,5,6,7]);
 await q('update weeks set lock_at=now()-interval \'1 second\',tiebreaker_result=44 where id=$1',[conference]);
 await q("update questions set result='\"A\"' where week_id=$1",[conference]);
 await t.test('missing submissions earn zero and do not block finalization',async()=>{
  const p=await action('preview_round',{week_id:conference}); assert.equal(p.rows.length,4); assert.equal(p.ready,true);
  const missing=p.rows.find(r=>r.user_id===players[3]); assert.equal(missing.round_correct,0);assert.equal(missing.round_tiebreaker_distance,null);
  await action('finalize',{week_id:conference,revision:p.revision});
  assert.equal((await state()).entries.filter(e=>e.status==='active').length,2);
 });
 let superbowl=(await action('create_round')).week_id;
 await card(superbowl,[5,13,0,0,0,0,0,0],[2,3,4,5,6,7]);
 await q("update questions set result='\"A\"' where week_id=$1",[superbowl]); await q('update weeks set tiebreaker_result=45 where id=$1',[superbowl]);
 await t.test('two contenders lock the final; champion and runner-up persist',async()=>{
  assert.ok((await q('select auto_locked_at from weeks where id=$1',[superbowl]))[0].auto_locked_at);
  const p=await action('preview_round',{week_id:superbowl});await action('finalize',{week_id:superbowl,revision:p.revision});
  const s=await state(players[7]); assert.equal(s.settings.status,'complete');assert.equal(s.entries.filter(e=>e.status==='champion').length,1);assert.equal(s.entries.filter(e=>e.status==='runner_up').length,1);
  assert.equal(s.entries.find(e=>e.status==='champion').user_id,players[1]);assert.equal(s.history.length,20);
  assert.deepEqual(s.entries.map(e=>Number(e.regular_season_points)),[104,100,96,94,91,88,85,81]);
 });
 await t.test('earlier corrections require an explicit rebuild and invalidate later rounds safely',async()=>{
  const results={[qs[0]]:'B'}; const p=await action('preview_correction',{week_id:wildcard,results,tiebreaker_result:48});
  assert.equal(p.rebuild_required,true);
  await assert.rejects(action('correct',{week_id:wildcard,results,tiebreaker_result:48,revision:p.revision}),/Explicitly rebuild/);
  assert.equal((await state()).rounds.length,4);
  await action('correct',{week_id:wildcard,results,tiebreaker_result:48,revision:p.revision,confirmation:'REBUILD PLAYOFFS FROM THIS ROUND'});
  const s=await state();assert.equal(s.rounds.length,1);assert.equal(s.entries.filter(e=>e.status==='active').length,6);assert.equal(s.entries.filter(e=>e.status==='champion').length,0);assert.equal(s.history.length,8);
  assert.equal((await q('select count(*)::integer n from private.playoff_rebuild_audit'))[0].n,1);
 });
 await t.test('reset also requires exact explicit confirmation',async()=>{
  await assert.rejects(action('reset'),/Type RESET ALL PLAYOFFS/);
  assert.equal((await state()).entries.length,8);
 });
});
