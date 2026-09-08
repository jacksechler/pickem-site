from pathlib import Path
import re, json


def one(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Missing expected text: {label}')
    return text.replace(old, new, 1)

p=Path('quality_fixes.js')
s=p.read_text()
s=one(s,
      "Exact-distance tie resolved by commissioner",
      "Exact-distance tie · golf-style split",
      'quality tie explanation')
p.write_text(s)

p=Path('path_to_win.js')
s=p.read_text()
s=one(s,
      "        if(winners.length===1) return {scenario:s,totals,definite:winners,unresolved:[]};\n        return {scenario:s,totals,definite:[],unresolved:winners};",
      "        return {scenario:s,totals,definite:winners,unresolved:[]};",
      'path-to-win exact tie as co-win')
s=one(s,
      "headline=esc(name)+' has '+wins.length+' outright win path'+(wins.length===1?'':'s')+(ties.length?' and '+ties.length+' tiebreaker path'+(ties.length===1?'':'s'):'')+'.';",
      "headline=esc(name)+' has '+wins.length+' winning path'+(wins.length===1?'':'s')+(ties.length?' and '+ties.length+' tiebreaker path'+(ties.length===1?'':'s'):'')+'.';",
      'path-to-win wording')
p.write_text(s)

p=Path('index.html')
s=p.read_text()
for old,new in [
    ('quality_fixes.js?v=2','quality_fixes.js?v=3'),
    ('path_to_win.js?v=1','path_to_win.js?v=2'),
    ('app_update.js?v=11','app_update.js?v=12'),
]:
    s=one(s,old,new,f'index {old}')
p.write_text(s)

p=Path('app_update.js')
s=p.read_text()
s,n=re.subn(r"const BUILD_VERSION = '[^']+';", "const BUILD_VERSION = '2026.09.08.4';", s, count=1)
if n!=1: raise SystemExit('Could not bump build version')
p.write_text(s)
Path('app-version.json').write_text(json.dumps({'version':'2026.09.08.4'},separators=(',',':'))+'\n')
print('Golf tie consistency fixes installed.')
