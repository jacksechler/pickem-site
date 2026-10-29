// Interactive Road to the Championship and conservative live playoff survival tracker.
// Read-only: consumes official postseason_state, never edits scores, picks or rounds.
(() => {
  const Model=window.PlayoffRaceModel;
  if(!Model)return;
  const $=id=>document.getElementById(id);
  const viewerId=()=>typeof session!=='undefined'?session?.user?.id:null;
  const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=v=>v===null||v===undefined||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('en-US',{maximumFractionDigits:1});
  const date=v=>{
    if(!v)return '';
    const parsed=new Date(v+'T12:00:00Z');
    return Number.isFinite(parsed.valueOf())?parsed.toLocaleDateString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric'}):'';
  };
  const labels={
    champion:'Champion',runner_up:'Runner-up',advanced:'Advanced',eliminated:'Eliminated',
    clinched_math:'Clinched',eliminated_math:'Cannot advance',
    tiebreaker:'Tiebreaker pending',projected_advance:'Projected through',
    projected_out:'At risk',not_locked:'Awaiting lock',pending:'Waiting for results',
    qualified:'Qualified',upcoming:'Not started'
  };
  let selectedRound=null,roundSelectionManual=false,selectedPlayer=null,lastData=null,lastSignature='',probabilityTicket=0;
  function mount(){
    const box=$('playoffBox');
    if(!box)return null;
    const anchor=box.querySelector('.ps-race')||box.querySelector('.ps-format');
    if(!anchor)return null;
    let root=$('psRoadTrackerRoot');
    if(!root||!box.contains(root)){
      root=document.createElement('div');
      root.id='psRoadTrackerRoot';
      root.className='ps-race-experience';
      root.addEventListener('click',event=>{
        const stage=event.target.closest('[data-road-stage]');
        if(stage&&root.contains(stage)){
          selectedRound=Number(stage.dataset.roadStage);
          roundSelectionManual=true;
          paint(lastData);
          root.querySelector('[data-road-stage="'+selectedRound+'"]')?.focus({preventScroll:true});
          return;
        }
        const member=event.target.closest('[data-survival-member]');
        if(member&&root.contains(member)){
          selectedPlayer=member.dataset.survivalMember;
          paint(lastData);
          [...root.querySelectorAll('[data-survival-member]')].find(el=>el.dataset.survivalMember===selectedPlayer)?.focus({preventScroll:true});
        }
      });
      anchor.before(root);
    }
    box.querySelector('.ps-funnel')?.classList.add('ps-road-legacy');
    return root;
  }
  function stageStatus(round){
    if(round.mode==='official')return 'OFFICIAL';
    if(round.mode==='live')return 'LIVE';
    if(round.mode==='prelock')return 'NOT LOCKED';
    if(round.mode==='qualified')return 'FIELD CONFIRMED';
    if(round.mode==='projected')return 'PROJECTED';
    return 'UPCOMING';
  }
  function statusClass(kind){
    if(['champion','advanced','clinched_math','qualified'].includes(kind))return 'success';
    if(['eliminated','eliminated_math','projected_out'].includes(kind))return 'danger';
    if(['tiebreaker','projected_advance'].includes(kind))return 'watch';
    return 'neutral';
  }
  function stageCards(round){
    if(!round.members.length)
      return '<div class="ps-road-empty"><strong>Field to be determined</strong><p>Participants appear here when the preceding round is finalized. No projected names are treated as official qualifiers.</p></div>';
    return '<div class="ps-road-field">'+round.members.map(member=>{
      const kind=member.kind||'pending';
      const label=round.mode==='projected'?'Projected qualifier':labels[kind]||'Active';
      const score=member.total===null?'':number(member.total)+' pts';
      return '<div class="ps-road-member '+statusClass(kind)+'"><div class="ps-road-member-top"><span class="ps-road-member-seed">SEED '+safe(member.seed??'—')+'</span><span class="ps-road-member-state">'+safe(label)+'</span></div><div class="ps-road-member-name">'+safe(member.name)+'</div><div class="ps-road-member-bottom"><span>'+safe(member.rank?'#'+member.rank:'')+'</span><b>'+safe(score)+'</b></div></div>';
    }).join('')+'</div>';
  }
  function roadHtml(road){
    const round=road.rounds[selectedRound-1];
    let html='<section class="ps-road-board" aria-label="Interactive Road to the Championship"><div class="ps-road-title"><div><div class="ps-road-eyebrow">ROAD TO THE CROWN</div><h2>One trophy. Four cuts.</h2><p>Follow every round from eight members to one champion.</p></div><span class="ps-road-chip">8 → 6 → 4 → 2 → 1</span></div>';
    html+='<div class="ps-road-stages" role="group" aria-label="Choose a playoff round">';
    for(const stage of road.rounds){
      const current=stage.number===selectedRound;
      html+='<button type="button" class="ps-road-stage '+(current?'active ':'')+(stage.mode==='official'?'complete':'')+'" data-road-stage="'+stage.number+'" aria-pressed="'+current+'" aria-controls="psRoadDetail"><span class="ps-road-stage-number">ROUND '+stage.number+'</span><strong>'+stage.before+' → '+stage.after+'</strong><small>'+safe(stage.title)+'</small><span class="ps-road-stage-status">'+stageStatus(stage)+'</span></button>';
    }
    const champActive=selectedRound===5;
    html+='<button type="button" class="ps-road-stage ps-road-champion-tab '+(champActive?'active':'')+'" data-road-stage="5" aria-pressed="'+champActive+'" aria-controls="psRoadDetail"><span class="ps-road-stage-number">THE FINAL GOAL</span><strong>🏆 1</strong><small>League Champion</small><span class="ps-road-stage-status">'+(road.champion?'CROWNED':'AWAITING FINAL')+'</span></button>';
    html+='</div><div class="ps-road-detail" id="psRoadDetail">';
    if(selectedRound===5){
      if(road.champion){
        html+='<div class="ps-road-spotlight"><div class="ps-road-eyebrow">OFFICIAL LEAGUE CHAMPION</div><h3>🏆 '+safe(road.champion.name)+'</h3><p>Seed #'+safe(road.champion.seed)+' · '+safe(number(road.champion.total))+' championship points</p></div>';
      }else html+='<div class="ps-road-spotlight upcoming"><div class="ps-road-eyebrow">THE FINISH LINE</div><h3>The championship is still ahead.</h3><p>The champion will appear here after the final round is officially finalized.</p></div>';
    }else{
      html+='<div class="ps-road-detail-head"><div><div class="ps-road-eyebrow">'+stageStatus(round)+(round.mode==='projected'?' · NOT OFFICIAL':'')+'</div><h3>'+safe(round.title)+'</h3><p>'+round.before+' contenders · Top '+round.after+' advance'+(round.startsOn?' · '+safe(date(round.startsOn))+'–'+safe(date(round.endsOn)):'')+'</p></div><span class="ps-road-count">'+round.before+' → '+round.after+'</span></div>';
      if(round.mode==='projected')html+='<p class="ps-road-notice">This is a projected next-round field based on the current locked standings. The commissioner must finalize the round before anyone officially advances.</p>';
      else if(round.mode==='qualified')html+='<p class="ps-road-notice">These members officially qualified in the preceding round. The next card has not started.</p>';
      else if(round.mode==='prelock')html+='<p class="ps-road-notice">Current seeds are visible, but picks and projected advancement stay private until the round locks.</p>';
      html+=stageCards(round);
    }
    return html+'</div></section>';
  }
  function selectedSituation(s,selected){
    if(!selected)return '';
    const body=selected.reason;
    const tag=labels[selected.kind]||'Active';
    return '<section class="ps-survival-focus '+statusClass(selected.kind)+'" aria-label="Selected member survival outlook"><div class="ps-survival-focus-head"><div><div class="ps-road-eyebrow">SURVIVAL OUTLOOK</div><h3>'+safe(selected.name)+'</h3></div><span class="ps-survival-label '+statusClass(selected.kind)+'">'+safe(tag)+'</span></div><div class="ps-survival-focus-stats"><div><small>Cumulative total</small><strong>'+safe(number(selected.total))+'</strong></div><div><small>Current cut</small><strong>TOP '+s.cut+'</strong></div><div><small>Questions left</small><strong>'+safe(s.remaining===null?'—':s.remaining)+'</strong></div></div><p>'+safe(body)+'</p>'+(selected.mathematicallyCertain&&!selected.official?'<p class="ps-survival-math">Mathematically certain from current scores and remaining questions; still unofficial until the commissioner finalizes the round.</p>':'')+'</section>';
  }
  function survivalHtml(s){
    if(s.kind==='unavailable')return '';
    const selected=s.rows.find(r=>r.id===selectedPlayer)||s.rows.find(r=>r.id===viewerId())||s.rows[0];
    let html='<section class="ps-survival-board" aria-label="Live playoff survival tracker"><div class="ps-survival-head"><div><div class="ps-road-eyebrow">LIVE SURVIVAL TRACKER</div><h2>'+safe(s.roundLabel)+'</h2><p>'+s.cut+' advance · '+(s.remaining===null?'Questions pending':s.remaining+' scored question'+(s.remaining===1?'':'s')+' remaining')+'</p></div><span class="ps-survival-phase '+(s.kind==='official'?'final':'')+'">'+(s.kind==='official'?'OFFICIAL RESULTS':s.kind==='prelock'?'AWAITING LOCK':'LIVE PROJECTIONS')+'</span></div>';
    html+='<div class="ps-survival-stats"><div><strong>'+s.cut+'</strong><small>Advancement spots</small></div><div><strong>'+s.counts.clinched+'</strong><small>'+(s.kind==='official'?'Officially advanced':'Clinched / advanced')+'</small></div><div><strong>'+s.counts.mathematicallyOut+'</strong><small>'+(s.kind==='official'?'Eliminated':'Cannot advance')+'</small></div><div><strong>'+(s.remaining===null?'—':s.remaining)+'</strong><small>Questions left</small></div></div>';
    if(s.kind==='prelock')html+='<p class="ps-road-notice">The race will update when this round locks. Nobody’s picks are exposed early.</p>';
    else if(s.tiebreakerPending&&s.kind!=='official')html+='<p class="ps-road-notice">The actual round tiebreaker is not entered. Tied players near the cut are not officially ranked yet.</p>';
    html+='<div class="ps-survival-list" aria-label="Select a contender">'+s.rows.map((r,i)=>{
      const active=r.id===selected?.id,me=r.id===viewerId();
      const rank=r.rank?'#'+r.rank:'—';
      return (i===s.cut?'<div class="ps-survival-cut">ADVANCEMENT CUT · TOP '+s.cut+'</div>':'')+
        '<button type="button" class="ps-survival-row '+statusClass(r.kind)+(active?' selected':'')+'" data-survival-member="'+safe(r.id)+'" aria-pressed="'+active+'"><span class="ps-survival-rank">'+safe(rank)+'</span><span class="ps-survival-name"><b>'+safe(r.name)+(me?' · YOU':'')+'</b><small>Seed #'+safe(r.seed??'—')+'</small></span><span class="ps-survival-points">'+safe(number(r.total))+' <small>PTS</small></span><span class="ps-survival-label '+statusClass(r.kind)+'">'+safe(labels[r.kind]||'Active')+'</span></button>';
    }).join('')+'</div>'+selectedSituation(s,selected);
    html+='<p class="ps-survival-footnote">Mathematically clinched / cannot advance uses the maximum points each opponent could still earn. All other statuses are projections; tiebreakers and future answers can change the cut. Official eliminations happen only when the commissioner finalizes a round.</p></section>';
    return html;
  }
  function paint(data){
    if(!data)return;
    const root=mount();if(!root)return;
    const road=Model.road(data);
    const s=Model.survival(data);
    const fallback=Math.max(1,Math.min(5,road.currentRound||1));
    if(!roundSelectionManual||selectedRound===null||selectedRound<1||selectedRound>5)selectedRound=data.settings?.status==='complete'?5:fallback;
    if(!s?.rows?.some(r=>r.id===selectedPlayer))selectedPlayer=viewerId()||s?.rows?.[0]?.id||null;
    const sig=JSON.stringify([data.settings?.status,road,s,selectedRound,selectedPlayer]);
    if(sig===lastSignature&&root.dataset.ready==='yes')return;
    const oldNav=root.querySelector('.ps-road-stages')?.scrollLeft||0;
    root.innerHTML=roadHtml(road)+survivalHtml(s);
    root.querySelector('.ps-road-stages').scrollLeft=oldNav;
    root.dataset.ready='yes';
    lastSignature=sig;
    // The selected round is client-only presentation state; official RPCs are never invoked by navigation.
  }
  function render(data){
    if(!data?.settings)return;
    const oldId=lastData?.settings?.season_id;
    if(oldId&&oldId!==data.settings.season_id){
      selectedRound=null;roundSelectionManual=false;selectedPlayer=null;lastSignature='';
    }
    lastData=data;
    paint(data);
  }
  window.PlayoffRace={render,showRound(number){
    const n=Number(number);
    if(Number.isInteger(n)&&n>=1&&n<=5){selectedRound=n;roundSelectionManual=true;paint(lastData);}
  }};
})();