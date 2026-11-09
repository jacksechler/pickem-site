import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const pglitePath=process.env.PGLITE_MODULE;
if(!pglitePath)throw Error('Set PGLITE_MODULE to @electric-sql/pglite/dist/index.js');
const {PGlite}=await import(pathToFileURL(pglitePath));
const db=new PGlite();
const q=async(sql,args=[]) => (await db.query(sql,args)).rows;

await db.exec(await fs.readFile(new URL('./postseason_base.sql',import.meta.url),'utf8'));
const sid=(await q("insert into seasons(year,name) values(2026,'Question release tests') returning id"))[0].id;
const admin=(await q("insert into profiles(username,display_name,role) values('admin','Admin','commissioner') returning id"))[0].id;
const player=(await q("insert into profiles(username,display_name,role) values('member','Member','player') returning id"))[0].id;
const old=(await q("insert into weeks(season_id,number,name,lock_at,status,is_active) values($1,1,'Existing week',now()+interval '3 days','draft',false) returning id",[sid]))[0].id;
const oldQ=(await q("insert into questions(week_id,position,sport,question_type,prompt,answer_options) values($1,1,'NFL','custom','Old question','[\"A\",\"B\"]') returning id",[old]))[0].id;

await db.exec(await fs.readFile(new URL('../supabase/migrations/20261109093000_question_batch_release.sql',import.meta.url),'utf8'));
await db.exec(await fs.readFile(new URL('../supabase/migrations/20261109093500_grandfather_existing_question_edits.sql',import.meta.url),'utf8'));

async function asUser(id,fn){
  await db.exec('begin; set local role authenticated;');
  await q("select set_config('request.jwt.claim.sub',$1,true)",[id]);
  try{const result=await fn();await db.exec('commit');return result;}
  catch(e){await db.exec('rollback');throw e;}
}

test('questions stay private until explicitly released together',async t=>{
  t.after(()=>db.close());

  await t.test('existing weeks are grandfathered and remain visible',async()=>{
    const rows=await asUser(player,()=>q('select id from questions where week_id=$1',[old]));
    assert.equal(rows.length,1);
    const released=(await q('select questions_released_at,batch_release_enforced from weeks where id=$1',[old]))[0];
    assert.ok(released.questions_released_at);
    assert.equal(released.batch_release_enforced,false);
  });

  const wid=(await q("insert into weeks(season_id,number,name,lock_at,status,is_active) values($1,2,'New private week',now()+interval '4 days','draft',true) returning id",[sid]))[0].id;

  await t.test('new week is invisible to players, visible to commissioner',async()=>{
    assert.equal((await asUser(player,()=>q('select id from weeks where id=$1',[wid]))).length,0);
    assert.equal((await asUser(admin,()=>q('select id from weeks where id=$1',[wid]))).length,1);
    const state=(await q('select questions_released_at,batch_release_enforced from weeks where id=$1',[wid]))[0];
    assert.equal(state.questions_released_at,null);
    assert.equal(state.batch_release_enforced,true);
  });

  await t.test('cannot release an empty card',async()=>{
    await assert.rejects(
      asUser(admin,()=>q('select public.commissioner_release_week_questions($1)',[wid])),
      /at least one question/i
    );
  });

  const questions=await asUser(admin,()=>q(
    "insert into questions(week_id,position,sport,question_type,prompt,answer_options) values ($1,1,'NFL','custom','First question','[\"A\",\"B\"]'),($1,2,'CFB','custom','Second question','[\"Yes\",\"No\"]') returning id",
    [wid]
  ));

  await t.test('draft questions remain hidden and picks cannot be submitted',async()=>{
    assert.equal((await asUser(player,()=>q('select id from questions where week_id=$1',[wid]))).length,0);
    assert.equal((await asUser(admin,()=>q('select id from questions where week_id=$1',[wid]))).length,2);
    const open=(await asUser(player,()=>q('select private.week_is_open($1) as open',[wid])))[0].open;
    assert.equal(open,false);
    await assert.rejects(
      asUser(player,()=>q("insert into picks(week_id,question_id,user_id,answer) values($1,$2,$3,'\"A\"'::jsonb)",[wid,questions[0].id,player])),
      /row-level security/i
    );
  });

  await t.test('player cannot call commissioner release',async()=>{
    await assert.rejects(
      asUser(player,()=>q('select public.commissioner_release_week_questions($1)',[wid])),
      /Commissioner access required|permission denied/i
    );
  });

  await t.test('one release exposes both questions and opens picks',async()=>{
    const released=await asUser(admin,()=>q('select public.commissioner_release_week_questions($1) as release',[wid]));
    assert.equal(released[0].release.questions,2);
    assert.equal((await asUser(player,()=>q('select id from weeks where id=$1',[wid]))).length,1);
    assert.equal((await asUser(player,()=>q('select id from questions where week_id=$1',[wid]))).length,2);
    assert.equal((await asUser(player,()=>q('select private.week_is_open($1) as open',[wid])))[0].open,true);
    await asUser(player,()=>q('insert into picks(week_id,question_id,user_id,answer) values($1,$2,$3,$4::jsonb)',[wid,questions[0].id,player,JSON.stringify('A')]));
  });

  await t.test('released new weeks reject additions and cannot be hidden again',async()=>{
    await assert.rejects(
      asUser(admin,()=>q("insert into questions(week_id,position,sport,question_type,prompt,answer_options) values($1,3,'NFL','custom','Late question','[\"A\",\"B\"]')",[wid])),
      /already been released/i
    );
    await assert.rejects(
      asUser(admin,()=>q('update weeks set questions_released_at=null where id=$1',[wid])),
      /cannot be hidden again/i
    );
  });

  await t.test('existing active weeks may still add questions while current picks are in progress',async()=>{
    await asUser(admin,()=>q("insert into questions(week_id,position,sport,question_type,prompt,answer_options) values($1,2,'NFL','custom','Existing week addition','[\"A\",\"B\"]')",[old]));
    assert.equal((await q('select count(*)::integer n from questions where week_id=$1',[old]))[0].n,2);
  });
});
