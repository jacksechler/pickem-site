from pathlib import Path

p = Path('stats_v2.js')
s = p.read_text()
start = s.index('  window.renderStandings = async function(){')
end = s.index('  window.setStatsView = function(value){')
replacement = '''  window.renderStandings = async function(){
    if(!session) return;
    const box = el('standingsBox');
    if(!box) return;
    box.innerHTML = '<div class="muted">Loading standings…</div>';
    try{
      const {profiles,weeks,scores} = await loadPublishedData();
      if(!weeks.length || !scores.length){
        box.innerHTML = '<h2>No published scores yet</h2><p class="muted">Season standings appear after the first week is scored and published.</p>';
        return;
      }

      const totals = {};
      const weeksPlayed = {};
      scores.forEach(s => {
        totals[s.user_id] = (totals[s.user_id] || 0) + n(s.total_points);
        weeksPlayed[s.user_id] = (weeksPlayed[s.user_id] || 0) + 1;
      });

      const rows = profiles
        .filter(p => totals[p.id] !== undefined)
        .map(p => ({ profile:p, total:totals[p.id], weeks:weeksPlayed[p.id] || 0 }))
        .sort((a,b) => b.total - a.total || profileName(a.profile).localeCompare(profileName(b.profile)));

      box.innerHTML = '<div class="notice"><b>Season Points</b><div class="muted">Running total from every published week, including placement points and bonuses.</div></div>' +
        '<div class="tablewrap"><table class="table"><thead><tr><th>Rank</th><th>Player</th><th>Season Points</th></tr></thead><tbody>' +
        rows.map((r,i) => '<tr><td><b>#'+(i+1)+'</b></td><td><b>'+esc(profileName(r.profile))+'</b><div class="mini">'+r.weeks+' week'+(r.weeks===1?'':'s')+' scored</div></td><td><b style="font-size:22px">'+fmt(r.total)+' pts</b></td></tr>').join('') +
        '</tbody></table></div>';
    }catch(e){
      console.error(e);
      box.innerHTML = '<div class="notice">Standings unavailable.</div>';
    }
  };

'''
p.write_text(s[:start] + replacement + s[end:])
