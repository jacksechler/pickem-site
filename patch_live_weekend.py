from pathlib import Path

# Load/cache-bust the live weekend script after the existing app upgrades.
idx = Path('index.html')
html = idx.read_text()
if 'live_weekend.js' not in html:
    html = html.replace('<script src="account_tools.js?v=1"></script>', '<script src="account_tools.js?v=1"></script>\n<script src="live_weekend.js?v=2"></script>')
else:
    html = html.replace('live_weekend.js?v=1', 'live_weekend.js?v=2')
if 'screenshot_grid.js' not in html:
    html = html.replace('<script src="live_weekend.js?v=2"></script>', '<script src="live_weekend.js?v=2"></script>\n<script src="screenshot_grid.js?v=2"></script>')
else:
    html = html.replace('screenshot_grid.js?v=1', 'screenshot_grid.js?v=2')
if 'notifications.js' not in html:
    html = html.replace('<script src="screenshot_grid.js?v=2"></script>', '<script src="screenshot_grid.js?v=2"></script>\n<script src="notifications.js?v=1"></script>')
if '<script src="commissioner_v2.js"></script>' in html:
    html = html.replace('<script src="commissioner_v2.js"></script>', '<script src="commissioner_v2.js?v=2"></script>')
else:
    html = html.replace('commissioner_v2.js?v=1', 'commissioner_v2.js?v=2')
if 'rel="manifest"' not in html:
    html = html.replace('<title>Pick\'em</title>', '<title>Pick\'em</title>\n<link rel="manifest" href="manifest.webmanifest">\n<link rel="icon" href="icon.svg" type="image/svg+xml">\n<meta name="theme-color" content="#07111f">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">')
idx.write_text(html)

# Make the perfect-week opening streak follow the order results were entered,
# and award +0.5 for each consecutive correct result after a perfect week.
p = Path('commissioner_v2.js')
s = p.read_text()
marker = '  async function buildScoreData(){'
old = '    const scored=questions.filter(q=>q.counts_for_score!==false);'
new = '''    const scored=questions.filter(q=>q.counts_for_score!==false).sort((a,b)=>{\n      const ao=a.result_order==null?999999:Number(a.result_order);\n      const bo=b.result_order==null?999999:Number(b.result_order);\n      return ao-bo || Number(a.position||0)-Number(b.position||0);\n    });'''
if marker in s and new not in s[s.index(marker):]:
    start = s.index(marker)
    pos = s.index(old, start)
    s = s[:pos] + new + s[pos+len(old):]
s = s.replace('opening_streak:openingStreak,streak_bonus:openingStreak*1.5,',
              'opening_streak:openingStreak,streak_bonus:openingStreak*0.5,')
p.write_text(s)

# Refresh live Home/League data automatically while the weekend is active.
live = Path('live_weekend.js')
js = live.read_text()
refresh_marker = '  // LIVE_WEEKEND_AUTO_REFRESH'
if refresh_marker not in js:
    block = r'''

  // LIVE_WEEKEND_AUTO_REFRESH
  let liveRefreshBusy=false;
  setInterval(async()=>{
    if(liveRefreshBusy || !session || !week || !locked()) return;
    const active=[...document.querySelectorAll('.page')].find(x=>!x.classList.contains('hidden'))?.id;
    if(active!=='league' && active!=='home') return;
    liveRefreshBusy=true;
    try{
      await loadData();
      if(active==='league') await renderLeague();
      else renderHome();
    }catch(e){
      console.debug('Live refresh skipped',e);
    }finally{
      liveRefreshBusy=false;
    }
  },15000);
'''
    js = js.rsplit('})();',1)[0] + block + '})();\n'
live.write_text(js)
