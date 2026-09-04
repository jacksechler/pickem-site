from pathlib import Path

# Load/cache-bust the live weekend script after the existing app upgrades.
idx = Path('index.html')
html = idx.read_text()
if 'live_weekend.js' not in html:
    html = html.replace('<script src="account_tools.js?v=1"></script>', '<script src="account_tools.js?v=1"></script>\n<script src="live_weekend.js?v=3"></script>')
else:
    html = html.replace('live_weekend.js?v=1', 'live_weekend.js?v=3')
    html = html.replace('live_weekend.js?v=2', 'live_weekend.js?v=3')
if 'screenshot_grid.js' not in html:
    html = html.replace('<script src="live_weekend.js?v=3"></script>', '<script src="live_weekend.js?v=3"></script>\n<script src="screenshot_grid.js?v=2"></script>')
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

# Keep Home/League Picks live without constantly rebuilding the page.
# Poll quietly, compare a small fingerprint, and only re-render when something
# that changes the live experience actually changed in the database.
live = Path('live_weekend.js')
js = live.read_text()
refresh_marker = '  // LIVE_WEEKEND_AUTO_REFRESH'
block = r'''
  // LIVE_WEEKEND_AUTO_REFRESH
  // Quiet change-aware polling: no visual refresh unless live data actually changes.
  let liveRefreshBusy=false;
  const localLiveFingerprint=()=>JSON.stringify({
    week:week?.id||null,
    status:week?.status||null,
    lock_at:week?.lock_at||null,
    auto_locked_at:week?.auto_locked_at||null,
    published_at:week?.published_at||null,
    results:[...questions]
      .sort((a,b)=>Number(a.position||0)-Number(b.position||0))
      .map(q=>[q.id,q.result,q.result_order,q.result_entered_at])
  });
  let liveFingerprint=localLiveFingerprint();

  setInterval(async()=>{
    if(liveRefreshBusy || !session || !week || document.visibilityState==='hidden') return;
    const active=[...document.querySelectorAll('.page')].find(x=>!x.classList.contains('hidden'))?.id;
    if(active!=='league' && active!=='home') return;
    liveRefreshBusy=true;
    try{
      const [freshWeekRows,freshQuestions]=await Promise.all([
        db('weeks?id=eq.'+week.id+'&select=id,status,lock_at,auto_locked_at,published_at&limit=1'),
        db('questions?week_id=eq.'+week.id+'&select=id,position,result,result_order,result_entered_at&order=position.asc')
      ]);
      const fw=freshWeekRows?.[0];
      const nextFingerprint=JSON.stringify({
        week:fw?.id||week.id,
        status:fw?.status||null,
        lock_at:fw?.lock_at||null,
        auto_locked_at:fw?.auto_locked_at||null,
        published_at:fw?.published_at||null,
        results:(freshQuestions||[]).map(q=>[q.id,q.result,q.result_order,q.result_entered_at])
      });
      if(nextFingerprint===liveFingerprint) return;

      const y=window.scrollY;
      await loadData();
      liveFingerprint=localLiveFingerprint();
      if(active==='league') await renderLeague();
      else renderHome();
      requestAnimationFrame(()=>window.scrollTo(0,y));
    }catch(e){
      console.debug('Live change check skipped',e);
    }finally{
      liveRefreshBusy=false;
    }
  },20000);
'''
if refresh_marker in js:
    js = js[:js.index(refresh_marker)] + block + '})();\n'
else:
    js = js.rsplit('})();',1)[0] + '\n' + block + '})();\n'
live.write_text(js)
