from pathlib import Path

ROOT=Path('.')

def once(text, old, new, label):
    n=text.count(old)
    if n!=1:
        raise SystemExit(f"{label}: expected exactly 1 match, found {n}")
    return text.replace(old,new,1)

p=ROOT/'index.html'
s=p.read_text()

league_old='<section id="league" class="page hidden"><div class="hero"><div><div class="eyebrow">YOUR LEAGUE</div><h1>League picks</h1></div><button id="openGameDay" class="btn" type="button" hidden>Open GameDay</button></div><div id="leagueBox"></div></section>'
league_new='<section id="league" class="page hidden"><div class="hero"><div><div class="eyebrow">YOUR LEAGUE</div><h1>League picks</h1></div><div class="league-page-actions"><button id="leagueShareGrid" class="btn secondary" type="button" onclick="showPage(\'sharegrid\',document.querySelector(\'[data-page="sharegrid"]\'))">Share Grid</button><button id="openGameDay" class="btn" type="button" hidden>Open GameDay</button></div></div><div id="leagueBox"></div></section>'
if league_old in s:
    s=once(s,league_old,league_new,'League action bar')

share_old='<section id="sharegrid" class="page hidden" aria-labelledby="shareGridTitle"><div class="hero"><div><div class="eyebrow">SHARE WITH THE LEAGUE</div><h1 id="shareGridTitle">Share Grid</h1><div class="muted">The compact screenshot-friendly picks board.</div></div></div><div id="shareGridBox"></div></section>'
share_new='<section id="sharegrid" class="page hidden" aria-labelledby="shareGridTitle"><div class="hero"><div><div class="eyebrow">SHARE WITH THE LEAGUE</div><h1 id="shareGridTitle">Share Grid</h1><div class="muted">The compact screenshot-friendly picks board.</div></div></div><div id="shareGridBox"><div class="card muted">Loading Share Grid…</div></div></section>'
if share_old in s:
    s=once(s,share_old,share_new,'Share Grid placeholder')

css='<link rel="stylesheet" href="league_scroll_fixes.css?v=1">'
if css not in s:
    s=once(s,'<link rel="stylesheet" href="share_grid.css?v=3">','<link rel="stylesheet" href="share_grid.css?v=3">\n'+css,'League scroll CSS')

s=s.replace('<script src="mobile_direct_grid.js?v=2"></script>\n','')
s=s.replace('<script src="mobile_direct_grid.js?v=2"></script>','')
if '<script src="share_grid.js?v=4"></script>' not in s:
    s=once(s,'<script src="share_grid.js?v=3"></script>','<script src="share_grid.js?v=4"></script>','Share Grid cache bust')

p.write_text(s)

p=ROOT/'app_update.js'
t=p.read_text()
if "const BUILD_VERSION = '2026.10.05.2';" in t:
    t=t.replace("const BUILD_VERSION = '2026.10.05.2';","const BUILD_VERSION = '2026.10.06.1';",1)
elif "const BUILD_VERSION = '2026.10.06.1';" not in t:
    raise SystemExit('Unexpected app_update BUILD_VERSION')
p.write_text(t)
(ROOT/'app-version.json').write_text('{"version":"2026.10.06.1"}\n')

print('Applied League/mobile release patch.')
