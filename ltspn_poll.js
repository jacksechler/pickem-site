(() => {
  const box=document.getElementById('pollBox');
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let catalog=[],weeks=[],ballots=[],profiles=[],selected='',draft=[],busy=false,request=0,viewedUser=null;
  const current=()=>weeks.find(w=>w.id===selected);
  const ownBallot=()=>ballots.find(b=>b.user_id===session.user.id);
  const editable=()=>current()?.is_active===true||!!ownBallot();
  const commissioner=()=>typeof profile!=='undefined'&&profile?.role==='commissioner';
  const voterName=id=>profiles.find(p=>p.id===id)?.display_name||'Member';
  function teamLabel(id){
    const team=catalog.find(t=>t.id===id);
    const logo=team?.logo?'<img class="poll-team-logo" src="'+escape(team.logo)+'" alt="" loading="lazy" onerror="this.hidden=true">':'';
    return logo+'<span>'+escape(team?.name||id)+'</span>';
  }
  function voterPanel(){
    const ballot=ballots.find(b=>b.user_id===viewedUser);
    return '<h3>Voters · View individual polls</h3><div class="poll-voters">'+ballots.map(b=>'<div><button class="btn secondary" type="button" data-view="'+escape(b.user_id)+'" aria-pressed="'+(b.user_id===viewedUser)+'">'+escape(voterName(b.user_id))+'</button>'+(commissioner()?'<button class="btn secondary" type="button" data-delete="'+escape(b.user_id)+'">Delete ballot</button>':'')+'</div>').join('')+'</div>'+
      (ballots.length?'':'<p>No ballots yet.</p>')+
      (ballot?'<section class="poll-viewed"><h3>'+escape(voterName(ballot.user_id))+'’s Top 25</h3><div class="poll-graphic-actions"><button class="btn secondary" data-graphic="'+escape(ballot.user_id)+'">Copy ballot graphic</button><button class="btn secondary" data-download="'+escape(ballot.user_id)+'">Download PNG</button></div><ol>'+ballot.teams.map(id=>'<li>'+teamLabel(id)+'</li>').join('')+'</ol></section>':'');
  }
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
    box.innerHTML='<div class="card"><label>Poll week<select id="pollWeek">'+weeks.map(w=>'<option value="'+w.id+'" '+(w.id===selected?'selected':'')+'>'+escape(w.name)+(w.is_active?' · Voting open':' · Archived')+'</option>').join('')+'</select></label><p>'+ballots.length+' ballots submitted · 25 points for No. 1 down to 1 for No. 25. Ties share a rank.</p><p class="muted">New ballots are accepted during the active week. You can edit your submitted ballots anytime. Just for fun — no effect on league standings.</p></div>'+
      '<div class="poll-columns"><section class="card"><h2>LTSPN Top 25</h2><div class="poll-graphic-actions"><button class="btn secondary" data-graphic="combined">Copy Top 25 Graphic</button><button class="btn secondary" data-download="combined">Download PNG</button></div><p id="pollGraphicStatus" role="status"></p>'+(!rows.length?'<p>The first submitted ballot starts this week’s rankings.</p>':'<div class="poll-table"><table class="table"><thead><tr><th>Rank</th><th>Team</th><th>Points</th><th>1st</th></tr></thead><tbody>'+ranked.filter(r=>r.rank<=25).map(r=>'<tr><td>'+r.rank+'</td><td>'+teamLabel(r.id)+'</td><td>'+r.points+'</td><td>'+r.first+'</td></tr>').join('')+'</tbody></table></div>')+
      (ranked.some(r=>r.rank>25)?'<h3>Also receiving votes</h3><p>'+ranked.filter(r=>r.rank>25).map(r=>escape(name(r.id))+' '+r.points).join(' · ')+'</p>':'')+
      voterPanel()+'</section>'+
      '<section class="card"><h2>My Top 25</h2>'+ (ownBallot()?'<p class="muted">Edit your submitted ballot below, then save your changes.</p>':'')+'<p>'+draft.length+'/25 teams ranked'+(editable()?' · Use arrows to reorder.':' · Voting closed.')+'</p>'+
      (editable()?'<label>Find a college team<input id="pollSearch" placeholder="Search school or mascot" autocomplete="off"></label><div id="pollMatches"></div>':'')+
      '<ol class="poll-ballot">'+draft.map((id,i)=>'<li><span>'+teamLabel(id)+'</span>'+(editable()?'<div><button data-up="'+i+'" aria-label="Move '+escape(name(id))+' up" '+(i===0?'disabled':'')+'>↑</button><button data-down="'+i+'" aria-label="Move '+escape(name(id))+' down" '+(i===24||i===draft.length-1?'disabled':'')+'>↓</button><button data-remove="'+i+'" aria-label="Remove '+escape(name(id))+'">×</button></div>':'')+'</li>').join('')+'</ol>'+
      (editable()?'<button class="btn" id="pollSubmit" '+(draft.length!==25||busy?'disabled':'')+'>'+(busy?'Saving…':ballots.some(b=>b.user_id===session.user.id)?'Save changes':'Submit ballot')+'</button>':'')+'<p id="pollStatus" role="status"></p></section></div>';
    document.getElementById('pollWeek').disabled=busy;
    document.getElementById('pollWeek').onchange=e=>{viewedUser=null;load(e.target.value);};
    const search=document.getElementById('pollSearch');
    if(search)search.oninput=()=>{
      const query=search.value.trim().toLowerCase();
      document.getElementById('pollMatches').innerHTML=query?catalog.filter(t=>!draft.includes(t.id)&&t.name.toLowerCase().includes(query)).slice(0,12).map(t=>'<button data-add="'+t.id+'" '+(draft.length>=25?'disabled':'')+'>'+teamLabel(t.id)+'</button>').join(''):'';
    };
  }
  async function load(id){
    const token=++request;
    box.innerHTML='<div class="card">Loading LTSPN polls…</div>';
    try{
      const data=await Promise.all([fetch('cfb_teams.json?v=2').then(r=>{if(!r.ok)throw Error('Team list unavailable');return r.json();}),db('weeks?select=id,name,number,is_active,questions_released_at&questions_released_at=not.is.null&order=created_at.desc'),db('profiles?select=id,display_name')]);
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
  async function exportGraphic(userId,download){
    const status=document.getElementById('pollGraphicStatus');
    status.textContent='Creating graphic…';
    const ballot=ballots.find(b=>b.user_id===userId);
    let previous=null,rank=0;
    const rows=ballot?ballot.teams.map((id,i)=>({id,rank:i+1,points:25-i,first:null})):results().slice(0,25).map((row,i)=>{
      if(row.points!==previous)rank=i+1;
      previous=row.points;
      return {...row,rank};
    });
    const payload={rows:rows.map(row=>({...row,name:name(row.id),logo:catalog.find(t=>t.id===row.id)?.logo})),
      title:ballot?voterName(userId)+'’s Top 25':'LTSPN TOP 25',
      subtitle:current().name+' · '+(ballot?'Individual ballot':ballots.length+' ballots · Combined ranking'),
      footer:ballot?'Ranked 1–25 · Points awarded to the combined poll':'25 points for No. 1 → 1 point for No. 25 · Equal totals share a rank'};
    const blobPromise=window.LTSPNPollGraphic.render(payload);
    async function save(){
      const blob=await blobPromise;
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download='LTSPN-Top-25-'+selected+'.png';link.click();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
      status.textContent='Graphic downloaded. You can send the PNG.';
    }
    try{
      if(download||!navigator.clipboard?.write||typeof ClipboardItem==='undefined'){await save();return;}
      await navigator.clipboard.write([new ClipboardItem({'image/png':blobPromise})]);
      status.textContent='Graphic copied. Paste it into your message.';
    }catch(e){
      try{await save();}catch(error){status.textContent='Could not create the graphic. Please try again.';}
    }
  }
  box.addEventListener('click',async event=>{
    const button=event.target.closest('button');
    if(!button||button.disabled||busy)return;
    if(button.dataset.graphic||button.dataset.download){await exportGraphic(button.dataset.graphic||button.dataset.download,!!button.dataset.download);return;}
    if(button.dataset.view){viewedUser=button.dataset.view;render();return;}
    if(button.dataset.delete){
      if(!commissioner())return;
      const userId=button.dataset.delete;
      if(!confirm('Delete '+voterName(userId)+'’s ballot for '+current().name+'? Their votes will be removed from the combined rankings.'))return;
      busy=true;render();
      try{
        const removed=await db('ltspn_ballots?week_id=eq.'+selected+'&user_id=eq.'+userId,{method:'DELETE',headers:{Prefer:'return=representation'}});
        if(!Array.isArray(removed)||removed.length!==1)throw Error('Ballot was not deleted');
        busy=false;viewedUser=null;await load(selected);
        document.getElementById('pollStatus').textContent='Ballot deleted. The combined rankings have been updated.';
      }catch(e){busy=false;render();document.getElementById('pollStatus').textContent='Could not delete this ballot. Please reload and try again.';}
      return;
    }
    if(!editable())return;
    if(button.dataset.add){draft.push(button.dataset.add);render();return;}
    if(button.dataset.remove!==undefined){draft.splice(Number(button.dataset.remove),1);render();return;}
    const moving=button.dataset.up??button.dataset.down;
    if(moving!==undefined){const i=Number(moving),j=i+(button.dataset.up!==undefined?-1:1);[draft[i],draft[j]]=[draft[j],draft[i]];render();return;}
    if(button.id==='pollSubmit'){
      busy=true;render();
      try{
        if(ownBallot()){
          const updated=await db('ltspn_ballots?week_id=eq.'+selected+'&user_id=eq.'+session.user.id,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({teams:draft})});
          if(!Array.isArray(updated)||updated.length!==1)throw Error('Ballot is no longer available');
        }else{
          await db('ltspn_ballots?on_conflict=week_id,user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({week_id:selected,user_id:session.user.id,teams:draft})});
        }
        busy=false;await load(selected);document.getElementById('pollStatus').textContent='Ballot saved. Your votes are included in the LTSPN rankings.';
      }catch(e){busy=false;render();document.getElementById('pollStatus').textContent='Could not save. Your ballot is still here. Please reload and try again.';}
    }
  });
  const previous=window.showPage;
  window.showPage=function(id){const result=previous.apply(this,arguments);if(id==='top25')load();return result;};
})();
