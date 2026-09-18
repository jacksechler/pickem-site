from pathlib import Path

def replace_once(path, old, new):
    p=Path(path)
    text=p.read_text()
    if old not in text:
        raise SystemExit(f"Missing expected text in {path}: {old[:120]!r}")
    if text.count(old) != 1:
        raise SystemExit(f"Expected one match in {path}, found {text.count(old)}")
    p.write_text(text.replace(old,new,1))

replace_once(
    "index.html",
    '<script src="post_lock_override.js?v=1"></script>\n</body>',
    '<script src="post_lock_override.js?v=1"></script>\n<script src="commissioner_diagnostics.js?v=1"></script>\n</body>'
)
replace_once("app_update.js", "2026.09.17.1", "2026.09.18.1")
Path("app-version.json").write_text('{"version":"2026.09.18.1"}\n')

test=Path("tests/postseason_db.test.mjs")
text=test.read_text()
needle="await db.exec(await fs.readFile(new URL('../database/postseason_calendar_revision.sql',import.meta.url),'utf8'));"
insert=needle+"\nawait db.exec(await fs.readFile(new URL('../supabase/migrations/20260915142048_playoff_seed_starting_bonus.sql',import.meta.url),'utf8'));\nawait db.exec(await fs.readFile(new URL('../supabase/migrations/20260915162406_playoff_seed_bonus_10_8_7_5_4_3_2_0.sql',import.meta.url),'utf8'));\nawait db.exec(await fs.readFile(new URL('../supabase/migrations/20260918143825_align_playoff_seed_bonus_constraint.sql',import.meta.url),'utf8'));"
if needle not in text:
    raise SystemExit("Postseason migration insertion point missing")
text=text.replace(needle,insert,1)

repls={
"  assert.equal(s.entries[0].regular_season_points,104); assert.equal(s.settings.status,'live');":
"  assert.equal(s.entries[0].regular_season_points,104); assert.deepEqual(s.entries.map(r=>Number(r.starting_bonus)),[10,8,7,5,4,3,2,0]); assert.deepEqual(s.entries.map(r=>Number(r.current_total)),[10,8,7,5,4,3,2,0]); assert.equal(s.settings.status,'live');",
" const qs=await card(wildcard,[8,11,10,9,11,8,9,12]);":
" const qs=await card(wildcard,[8,9,8,8,8,8,8,8]);",
"  assert.deepEqual(p.rows.map(r=>Number(r.cumulative_after)),[112,111,106,103,102,96,94,93]);":
"  assert.deepEqual(p.rows.map(r=>Number(r.cumulative_after)),[18,17,15,13,12,11,10,8]);",
"  for(const row of current) await q('update playoff_entries set regular_season_points=$1 where user_id=$2',[100-row.round_correct,row.user_id]);":
"  for(const row of current) await q('update playoff_entries set playoff_points=$1 where user_id=$2',[20-Number(row.cumulative_after),row.user_id]);",
"  assert.equal(s.entries.find(e=>e.user_id===players[7]).current_total,93);":
"  assert.equal(s.entries.find(e=>e.user_id===players[7]).current_total,8);",
}
for old,new in repls.items():
    count=text.count(old)
    if old.startswith("  assert.equal(s.entries.find(e=>e.user_id===players[7]).current_total,93);"):
        if count != 2:
            raise SystemExit(f"Expected two frozen-total assertions, found {count}")
        text=text.replace(old,new)
    else:
        if count != 1:
            raise SystemExit(f"Expected one test replacement, found {count}: {old[:100]}")
        text=text.replace(old,new,1)
test.write_text(text)

doc=Path("docs/postseason-2026.md")
if doc.exists():
    d=doc.read_text()
    d=d.replace(
        "review the starting standings. **Lock Regular Season & Start Playoffs** saves the eight seeds and starting points in one transaction",
        "review the starting standings. **Lock Regular Season & Start Playoffs** saves the eight seeds, frozen regular-season totals, and one-time starting bonuses (10/8/7/5/4/3/2/0) in one transaction"
    )
    doc.write_text(d)
