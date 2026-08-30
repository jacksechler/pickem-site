from pathlib import Path

p = Path('stats_v2.js')
s = p.read_text()
start = s.index('  window.renderStandings = async function(){')
end = s.index('  window.setStatsView = function(value){')
replacement = r'''  window.renderStandings = async function(){
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

      const latestWeek = weeks[weeks.length-1];
      const earlierWeekIds = new Set(weeks.slice(0,-1).map(w=>w.id));
      const totals = {}, correct = {}, questions = {}, latestScores = {}, priorTotals = {};

      scores.forEach(s=>{
        totals[s.user_id] = (totals[s.user_id]||0) + n(s.total_points);
        correct[s.user_id] = (correct[s.user_id]||0) + n(s.correct_count);
        questions[s.user_id] = (questions[s.user_id]||0) + n(s.question_count);
        if(s.week_id===latestWeek.id) latestScores[s.user_id]=s;
        if(earlierWeekIds.has(s.week_id)) priorTotals[s.user_id]=(priorTotals[s.user_id]||0)+n(s.total_points);
      });

      const nameOfId = id => profileName(profiles.find(p=>p.id===id));
      const currentIds = Object.keys(totals).sort((a,b)=>totals[b]-totals[a] || nameOfId(a).localeCompare(nameOfId(b)));
      const previousIds = Object.keys(priorTotals).sort((a,b)=>priorTotals[b]-priorTotals[a] || nameOfId(a).localeCompare(nameOfId(b)));
      const previousRank = Object.fromEntries(previousIds.map((id,i)=>[id,i+1]));

      const movementHtml = (id,currentRank) => {
        if(weeks.length<2 || !previousRank[id]) return '<span class="muted">—</span>';
        const move = previousRank[id]-currentRank;
        if(move>0) return '<span style="color:var(--green);font-weight:950">↑ '+move+'</span>';
        if(move<0) return '<span style="color:var(--red);font-weight:950">↓ '+Math.abs(move)+'</span>';
        return '<span class="muted" style="font-weight:850">—</span>';
      };

      let h = '<div class="notice"><b>Season Standings</b><div class="muted">Ordered by total season points through '+esc(latestWeek.name||('Week '+latestWeek.number))+'.</div></div>';
      h += '<div>';
      currentIds.forEach((id,i)=>{
        const player = profiles.find(p=>p.id===id);
        const rank = i+1;
        const last = latestScores[id];
        const seasonPct = questions[id] ? correct[id]/questions[id]*100 : 0;
        h += '<div class="card" style="padding:16px 18px;margin:10px 0">'+
          '<div style="display:flex;align-items:center;gap:14px">'+
            '<div style="width:38px;font-size:22px;font-weight:950;color:var(--muted)">#'+rank+'</div>'+
            '<div style="flex:1;min-width:0"><div style="font-size:18px;font-weight:950;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(profileName(player))+'</div></div>'+
            '<div style="text-align:right"><div style="font-size:27px;line-height:1;font-weight:950;color:var(--accent)">'+fmt(totals[id])+'</div><div class="mini">season pts</div></div>'+
          '</div>'+
          '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:15px;padding-top:13px;border-top:1px solid var(--line);text-align:center">'+
            '<div><div class="mini">LAST WEEK FINISH</div><div style="font-size:17px;font-weight:950;margin-top:3px">'+(last&&last.placement?'#'+last.placement:'—')+'</div></div>'+
            '<div><div class="mini">MOVEMENT</div><div style="font-size:17px;margin-top:3px">'+movementHtml(id,rank)+'</div></div>'+
            '<div><div class="mini">SEASON PICK %</div><div style="font-size:17px;font-weight:950;margin-top:3px">'+seasonPct.toFixed(1)+'%</div></div>'+
          '</div>'+
        '</div>';
      });
      h += '</div>';
      box.innerHTML = h;
    }catch(e){
      console.error(e);
      box.innerHTML = '<div class="notice">Standings unavailable.</div>';
    }
  };

'''
p.write_text(s[:start] + replacement + s[end:])

idx = Path('index.html')
html = idx.read_text()
html = html.replace('stats_v2.js?v=5','stats_v2.js?v=6').replace('stats_v2.js?v=4','stats_v2.js?v=6').replace('stats_v2.js?v=3','stats_v2.js?v=6').replace('stats_v2.js?v=2','stats_v2.js?v=6').replace('stats_v2.js?v=1','stats_v2.js?v=6').replace('stats_v2.js"','stats_v2.js?v=6"')
idx.write_text(html)
