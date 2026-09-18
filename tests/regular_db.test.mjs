import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const pglitePath=process.env.PGLITE_MODULE;
if(!pglitePath) throw new Error('Set PGLITE_MODULE to the installed @electric-sql/pglite/dist/index.js path.');
const {PGlite}=await import(pathToFileURL(pglitePath));
const db=new PGlite();
const q=async(sql,args=[]) => (await db.query(sql,args)).rows;

await db.exec(await fs.readFile(new URL('./postseason_base.sql',import.meta.url),'utf8'));
const sid=(await q("insert into seasons(year,name) values(2026,'Regular test season') returning id"))[0].id;
const players=[];
for(let i=0;i<8;i++) {
  const id=(await q('insert into profiles(username,display_name,role) values($1,$2,$3) returning id',
    ['member'+i,'Member '+i,i===0?'commissioner':'player']))[0].id;
  players.push(id);
  if(i) await q('insert into player_slots(slot,display_name,claimed_by) values($1,$2,$3)',[i,'Member '+i,id]);
}

await db.exec(await fs.readFile(new URL('../database/postseason.sql',import.meta.url),'utf8'));
await db.exec('create trigger submissions_auto_lock_week after insert or update on submissions for each row execute function private.auto_lock_week_if_full();');

async function asUser(id,fn) {
  await db.exec('begin; set local role authenticated;');
  await q("select set_config('request.jwt.claim.sub',$1,true)",[id]);
  try { const value=await fn(); await db.exec('commit'); return value; }
  catch(error) { await db.exec('rollback'); throw error; }
}

test('regular-season database lifecycle', async t=>{
  t.after(()=>db.close());
  const wid=(await q("insert into weeks(season_id,number,name,lock_at,status,is_active,phase) values($1,1,'Week 1',now()+interval '2 days','draft',true,'regular') returning id",[sid]))[0].id;
  const question=(await q("insert into questions(week_id,position,sport,question_type,prompt,answer_options,counts_for_score) values($1,1,'NFL','custom','Who wins?','[\"A\",\"B\"]',true) returning id",[wid]))[0].id;

  await t.test('seven submissions do not auto-lock',async()=>{
    for(let i=0;i<7;i++) {
      await asUser(players[i],async()=>{
        await q("insert into picks(week_id,question_id,user_id,answer) values($1,$2,$3,'\"A\"'::jsonb)",[wid,question,players[i]]);
        await q('insert into submissions(week_id,user_id,tiebreaker_answer) values($1,$2,$3)',[wid,players[i],40+i]);
      });
    }
    const w=(await q('select lock_at,auto_locked_at from weeks where id=$1',[wid]))[0];
    assert.equal(w.auto_locked_at,null);
    assert.ok(new Date(w.lock_at).getTime()>Date.now());
  });

  await t.test('the eighth submitted entry locks the regular week immediately',async()=>{
    await asUser(players[7],async()=>{
      await q("insert into picks(week_id,question_id,user_id,answer) values($1,$2,$3,'\"B\"'::jsonb)",[wid,question,players[7]]);
      await q('insert into submissions(week_id,user_id,tiebreaker_answer) values($1,$2,47)',[wid,players[7]]);
    });
    const w=(await q('select lock_at,auto_locked_at from weeks where id=$1',[wid]))[0];
    assert.ok(w.auto_locked_at);
    assert.ok(new Date(w.lock_at).getTime()<=Date.now()+1000);
    assert.equal((await q('select count(*)::integer n from submissions where week_id=$1',[wid]))[0].n,8);
  });

  await t.test('locked league picks become readable to other signed-in members',async()=>{
    const rows=await asUser(players[1],()=>q('select user_id,answer from picks where week_id=$1 order by user_id',[wid]));
    assert.equal(rows.length,8);
    assert.ok(rows.some(r=>r.user_id===players[7]));
  });

  await t.test('players cannot edit their own pick after the lock',async()=>{
    // RLS can reject an UPDATE or silently affect zero rows when the locked row is no longer writable.
    // The important invariant is that the stored pick never changes.
    await asUser(players[1],()=>q('update picks set answer=$3::jsonb where week_id=$1 and user_id=$2',[wid,players[1],JSON.stringify('B')]));
    const answer=(await q('select answer from picks where week_id=$1 and user_id=$2',[wid,players[1]]))[0].answer;
    assert.equal(answer,'A');
  });
});
