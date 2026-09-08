from pathlib import Path
import re, json

ROOT = Path('.')


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Missing expected text for {label}')
    return text.replace(old, new, 1)

# --- Current-week scoring ---
p = ROOT / 'commissioner_v2.js'
s = p.read_text()
pattern = re.compile(r"    const groups=\{\};\n    rows\.forEach\(r=>\{.*?    return \{rows,unresolved\};", re.S)
replacement = """    rows.sort((a,b)=>{\n      if(b.correct_count!==a.correct_count) return b.correct_count-a.correct_count;\n      if(a.tb_distance!==b.tb_distance) return a.tb_distance-b.tb_distance;\n      return a.name.localeCompare(b.name);\n    });\n\n    // Golf-style split for an exact tie after the tiebreaker. Everyone in the\n    // tie gets the same place, and the placement-point slots they occupy are averaged.\n    let i=0;\n    while(i<rows.length){\n      let j=i+1;\n      while(j<rows.length && rows[j].correct_count===rows[i].correct_count && rows[j].tb_distance===rows[i].tb_distance) j++;\n      const tieSize=j-i;\n      const splitPoints=placementPoints.slice(i,j).reduce((sum,v)=>sum+Number(v??0),0)/tieSize;\n      for(let k=i;k<j;k++){\n        const r=rows[k];\n        r.placement=i+1;\n        r.placement_points=splitPoints;\n        r.golf_tie=tieSize>1;\n        r.total_points=r.placement_points+r.perfect_bonus+r.unicorn_bonus+r.upset_bonus+r.streak_bonus+r.cold_bonus;\n      }\n      i=j;\n    }\n    return {rows,unresolved:[]};"""
s, count = pattern.subn(replacement, s, count=1)
if count != 1:
    raise SystemExit(f'commissioner scoring block replacements: {count}')
s = replace_once(s,
    "return '<tr><td><b>#'+r.placement+'</b></td><td><b>'+esc(r.name)+'</b></td>",
    "return '<tr><td><b>'+(r.golf_tie?'T':'#')+r.placement+'</b></td><td><b>'+esc(r.name)+'</b></td>",
    'commissioner preview place')
s = replace_once(s,
    "const resolver=tieResolverHtml(unresolved);",
    "const resolver=rows.some(r=>r.golf_tie)?'<div class=\"notice\"><b>Golf-style tie split applied</b><div class=\"muted\">Players exactly tied on correct picks and tiebreaker distance share the same place and split the placement points for the tied spots.</div></div>':'';",
    'commissioner tie notice')
p.write_text(s)

# --- Archived published-week scoring ---
p = ROOT / 'archived_week_editor.js'
s = p.read_text()
pattern = re.compile(r"    const groups=\{\}; rows\.forEach\(r=>.*?    return \{rows,unresolved,existingMap\};", re.S)
replacement = """    rows.sort((a,b)=>{\n      if(b.correct_count!==a.correct_count) return b.correct_count-a.correct_count;\n      if(a.tb_distance!==b.tb_distance) return a.tb_distance-b.tb_distance;\n      return a.name.localeCompare(b.name);\n    });\n\n    let i=0;\n    while(i<rows.length){\n      let j=i+1;\n      while(j<rows.length && rows[j].correct_count===rows[i].correct_count && rows[j].tb_distance===rows[i].tb_distance) j++;\n      const tieSize=j-i;\n      const splitPoints=placementPoints.slice(i,j).reduce((sum,v)=>sum+Number(v??0),0)/tieSize;\n      for(let k=i;k<j;k++){\n        const r=rows[k];\n        r.placement=i+1;\n        r.placement_points=splitPoints;\n        r.golf_tie=tieSize>1;\n        r.total_points=r.placement_points+r.perfect_bonus+r.unicorn_bonus+r.upset_bonus+r.streak_bonus+r.cold_bonus;\n      }\n      i=j;\n    }\n    return {rows,unresolved:[],existingMap};"""
s, count = pattern.subn(replacement, s, count=1)
if count != 1:
    raise SystemExit(f'archive scoring block replacements: {count}')
s = replace_once(s,
    "return '<tr><td><b>#'+r.placement+'</b></td><td><b>'+esc(r.name)+'</b></td>",
    "return '<tr><td><b>'+(r.golf_tie?'T':'#')+r.placement+'</b></td><td><b>'+esc(r.name)+'</b></td>",
    'archive preview place')
s = replace_once(s,
    "return tieResolverHtml(data.unresolved)+table+'<button class=\"btn full\" '+(data.unresolved.length?'disabled':'')+' onclick=\"applyArchivedCorrection()\">Apply Corrected Official Scores</button><div class=\"mini\">This keeps the week archived and updates season totals automatically.</div>';",
    "const tieNotice=data.rows.some(r=>r.golf_tie)?'<div class=\"notice\"><b>Golf-style tie split applied</b><div class=\"muted\">Exact ties share the same place and split the placement points for the tied spots.</div></div>':'';\n    return tieNotice+table+'<button class=\"btn full\" onclick=\"applyArchivedCorrection()\">Apply Corrected Official Scores</button><div class=\"mini\">This keeps the week archived and updates season totals automatically.</div>';",
    'archive tie notice')
p.write_text(s)

# --- Weekly standings display ---
p = ROOT / 'weekly_standings_v2.js'
s = p.read_text()
s = replace_once(s,
    "    }).sort((a,b)=>a.rank-b.rank||((b.points??-Infinity)-(a.points??-Infinity))||a.name.localeCompare(b.name));\n    return {rows,actual};",
    "    }).sort((a,b)=>a.rank-b.rank||((b.points??-Infinity)-(a.points??-Infinity))||a.name.localeCompare(b.name));\n    const placeCounts={}; rows.forEach(r=>placeCounts[r.rank]=(placeCounts[r.rank]||0)+1);\n    rows.forEach(r=>r.exactTbTie=(placeCounts[r.rank]||0)>1);\n    return {rows,actual};",
    'final standings tie flag')
s = replace_once(s,
    "const place=r.rank>=999?'—':'#'+r.rank;",
    "const place=r.rank>=999?'—':(r.exactTbTie?'T':'#')+r.rank;",
    'standings T-place')
s = replace_once(s,
    "const tieNote=r.exactTbTie?'<div class=\"mini\" style=\"color:var(--gold)\">Exact TB tie</div>':'';",
    "const tieNote=r.exactTbTie?'<div class=\"mini\" style=\"color:var(--gold)\">Golf-style tie · placement points split</div>':'';",
    'standings tie note')
p.write_text(s)

# --- Copied weekly standings display ---
p = ROOT / 'copy_standings.js'
s = p.read_text()
s = replace_once(s,
    "      rows.forEach(r=>r.rank=r.storedPlace);",
    "      rows.forEach(r=>r.rank=r.storedPlace);\n      const pc={}; rows.forEach(r=>pc[r.rank]=(pc[r.rank]||0)+1); rows.forEach(r=>r.tied=(pc[r.rank]||0)>1);",
    'copy final tie flag')
s = replace_once(s,
    "      lines.push('#'+r.rank+' '+r.name+' — '+r.correct+'/'+r.total+' correct'+(isFinal?' • '+fmt(r.points)+' pts':''));",
    "      lines.push((r.tied?'T':'#')+r.rank+' '+r.name+' — '+r.correct+'/'+r.total+' correct'+(isFinal?' • '+fmt(r.points)+' pts':''));",
    'copy T-place')
p.write_text(s)

# --- Historical final-results display ---
p = ROOT / 'history_profiles.js'
s = p.read_text()
s = replace_once(s,
    "    const rows=[...d.scores].sort((a,b)=>num(a.placement)-num(b.placement)||num(b.total_points)-num(a.total_points));\n    return '<div class=\"card tablewrap\"><div class=\"eyebrow\">WEEK STATS</div>",
    "    const rows=[...d.scores].sort((a,b)=>num(a.placement)-num(b.placement)||num(b.total_points)-num(a.total_points));\n    const placeCounts={}; rows.forEach(s=>placeCounts[num(s.placement)]=(placeCounts[num(s.placement)]||0)+1);\n    return '<div class=\"card tablewrap\"><div class=\"eyebrow\">WEEK STATS</div>",
    'history tie counts')
s = replace_once(s,
    "return '<tr><td><b>#'+num(s.placement)+'</b></td><td>'+profileButton(s.user_id,prettyName(p))+'</td>",
    "return '<tr><td><b>'+(placeCounts[num(s.placement)]>1?'T':'#')+num(s.placement)+'</b></td><td>'+profileButton(s.user_id,prettyName(p))+'</td>",
    'history T-place')
p.write_text(s)

# --- Cache bust + app version ---
p = ROOT / 'index.html'
s = p.read_text()
for old,new in [
    ('commissioner_v2.js?v=2','commissioner_v2.js?v=3'),
    ('archived_week_editor.js?v=1','archived_week_editor.js?v=2'),
    ('history_profiles.js?v=2','history_profiles.js?v=3'),
    ('weekly_standings_v2.js?v=1','weekly_standings_v2.js?v=2'),
    ('copy_standings.js?v=2','copy_standings.js?v=3'),
    ('app_update.js?v=10','app_update.js?v=11'),
]:
    if old not in s:
        raise SystemExit(f'Missing index cache marker: {old}')
    s=s.replace(old,new,1)
p.write_text(s)

p = ROOT / 'app_update.js'
s = p.read_text()
s, count = re.subn(r"const BUILD_VERSION = '[^']+';", "const BUILD_VERSION = '2026.09.08.3';", s, count=1)
if count != 1:
    raise SystemExit('Could not bump BUILD_VERSION')
p.write_text(s)

(ROOT / 'app-version.json').write_text(json.dumps({'version':'2026.09.08.3'}, separators=(',',':'))+'\n')

print('Golf-style exact-tie scoring installed.')
