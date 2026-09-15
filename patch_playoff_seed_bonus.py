from pathlib import Path

VERSION = '2026.09.15.1'

p = Path('postseason.js')
s = p.read_text()

repls = {
"  const fmt=v=>Number(v||0).toFixed(1).replace(/\\.0$/,'');\n": "  const fmt=v=>Number(v||0).toFixed(1).replace(/\\.0$/,'');\n  const seedBonus=seed=>({1:8,2:6,3:5,4:4,5:3,6:2,7:1,8:0}[Number(seed)]??0);\n",
"<caption class=\"ps-sr\">Cumulative playoff standings. Frozen regular-season points plus correct playoff picks.</caption><thead><tr><th>Place / seed</th><th>Member</th><th>Reg. pts</th><th>This round</th><th>Playoff pts</th><th>Total</th><th>Status</th></tr>": "<caption class=\"ps-sr\">Cumulative playoff standings. One-time seed bonus plus correct playoff picks.</caption><thead><tr><th>Place / seed</th><th>Member</th><th>Seed bonus</th><th>This round</th><th>Playoff pts</th><th>Total</th><th>Status</th></tr>",
"      const e=member(data,r.user_id),points=Number(r.cumulative_after)-Number(e?.regular_season_points||0);": "      const e=member(data,r.user_id),points=Number(r.cumulative_after)-Number(e?.starting_bonus??seedBonus(r.seed));",
"<td>'+fmt(e?.regular_season_points)+'</td><td>+'+r.round_correct+'</td><td>+'+fmt(points)+'</td>": "<td>+'+fmt(e?.starting_bonus??seedBonus(r.seed))+'</td><td>+'+r.round_correct+'</td><td>+'+fmt(points)+'</td>",
"'Starting seed #'+e.seed+' · '+fmt(e.regular_season_points)+' frozen regular-season points'": "'Starting seed #'+e.seed+' · +'+fmt(e.starting_bonus??seedBonus(e.seed))+' one-time seed bonus'",
"<p>Seed #'+winner.seed+' · '+fmt(winner.regular_season_points)+' regular season + '+winner.playoff_points+' playoff correct</p>": "<p>Seed #'+winner.seed+' · +'+fmt(winner.starting_bonus??seedBonus(winner.seed))+' seed bonus + '+winner.playoff_points+' playoff correct</p>",
"<p>Your regular-season points become your starting playoff total. Keep adding points and stay above the cut.</p>": "<p>Your regular-season finish becomes a one-time playoff starting bonus. Keep adding one point per correct playoff pick and stay above the cut.</p>",
"<div><b>Bring your season points</b><p>Your final regular-season points and seeds are saved when playoffs start. Your total carries from round to round.</p></div>": "<div><b>Earn your starting bonus</b><p>Final regular-season finish sets a one-time bonus: 1st +8, 2nd +6, then +5, +4, +3, +2, +1, +0. The bonus is awarded once and your playoff total carries forward.</p></div>",
"'Starting points and seeds are frozen. Every correct playoff pick is worth one point.'": "'Regular-season seeds and one-time starting bonuses are frozen. Every correct playoff pick is worth one point.'",
"<h3>Starting standings preview</h3><p class=\"ps-note\">'+p.published_weeks+' / '+p.required_weeks+' regular-season weeks published. Starting points are saved only when you confirm.</p><div class=\"tablewrap\"><table class=\"table ps-table\"><thead><tr><th>Seed</th><th>Member</th><th>Starting points</th></tr></thead><tbody>'+p.rows.map(r=>'<tr><td>#'+r.seed+'</td><td>'+esc(r.display_name)+'</td><td>'+fmt(r.points)+'</td></tr>').join('')+'</tbody></table></div>": "<h3>Starting standings preview</h3><p class=\"ps-note\">'+p.published_weeks+' / '+p.required_weeks+' regular-season weeks published. Final season points determine the seeds; the playoff bonus is awarded once when you confirm.</p><div class=\"tablewrap\"><table class=\"table ps-table\"><thead><tr><th>Seed</th><th>Member</th><th>Reg. pts</th><th>Playoff start</th></tr></thead><tbody>'+p.rows.map(r=>'<tr><td>#'+r.seed+'</td><td>'+esc(r.display_name)+'</td><td>'+fmt(r.points)+'</td><td><b>+'+fmt(seedBonus(r.seed))+'</b></td></tr>').join('')+'</tbody></table></div>",
"if(!confirm('Freeze these regular-season points and seeds, then open Playoff Week 1?'))return;": "if(!confirm('Freeze the final regular-season standings and award the 8/6/5/4/3/2/1/0 starting bonuses, then open Playoff Week 1?'))return;",
"'   Seed #'+r.seed+' • Reg: '+fmt(e?.regular_season_points)+' • Playoff: +'+fmt(Number(r.cumulative_after)-Number(e?.regular_season_points||0))": "'   Seed #'+r.seed+' • Start: +'+fmt(e?.starting_bonus??seedBonus(r.seed))+' • Playoff picks: +'+fmt(Number(r.cumulative_after)-Number(e?.starting_bonus??seedBonus(r.seed)))"
}

for old, new in repls.items():
    if old not in s:
        raise SystemExit('Missing expected postseason.js text: ' + old[:90])
    s = s.replace(old, new, 1)

p.write_text(s)

index = Path('index.html')
i = index.read_text()
if 'postseason.js?v=3' not in i:
    raise SystemExit('Expected postseason cache key not found')
i = i.replace('postseason.js?v=3', 'postseason.js?v=4', 1)
index.write_text(i)

app = Path('app_update.js')
a = app.read_text()
import re
a2, n = re.subn(r"const BUILD_VERSION = '[^']+';", f"const BUILD_VERSION = '{VERSION}';", a, count=1)
if n != 1:
    raise SystemExit('BUILD_VERSION not found')
app.write_text(a2)

Path('app-version.json').write_text('{"version":"'+VERSION+'"}\n')

print('Installed one-time playoff seed bonuses: 8,6,5,4,3,2,1,0')
