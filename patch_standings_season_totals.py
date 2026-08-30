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

      // Build cumulative rank history after each published week.
      const runningTotals = {};
      const rankHistory = Object.fromEntries(currentIds.map(id=>[id,[]]));
      weeks.forEach(w=>{
        scores.filter(s=>s.week_id===w.id).forEach(s=>{
          runningTotals[s.user_id]=(runningTotals[s.user_id]||0)+n(s.total_points);
        });
        const rankedIds = Object.keys(runningTotals).sort((a,b)=>runningTotals[b]-runningTotals[a] || nameOfId(a).localeCompare(nameOfId(b)));
        const ranks = Object.fromEntries(rankedIds.map((id,i)=>[id,i+1]));
        currentIds.forEach(id=>rankHistory[id].push(ranks[id]||null));
      });

      const palette = ['#22c55e','#3b82f6','#f97316','#a855f7','#eab308','#ef4444','#14b8a6','#ec4899'];
      const stableIds = [...currentIds].sort((a,b)=>nameOfId(a).localeCompare(nameOfId(b)));
      const colorOf = Object.fromEntries(stableIds.map((id,i)=>[id,palette[i%palette.length]]));
      const W=760,H=390,L=44,R=22,T=24,B=58;
      const PW=W-L-R, PH=H-T-B;
      const xAt = i => weeks.length===1 ? L+PW/2 : L+(i/(weeks.length-1))*PW;
      const yAt = rank => T+((rank-1)/Math.max(currentIds.length-1,1))*PH;

      let svg = '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Season movement chart" style="display:block;width:100%;min-width:650px;height:auto">';
      for(let rank=1;rank<=currentIds.length;rank++){
        const y=yAt(rank);
        svg += '<line x1="'+L+'" y1="'+y+'" x2="'+(W-R)+'" y2="'+y+'" stroke="currentColor" opacity="0.10" stroke-width="1"/>'+
               '<text x="8" y="'+(y+5)+'" fill="currentColor" opacity="0.6" font-size="13" font-weight="800">#'+rank+'</text>';
      }
      weeks.forEach((w,i)=>{
        const x=xAt(i);
        svg += '<line x1="'+x+'" y1="'+T+'" x2="'+x+'" y2="'+(H-B)+'" stroke="currentColor" opacity="0.06" stroke-width="1"/>'+
               '<text x="'+x+'" y="'+(H-18)+'" text-anchor="middle" fill="currentColor" opacity="0.65" font-size="13" font-weight="800">W'+w.number+'</text>';
      });

      currentIds.forEach(id=>{
        const hist=rankHistory[id];
        const pts=[];
        hist.forEach((rank,i)=>{ if(rank) pts.push(xAt(i)+','+yAt(rank)); });
        if(pts.length){
          svg += '<polyline points="'+pts.join(' ')+'" fill="none" stroke="'+colorOf[id]+'" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>';
          hist.forEach((rank,i)=>{
            if(!rank) return;
            const x=xAt(i), y=yAt(rank);
            svg += '<circle cx="'+x+'" cy="'+y+'" r="5.5" fill="'+colorOf[id]+'" stroke="var(--card)" stroke-width="2"><title>'+esc(nameOfId(id))+' · Week '+weeks[i].number+' · #'+rank+'</title></circle>';
          });
        }
      });
      svg += '</svg>';

      const legend = currentIds.map(id=>
        '<div style="display:flex;align-items:center;gap:8px;min-width:0">'+
          '<span style="width:10px;height:10px;border-radius:999px;background:'+colorOf[id]+';flex:0 0 auto"></span>'+
          '<span style="font-size:13px;font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(nameOfId(id))+'</span>'+
        '</div>'
      ).join('');

      h += '<div class="card" style="margin-top:18px;padding:18px">'+
        '<div class="eyebrow">SEASON MOVEMENT</div>'+
        '<h2 style="margin:4px 0 4px">Rank Tracker</h2>'+
        '<div class="muted" style="margin-bottom:12px">Cumulative season rank after every published week. #1 is best.</div>'+
        '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch">'+svg+'</div>'+
        '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px 14px;margin-top:12px">'+legend+'</div>'+
      '</div>';

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
for v in range(1,8):
    html = html.replace(f'stats_v2.js?v={v}', 'stats_v2.js?v=7')
html = html.replace('stats_v2.js"','stats_v2.js?v=7"')
idx.write_text(html)
