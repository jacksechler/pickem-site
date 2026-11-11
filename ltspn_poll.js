(() => {
  const box=document.getElementById('pollBox');
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let catalog=[],weeks=[],ballots=[],profiles=[],selected='',draft=[],busy=false,request=0;
  const current=()=>weeks.find(w=>w.id===selected);
  const editable=()=>current()?.is_active===true;
  const name=id=>catalog.find(t=>t.id===id)?.name||id;
  function results(){
    const totals=new Map();
    ballots.forEach(ballot=>ballot.teams.forEach((id,index)=>{
      const row=totals.get(id)||{id,points:0,first:0};
      row.points+=25-index;
      row.first+=index===0?1:0;
      totals.set(id,row);
    }));
    return [...totals.values()].sort((a,b)=>b.points-a.points||name(a.id).localeCompare(name(b.id)));
  }
  function render(){
    const rows=results();
    let rank=0,previous=null;
    const ranked=rows.map((r,i)=>{
      if(r.points!==previous)rank=i+1;
      previous=r.points;
      return {...r,rank};
    });
    box.innerHTML='<div class="card"><label>Poll week<select id="pollWeek">'+weeks.map(w=>'<option value="'+w.id+'" '+(w.id===selected?'selected':'')+'>'+escape(w.name)+(w.is_active?' · Voting open':' · Archived')+'</option>').join('')+'</select></label><p>'+ballots.length+' ballots submitted · 25 points for No. 1 down to 1 for No. 25. Ties share a rank.</p><p class="muted">Voting stays open until the next league week becomes active. Just for fun — no effect on league standings.</p></div>'+
      '<div class="poll-columns"><section class="card"><h2>LTSPN Top 25</h2>'+(!rows.length?'<p>The first submitted ballot starts this week’s rankings.</p>':'<div class="poll-table"><table class="table"><thead><tr><th>Rank</th><th>Team</th><th>Points</th><th>1st</th></tr></thead><tbody>'+ranked.filter(r=>r.rank<=25).map(r=>'<tr><td>'+r.rank+'</td><td>'+escape(name(r.id))+'</td><td>'+r.points+'</td><td>'+r.first+'</td></tr>').join('')+'</tbody></table></div>')+
      (ranked.some(r=>r.rank>25)?'<h3>Also receiving votes</h3><p>'+ranked.filter(r=>r.rank>25).map(r=>escape(name(r.id))+' '+r.points).join(' · ')+'</p>':'')+
      '<h3>Voters</h3><p>'+escape(ballots.map(b=>profiles.find(p=>p.id===b.user_id)?.display_name||'Member').join(', ')||'No ballots yet')+'</p></section>'+
      '<section class="card"><h2>My Top 25</h2><p>'+draft.length+'/25 teams ranked'+(editable()?' · Use arrows to reorder.':' · Voting closed.')+'</p>'+
      (editable()?'<label>Find a college team<input id="pollSearch" placeholder="Search school or mascot" autocomplete="off"></label><div id="pollMatches"></div>':'')+
      '<ol class="poll-ballot">'+draft.map((id,i)=>'<li><span>'+escape(name(id))+'</span>'+(editable()?'<div><button data-up="'+i+'" aria-label="Move '+escape(name(id))+' up" '+(i===0?'disabled':'')+'>↑</button><button data-down="'+i+'" aria-label="Move '+escape(name(id))+' down" '+(i===24||i===draft.length-1?'disabled':'')+'>↓</button><button data-remove="'+i+'" aria-label="Remove '+escape(name(id))+'">×</button></div>':'')+'</li>').join('')+'</ol>'+
      (editable()?'<button class="btn" id="pollSubmit" '+(draft.length!==25||busy?'disabled':'')+'>'+(busy?'Saving…':ballots.some(b=>b.user_id===session.user.id)?'Update ballot':'Submit ballot')+'</button>':'')+'<p id="pollStatus" role="status"></p></section></div>';
    document.getElementById('pollWeek').onchange=e=>load(e.target.value);
    const search=document.getElementById('pollSearch');
    if(search)search.oninput=()=>{
      const query=search.value.trim().toLowerCase();
      document.getElementById('pollMatches').innerHTML=query?catalog.filter(t=>!draft.includes(t.id)&&t.name.toLowerCase().includes(query)).slice(0,12).map(t=>'<button data-add="'+t.id+'" '+(draft.length>=25?'disabled':'')+'>'+escape(t.name)+'</button>').join(''):'';
    };
  }
  async function load(id){
    const token=++request;
    box.innerHTML='<div class="card">Loading LTSPN polls…</div>';
    try{
      const data=await Promise.all([fetch('cfb_teams.json').then(r=>{if(!r.ok)throw Error('Team list unavailable');return r.json();}),db('weeks?select=id,name,number,is_active,questions_released_at&questions_released_at=not.is.null&order=created_at.desc'),db('profiles?select=id,display_name')]);
      if(token!==request)return;
      [catalog,weeks,profiles]=data;
      selected=id||weeks.find(w=>w.is_active)?.id||weeks[0]?.id;
      if(!selected){box.innerHTML='<div class="card">Polls open when the first league week is released.</div>';return;}
      const votes=await db('ltspn_ballots?select=user_id,teams&week_id=eq.'+selected);
      if(token!==request)return;
      ballots=votes;
      draft=[...(ballots.find(b=>b.user_id===session.user.id)?.teams||[])];
      render();
    }catch(e){if(token===request)box.innerHTML='<div class="card">Could not load polls. <button id="pollRetry">Retry</button></div>';document.getElementById('pollRetry')?.addEventListener('click',()=>load(id));}
  }
  box.addEventListener('click',async event=>{
    const button=event.target.closest('button');
    if(!button||button.disabled||busy||!editable())return;
    if(button.dataset.add){draft.push(button.dataset.add);render();return;}
    if(button.dataset.remove!==undefined){draft.splice(Number(button.dataset.remove),1);render();return;}
    const moving=button.dataset.up??button.dataset.down;
    if(moving!==undefined){const i=Number(moving),j=i+(button.dataset.up!==undefined?-1:1);[draft[i],draft[j]]=[draft[j],draft[i]];render();return;}
    if(button.id==='pollSubmit'){
      busy=true;render();
      try{
        await db('ltspn_ballots?on_conflict=week_id,user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({week_id:selected,user_id:session.user.id,teams:draft})});
        busy=false;await load(selected);document.getElementById('pollStatus').textContent='Ballot saved. Your votes are included in the LTSPN rankings.';
      }catch(e){busy=false;render();document.getElementById('pollStatus').textContent='Could not save. Your ballot is still here. Check that this week is still active and try again.';}
    }
  });
  const previous=window.showPage;
  window.showPage=function(id){const result=previous.apply(this,arguments);if(id==='top25')load();return result;};
})();
