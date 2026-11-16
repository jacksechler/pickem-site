// Published regular-season totals, accumulated chronologically.
(() => {
  const host=document.getElementById('seasonPointsGraph');
  const colors=['#67c5ff','#f7ce70','#fa829c','#68dfb6','#bf9bff','#ff9d64','#b8db65','#e5e9f2'];
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let request=0,series=[],weeks=[],selected=0,hidden=new Set();
  const format=value=>Number(value.toFixed(2)).toLocaleString();
  function draw(){
    if(!weeks.length){host.innerHTML='<h2>Season points tracker</h2><p class="muted">The graph starts after the first week is published.</p>';return;}
    const visible=series.filter(p=>!hidden.has(p.id));
    const values=visible.flatMap(p=>p.values);
    const low=Math.min(0,...values),high=Math.max(1,...values);
    const step=Math.max(1,Math.ceil((high-low)/5));
    const bottom=Math.floor(low/step)*step,top=Math.ceil(high/step)*step;
    const x=i=>54+i*(640/(weeks.length));
    const y=v=>270-(v-bottom)/(top-bottom)*240;
    let svg='<svg style="display:block;width:100%;height:auto" viewBox="0 0 720 310" role="img" aria-label="Cumulative season points by week. Exact values are listed below.">';
    for(let tick=bottom;tick<=top;tick+=step){
      svg+='<path d="M54 '+y(tick)+' H694" stroke="#ffffff20"/><text x="46" y="'+(y(tick)+4)+'" text-anchor="end" fill="#b6c3d5" font-size="12">'+format(tick)+'</text>';
    }
    svg+='<text x="54" y="293" text-anchor="middle" fill="#b6c3d5" font-size="12">Start</text>';
    weeks.forEach((w,i)=>{if(i%Math.max(1,Math.ceil(weeks.length/10))===0||i===weeks.length-1)svg+='<text x="'+x(i+1)+'" y="293" text-anchor="middle" fill="#b6c3d5" font-size="12">W'+w.number+'</text>';});
    visible.forEach(player=>{
      svg+='<polyline fill="none" stroke="'+player.color+'" stroke-width="2.5" stroke-linejoin="round" points="'+player.values.map((v,i)=>x(i)+','+y(v)).join(' ')+'"/>';
      svg+='<circle cx="'+x(selected+1)+'" cy="'+y(player.values[selected+1])+'" r="4" fill="'+player.color+'"><title>'+escape(player.name)+' · '+escape(weeks[selected].name)+': '+format(player.values[selected+1])+' points</title></circle>';
    });
    svg+='</svg>';
    host.innerHTML='<div class="eyebrow">THE SEASON RACE</div><h2>Season points tracker</h2><p class="muted">Each week adds to the running total, including bonuses and penalties. Published regular-season weeks only.</p><div style="display:flex;flex-wrap:wrap;gap:8px;margin:16px 0">'+series.map(p=>'<button type="button" data-player="'+escape(p.id)+'" aria-pressed="'+!hidden.has(p.id)+'" style="border:1px solid '+p.color+';border-radius:20px;background:#172235;color:'+p.color+';padding:8px 12px;opacity:'+(hidden.has(p.id)?'.45':'1')+'">'+escape(p.name)+'</button>').join('')+'</div>'+svg+'<label>View totals through<select id="seasonPointsWeek">'+weeks.map((w,i)=>'<option value="'+i+'" '+(selected===i?'selected':'')+'>'+escape(w.name)+'</option>').join('')+'</select></label><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:14px">'+visible.slice().sort((a,b)=>b.values[selected+1]-a.values[selected+1]).map(p=>'<div style="padding:10px;border-left:3px solid '+p.color+';background:#ffffff06"><strong>'+escape(p.name)+'</strong><div>'+format(p.values[selected+1])+' total points <span class="muted">('+(p.gains[selected]>=0?'+':'')+format(p.gains[selected])+' this week)</span></div></div>').join('')+'</div>';
    host.querySelector('#seasonPointsWeek').onchange=event=>{selected=Number(event.target.value);draw();};
    host.querySelectorAll('[data-player]').forEach(button=>button.onclick=()=>{const id=button.dataset.player;if(hidden.has(id))hidden.delete(id);else hidden.add(id);draw();});
  }
  async function load(){
    if(!session?.user?.id)return;
    const token=++request;
    try{
      const [published,scores,profiles]=await Promise.all([
        db('weeks?phase=eq.regular&status=eq.published&select=id,name,number,season_id&order=number.asc'),
        db('week_scores?select=week_id,user_id,total_points,weeks!inner(phase,status)&weeks.phase=eq.regular&weeks.status=eq.published'),
        db('profiles?select=id,display_name,username')
      ]);
      if(token!==request)return;
      const season=week?.season_id||published[published.length-1]?.season_id;
      weeks=published.filter(w=>w.season_id===season);
      const ids=new Set(weeks.map(w=>w.id));
      const relevant=scores.filter(s=>ids.has(s.week_id));
      const users=new Set(relevant.map(s=>s.user_id));
      series=profiles.filter(p=>users.has(p.id)).map((p,i)=>{
        let total=0;
        const gains=weeks.map(w=>Number(relevant.find(s=>s.user_id===p.id&&s.week_id===w.id)?.total_points||0));
        return {id:p.id,name:window.MemberNames?.full(p)||p.display_name||p.username,color:colors[i%colors.length],gains,values:[0,...gains.map(gain=>total+=gain)]};
      });
      selected=Math.max(0,weeks.length-1);draw();
    }catch(e){if(token===request)host.innerHTML='<h2>Season points tracker</h2><p>Could not load the graph.</p><button type="button" id="retrySeasonGraph">Retry</button>';host.querySelector('#retrySeasonGraph')?.addEventListener('click',load);}
  }
  const previous=window.renderStandings;
  window.renderStandings=async function(){
    const result=await previous.apply(this,arguments);
    const standings=document.getElementById('standingsBox');
    if(standings&&!standings.contains(host))standings.appendChild(host);
    await load();
    return result;
  };
})();
