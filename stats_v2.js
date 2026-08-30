// Standings + league/player stats upgrade.
(() => {
  let statsView = 'league';

  const n = v => Number(v || 0);
  const fmt = v => n(v).toFixed(1).replace(/\.0$/, '');
  const pct = (correct,total) => total ? (correct / total * 100) : 0;

  async function loadPublishedData(){
    const [profiles, weeks, scores] = await Promise.all([
      db('profiles?select=id,display_name,username,role'),
      db('weeks?status=eq.published&select=id,number,name,published_at&order=number.asc'),
      db('week_scores?select=*')
    ]);
    const publishedIds = new Set(weeks.map(w => w.id));
    return {
      profiles,
      weeks,
      scores: scores.filter(s => publishedIds.has(s.week_id))
    };
  }

  function profileName(p){ return p?.display_name || p?.username || 'Player'; }

  window.renderStandings = async function(){
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

  window.setStatsView = function(value){
    statsView = value || 'league';
    renderStats();
  };

  function selectorHtml(profiles){
    const players = [...profiles].sort((a,b) => profileName(a).localeCompare(profileName(b)));
    return '<div class="card"><label style="margin-top:0">View stats for</label><select id="statsViewSelect" onchange="setStatsView(this.value)">' +
      '<option value="league" '+(statsView==='league'?'selected':'')+'>League Overview</option>' +
      players.map(p => '<option value="'+p.id+'" '+(statsView===p.id?'selected':'')+'>'+esc(profileName(p))+'</option>').join('') +
      '</select></div>';
  }

  function leagueStatsHtml(profiles,weeks,scores){
    const totalCorrect = scores.reduce((a,s)=>a+n(s.correct_count),0);
    const totalQuestions = scores.reduce((a,s)=>a+n(s.question_count),0);
    const totalPoints = scores.reduce((a,s)=>a+n(s.total_points),0);
    const perfect = scores.filter(s=>n(s.question_count)>0 && n(s.correct_count)===n(s.question_count)).length;
    const unicorns = scores.reduce((a,s)=>a+n(s.unicorn_count),0);
    const upsets = scores.reduce((a,s)=>a+n(s.upset_count),0);
    const longest = Math.max(0,...scores.map(s=>n(s.opening_streak)));
    const avgWeekPts = scores.length ? totalPoints/scores.length : 0;
    const bestScore = scores.length ? [...scores].sort((a,b)=>n(b.total_points)-n(a.total_points))[0] : null;
    const names = Object.fromEntries(profiles.map(p=>[p.id,profileName(p)]));
    const weekMap = Object.fromEntries(weeks.map(w=>[w.id,w]));

    const playerRows = profiles.map(p => {
      const ps = scores.filter(s=>s.user_id===p.id);
      const correct = ps.reduce((a,s)=>a+n(s.correct_count),0);
      const q = ps.reduce((a,s)=>a+n(s.question_count),0);
      return {
        p, points:ps.reduce((a,s)=>a+n(s.total_points),0), correct, q,
        wins:ps.filter(s=>n(s.placement)===1).length,
        perfect:ps.filter(s=>n(s.question_count)>0&&n(s.correct_count)===n(s.question_count)).length,
        unicorns:ps.reduce((a,s)=>a+n(s.unicorn_count),0),
        upsets:ps.reduce((a,s)=>a+n(s.upset_count),0)
      };
    }).filter(r=>r.q>0).sort((a,b)=>b.points-a.points);

    let h = '<div class="grid three">' +
      '<div class="card"><div class="muted">League Pick Rate</div><div class="big">'+pct(totalCorrect,totalQuestions).toFixed(1)+'%</div></div>' +
      '<div class="card"><div class="muted">Total Correct Picks</div><div class="big">'+totalCorrect+'</div><div class="mini">'+totalQuestions+' total picks</div></div>' +
      '<div class="card"><div class="muted">Points Awarded</div><div class="big">'+fmt(totalPoints)+'</div></div>' +
      '<div class="card"><div class="muted">Published Weeks</div><div class="big">'+weeks.length+'</div></div>' +
      '<div class="card"><div class="muted">Perfect Rounds</div><div class="big">'+perfect+'</div></div>' +
      '<div class="card"><div class="muted">Unicorns</div><div class="big">'+unicorns+'</div></div>' +
      '<div class="card"><div class="muted">Upsets</div><div class="big">'+upsets+'</div></div>' +
      '<div class="card"><div class="muted">Avg Points / Player Week</div><div class="big">'+fmt(avgWeekPts)+'</div></div>' +
      '<div class="card"><div class="muted">Longest Opening Streak</div><div class="big">'+longest+'</div></div>' +
      '</div>';

    if(bestScore){
      const bw = weekMap[bestScore.week_id];
      h += '<div class="notice"><b>Best single week:</b> '+esc(names[bestScore.user_id]||'Player')+' — '+fmt(bestScore.total_points)+' pts in '+esc(bw?.name||'a published week')+'.</div>';
    }

    h += '<div class="card tablewrap"><h2>League Player Stats</h2><table class="table"><thead><tr><th>Player</th><th>Points</th><th>Pick %</th><th>Correct</th><th>Wins</th><th>Perfect</th><th>Unicorns</th><th>Upsets</th></tr></thead><tbody>' +
      playerRows.map(r => '<tr><td><b>'+esc(profileName(r.p))+'</b></td><td><b>'+fmt(r.points)+'</b></td><td>'+pct(r.correct,r.q).toFixed(1)+'%</td><td>'+r.correct+'/'+r.q+'</td><td>'+r.wins+'</td><td>'+r.perfect+'</td><td>'+r.unicorns+'</td><td>'+r.upsets+'</td></tr>').join('') +
      '</tbody></table></div>';

    const weekRows = weeks.map(w => {
      const ws = scores.filter(s=>s.week_id===w.id);
      const c = ws.reduce((a,s)=>a+n(s.correct_count),0);
      const q = ws.reduce((a,s)=>a+n(s.question_count),0);
      const pts = ws.reduce((a,s)=>a+n(s.total_points),0);
      return '<tr><td><b>'+esc(w.name||('Week '+w.number))+'</b></td><td>'+pct(c,q).toFixed(1)+'%</td><td>'+c+'/'+q+'</td><td>'+fmt(pts)+'</td></tr>';
    }).join('');
    h += '<div class="card tablewrap"><h2>League by Week</h2><table class="table"><thead><tr><th>Week</th><th>League Pick %</th><th>Correct</th><th>Total Points</th></tr></thead><tbody>'+weekRows+'</tbody></table></div>';
    return h;
  }

  function playerStatsHtml(target,profiles,weeks,scores){
    const ps = scores.filter(s=>s.user_id===target.id);
    const names = Object.fromEntries(profiles.map(p=>[p.id,profileName(p)]));
    const weekMap = Object.fromEntries(weeks.map(w=>[w.id,w]));
    if(!ps.length){
      return '<div class="card"><h2>'+esc(profileName(target))+'</h2><p class="muted">No published stats yet.</p></div>';
    }

    const totalsByUser = {};
    scores.forEach(s=>totalsByUser[s.user_id]=(totalsByUser[s.user_id]||0)+n(s.total_points));
    const ranked = Object.entries(totalsByUser).sort((a,b)=>b[1]-a[1]);
    const rank = ranked.findIndex(r=>r[0]===target.id)+1;
    const points = ps.reduce((a,s)=>a+n(s.total_points),0);
    const correct = ps.reduce((a,s)=>a+n(s.correct_count),0);
    const q = ps.reduce((a,s)=>a+n(s.question_count),0);
    const wins = ps.filter(s=>n(s.placement)===1).length;
    const perfect = ps.filter(s=>n(s.question_count)>0&&n(s.correct_count)===n(s.question_count)).length;
    const unicorns = ps.reduce((a,s)=>a+n(s.unicorn_count),0);
    const upsets = ps.reduce((a,s)=>a+n(s.upset_count),0);
    const longest = Math.max(0,...ps.map(s=>n(s.opening_streak)));
    const pcts = ps.map(s=>s.pick_percentage!=null?n(s.pick_percentage):pct(n(s.correct_count),n(s.question_count)));
    const bestPct = Math.max(...pcts), worstPct = Math.min(...pcts);
    const avgPts = points/ps.length;

    let h = '<div class="card"><div class="eyebrow">PLAYER STATS</div><h2 style="margin-bottom:0">'+esc(profileName(target))+'</h2></div>';
    h += '<div class="grid three">' +
      '<div class="card"><div class="muted">Season Rank</div><div class="big">#'+rank+'</div></div>' +
      '<div class="card"><div class="muted">Season Points</div><div class="big">'+fmt(points)+'</div></div>' +
      '<div class="card"><div class="muted">Pick Rate</div><div class="big">'+pct(correct,q).toFixed(1)+'%</div></div>' +
      '<div class="card"><div class="muted">Correct Picks</div><div class="big">'+correct+'/'+q+'</div></div>' +
      '<div class="card"><div class="muted">Weekly Wins</div><div class="big">'+wins+'</div></div>' +
      '<div class="card"><div class="muted">Perfect Rounds</div><div class="big">'+perfect+'</div></div>' +
      '<div class="card"><div class="muted">Unicorns</div><div class="big">'+unicorns+'</div></div>' +
      '<div class="card"><div class="muted">Upsets</div><div class="big">'+upsets+'</div></div>' +
      '<div class="card"><div class="muted">Avg Points / Week</div><div class="big">'+fmt(avgPts)+'</div></div>' +
      '<div class="card"><div class="muted">Best / Worst Pick %</div><div class="big">'+bestPct.toFixed(0)+'% / '+worstPct.toFixed(0)+'%</div></div>' +
      '<div class="card"><div class="muted">Longest Opening Streak</div><div class="big">'+longest+'</div></div>' +
      '</div>';

    const rows = [...ps].sort((a,b)=>n(weekMap[b.week_id]?.number)-n(weekMap[a.week_id]?.number));
    h += '<div class="card tablewrap"><h2>Week-by-Week</h2><table class="table"><thead><tr><th>Week</th><th>Finish</th><th>Correct</th><th>Pick %</th><th>Place Pts</th><th>Bonuses</th><th>Total</th></tr></thead><tbody>' +
      rows.map(r=>{
        const w=weekMap[r.week_id]||{};
        const rp=r.pick_percentage!=null?n(r.pick_percentage):pct(n(r.correct_count),n(r.question_count));
        const bonus=n(r.perfect_bonus)+n(r.unicorn_bonus)+n(r.upset_bonus)+n(r.streak_bonus)+n(r.cold_bonus);
        return '<tr><td><b>'+esc(w.name||('Week '+(w.number||'')))+'</b></td><td>#'+r.placement+'</td><td>'+n(r.correct_count)+'/'+n(r.question_count)+'</td><td>'+rp.toFixed(1)+'%</td><td>'+fmt(r.placement_points)+'</td><td>'+fmt(bonus)+'</td><td><b>'+fmt(r.total_points)+'</b></td></tr>';
      }).join('') + '</tbody></table></div>';
    return h;
  }

  window.renderStats = async function(){
    if(!session) return;
    const box = el('statsBox');
    if(!box) return;
    box.innerHTML = '<div class="muted">Loading stats…</div>';
    try{
      const {profiles,weeks,scores} = await loadPublishedData();
      if(statsView!=='league' && !profiles.some(p=>p.id===statsView)) statsView='league';
      let h = selectorHtml(profiles);
      if(!weeks.length || !scores.length){
        box.innerHTML = h + '<div class="card"><h2>No published stats yet</h2><p class="muted">Stats appear after the first week is scored and published.</p></div>';
        return;
      }
      if(statsView==='league') h += leagueStatsHtml(profiles,weeks,scores);
      else {
        const target=profiles.find(p=>p.id===statsView);
        h += playerStatsHtml(target,profiles,weeks,scores);
      }
      box.innerHTML = h;
    }catch(e){
      console.error(e);
      box.innerHTML = '<div class="notice">Could not load stats.</div>';
    }
  };

  // Refresh if this file arrives after the initial page boot.
  if(session){
    const standingsPage=el('standings');
    const statsPage=el('stats');
    if(standingsPage && !standingsPage.classList.contains('hidden')) renderStandings();
    if(statsPage && !statsPage.classList.contains('hidden')) renderStats();
  }
})();
