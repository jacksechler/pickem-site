from pathlib import Path
import re

# Keep the just-published week's League Picks/results featured for 24 hours,
# even after the commissioner creates the next active week.
p=Path('history_profiles.js')
s=p.read_text()

old="""  let selectedLeagueWeekId = null;\n  let historyWeekId = null;"""
new="""  let selectedLeagueWeekId = null;\n  let leagueSelectionManual = false;\n  let historyWeekId = null;"""
if old not in s:
    raise SystemExit('league selection state anchor missing')
s=s.replace(old,new,1)

old="""  async function availableWeeks(){\n    const rows=await db('weeks?select=*&order=number.desc');\n    return rows.filter(w => w.status==='published' || (w.is_active && (w.status==='published' || Date.now()>=new Date(w.lock_at).getTime() || !!w.auto_locked_at)));\n  }\n"""
new="""  async function availableWeeks(){\n    const rows=await db('weeks?select=*&order=number.desc');\n    return rows.filter(w => w.status==='published' || (w.is_active && (w.status==='published' || Date.now()>=new Date(w.lock_at).getTime() || !!w.auto_locked_at)));\n  }\n\n  const FINAL_FEATURE_MS = 24*60*60*1000;\n  function isFreshPublishedWeek(w){\n    if(!w || w.status!=='published' || !w.published_at) return false;\n    const age=Date.now()-new Date(w.published_at).getTime();\n    return age>=0 && age<FINAL_FEATURE_MS;\n  }\n\n  function finalFeatureTimeLeft(w){\n    if(!isFreshPublishedWeek(w)) return '';\n    const left=Math.max(0,FINAL_FEATURE_MS-(Date.now()-new Date(w.published_at).getTime()));\n    const hours=Math.floor(left/3600000);\n    const mins=Math.max(1,Math.ceil((left-hours*3600000)/60000));\n    if(hours>=1) return hours+'h '+Math.min(59,mins)+'m';\n    return mins+'m';\n  }\n"""
if old not in s:
    raise SystemExit('availableWeeks anchor missing')
s=s.replace(old,new,1)

old="""  window.setLeagueHistoryWeek=async function(id){ selectedLeagueWeekId=id; await renderLeague(); };"""
new="""  window.setLeagueHistoryWeek=async function(id){ leagueSelectionManual=true; selectedLeagueWeekId=id; await renderLeague(); };"""
if old not in s:
    raise SystemExit('setLeagueHistoryWeek anchor missing')
s=s.replace(old,new,1)

old="""      const weeks=await availableWeeks();\n      const activeId=week?.id||null;\n      if(!selectedLeagueWeekId) selectedLeagueWeekId=activeId || weeks[0]?.id || null;\n      if(selectedLeagueWeekId && !weeks.some(w=>w.id===selectedLeagueWeekId) && selectedLeagueWeekId!==activeId) selectedLeagueWeekId=weeks[0]?.id||activeId;\n"""
new="""      const weeks=await availableWeeks();\n      const activeId=week?.id||null;\n      const freshPublished=weeks.find(w=>isFreshPublishedWeek(w))||null;\n\n      // A newly finished week stays the default League Picks/results view for\n      // 24 hours, even if a newer draft week is already active. Manual week\n      // selections always win and are never overridden by this feature.\n      if(!selectedLeagueWeekId){\n        if(freshPublished && freshPublished.id!==activeId){\n          selectedLeagueWeekId=freshPublished.id;\n          leagueSelectionManual=false;\n        }else{\n          selectedLeagueWeekId=activeId || weeks[0]?.id || null;\n          leagueSelectionManual=false;\n        }\n      }\n      if(selectedLeagueWeekId && !weeks.some(w=>w.id===selectedLeagueWeekId) && selectedLeagueWeekId!==activeId){\n        selectedLeagueWeekId=freshPublished?.id || activeId || weeks[0]?.id || null;\n        leagueSelectionManual=false;\n      }\n\n      // If the current selection happened automatically (for example it was\n      // the active week before Create Next Week), keep that published week\n      // featured only while its 24-hour window is still open.\n      if(!leagueSelectionManual && activeId && selectedLeagueWeekId!==activeId){\n        const selectedWeek=weeks.find(w=>w.id===selectedLeagueWeekId);\n        if(!isFreshPublishedWeek(selectedWeek)){\n          selectedLeagueWeekId=activeId;\n        }\n      }\n"""
if old not in s:
    raise SystemExit('renderLeague selection block missing')
s=s.replace(old,new,1)

old="""      const d=await loadWeekBundle(selectedLeagueWeekId);\n      h+='<div class=\"card\"><div class=\"eyebrow\">'+(d.week?.status==='published'?'FINAL WEEK':'LIVE WEEK')+'</div><div class=\"row\" style=\"align-items:flex-end;gap:12px;flex-wrap:wrap\"><div><h2 style=\"margin:4px 0\">'+esc(d.week?.name||'Week')+'</h2><div class=\"muted\">Every pick, result, tiebreaker, and weekly stat in one place.</div></div><button class=\"btn secondary\" onclick=\"openHistoryWeek(\\''+selectedLeagueWeekId+'\\')\">Open Full Week History</button></div></div>';\n      h+=weekScoreSummary(d)+fullGridHtml(d)+screenshotGridHtml(d);\n"""
new="""      const d=await loadWeekBundle(selectedLeagueWeekId);\n      const featuredFinal=!!(activeId && d.week?.id!==activeId && isFreshPublishedWeek(d.week));\n      h+='<div class=\"card\"><div class=\"eyebrow\">'+(d.week?.status==='published'?'FINAL WEEK':'LIVE WEEK')+'</div><div class=\"row\" style=\"align-items:flex-end;gap:12px;flex-wrap:wrap\"><div><h2 style=\"margin:4px 0\">'+esc(d.week?.name||'Week')+'</h2><div class=\"muted\">Every pick, result, tiebreaker, and weekly stat in one place.</div></div><button class=\"btn secondary\" onclick=\"openHistoryWeek(\\''+selectedLeagueWeekId+'\\')\">Open Full Week History</button></div></div>';\n      if(featuredFinal){\n        h+='<div class=\"notice\"><b>🏆 Final results are still featured.</b><div class=\"muted\">'+esc(d.week?.name||'This week')+' stays on League Picks for 24 hours after publication. About <b>'+esc(finalFeatureTimeLeft(d.week))+'</b> remaining. Use the Week menu above anytime to switch weeks.</div></div>';\n      }\n      h+=weekScoreSummary(d)+fullGridHtml(d)+screenshotGridHtml(d);\n"""
if old not in s:
    raise SystemExit('League final header anchor missing')
s=s.replace(old,new,1)
p.write_text(s)

# Load the changed history renderer with a fresh cache key.
p=Path('index.html')
s=p.read_text()
s=re.sub(r'<script src="history_profiles\.js\?v=\d+"></script>','<script src="history_profiles.js?v=2"></script>',s,count=1)
s=re.sub(r'<script src="app_update\.js\?v=\d+"></script>','<script src="app_update.js?v=10"></script>',s,count=1)
p.write_text(s)

# Bump app version so installed iPhone PWAs receive the behavior.
p=Path('app_update.js')
s=p.read_text()
s=re.sub(r"const BUILD_VERSION = '[^']+';","const BUILD_VERSION = '2026.09.08.2';",s,count=1)
p.write_text(s)
Path('app-version.json').write_text('{"version":"2026.09.08.2"}\n')
