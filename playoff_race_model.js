// Read-only playoff survival and road-to-title model.
// Status labels are conservative: never treat a projection as an official result.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PlayoffRaceModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const STAGES=[
    {number:1,before:8,after:6,title:'Playoff Week 1'},
    {number:2,before:6,after:4,title:'Quarterfinals'},
    {number:3,before:4,after:2,title:'Semifinals'},
    {number:4,before:2,after:1,title:'Championship'}
  ];
  const numeric=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
  const val=(x,fallback=null)=>numeric(x)?Number(x):fallback;
  function countRemaining(c){
    const total=val(c?.question_count),done=val(c?.decided_count);
    return total!==null&&done!==null&&total>=0&&done>=0&&done<=total?total-done:null;
  }
  function statusFor(row,current,all){
    const round=current.round,cut=Number(round.participants_after),final=round.status==='finalized';
    if(final){
      if(row.advanced&&row.status_after==='champion')return 'champion';
      if(row.status_after==='runner_up')return 'runner_up';
      return row.advanced?'advanced':'eliminated';
    }
    if(!current.locked)return 'not_locked';
    if(val(current.question_count,0)===0)return 'pending';
    const remaining=countRemaining(current);
    const value=val(row.cumulative_after);
    if(remaining===null||value===null)return 'pending';
    const opponents=all.filter(r=>r.user_id!==row.user_id).map(r=>val(r.cumulative_after));
    if(opponents.some(v=>v===null))return 'pending';
    // Strict > proves an opponent is already ahead regardless of any remaining outcomes.
    // Strict >= when counting potential challengers makes "clinched" conservative for unknown tiebreakers.
    const aheadNoMatterWhat=opponents.filter(v=>v>value+remaining).length;
    if(aheadNoMatterWhat>=cut)return 'eliminated_math';
    const canCatch=opponents.filter(v=>v+remaining>=value).length;
    if(canCatch<cut)return 'clinched_math';
    if(row.cut_tie||row.projected_status==='tiebreaker_pending')return 'tiebreaker';
    const rank=val(row.sort_index,Infinity);
    return rank<=cut?'projected_advance':'projected_out';
  }
  function situation(row,current,all,kind){
    const cut=Number(current.round.participants_after);
    const remaining=countRemaining(current);
    const score=val(row.cumulative_after);
    if(current.round.status==='finalized')
      return kind==='champion'?'Official league champion':kind==='runner_up'?'Official league runner-up':kind==='advanced'?'Officially advanced to the next round':'Officially eliminated from championship contention';
    if(!current.locked)return 'Picks remain private until this round locks.';
    if(score===null||remaining===null)return 'Waiting for complete scoring information.';
    if(remaining===0&&current.tiebreaker_pending)return 'All picks decided; actual tiebreaker still pending.';
    if(kind==='clinched_math')return 'Guaranteed to finish above the cut, regardless of remaining answers.';
    if(kind==='eliminated_math')return 'Cannot reach the advancement cut, even with every remaining answer correct.';
    const ranked=all.slice().sort((a,b)=>val(b.cumulative_after,-Infinity)-val(a.cumulative_after,-Infinity));
    const inField=ranked.slice(0,cut);
    const outField=ranked.slice(cut);
    const boundary=val(inField[inField.length-1]?.cumulative_after);
    const firstBelow=val(outField[0]?.cumulative_after);
    if(kind==='tiebreaker')return 'Tied across the cut. The actual round tiebreaker decides who advances.';
    const rank=val(row.sort_index,Infinity);
    if(rank>cut&&boundary!==null){
      const gap=Math.max(0,boundary-score);
      const chanceToCatch=gap>remaining?'The gap exceeds remaining possible points.':'Net point swings still depend on other members’ results.';
      return gap+' net point'+(gap===1?'':'s')+' needed to tie the current cut; '+(gap+1)+' to pass on points. '+chanceToCatch;
    }
    if(firstBelow!==null){
      const margin=score-firstBelow;
      return margin+' point'+(margin===1?'':'s')+' above the first projected elimination spot. '+remaining+' scored question'+(remaining===1?'':'s')+' remain.';
    }
    return remaining+' scored question'+(remaining===1?'':'s')+' remain in this round.';
  }
  function survival(data){
    const current=data?.current;
    if(!current?.round||!Array.isArray(current.rows)||!current.rows.length)
      return {kind:'unavailable',reason:'The playoff field is not active yet.'};
    const cut=val(current.round.participants_after);
    if(!Number.isInteger(cut)||cut<1||cut>current.rows.length)
      return {kind:'unavailable',reason:'Advancement cut data is incomplete.'};
    const remaining=countRemaining(current);
    const final=current.round.status==='finalized';
    const rows=current.rows.map(row=>{
      const kind=statusFor(row,current,current.rows);
      return {
        id:row.user_id,name:row.display_name||'Member',seed:val(row.seed),
        total:val(row.cumulative_after),roundCorrect:val(row.round_correct,0),
        rank:val(row.round_rank),sortIndex:val(row.sort_index),
        kind,official:final,reason:situation(row,current,current.rows,kind),
        advancing:['advanced','champion','clinched_math','projected_advance'].includes(kind),
        mathematicallyCertain:final||['clinched_math','eliminated_math'].includes(kind)
      };
    });
    const counts={
      clinched:rows.filter(r=>['advanced','champion','clinched_math'].includes(r.kind)).length,
      mathematicallyOut:rows.filter(r=>['eliminated','runner_up','eliminated_math'].includes(r.kind)).length,
      projectedOut:rows.filter(r=>r.kind==='projected_out').length,
      unresolved:rows.filter(r=>['tiebreaker','pending','not_locked'].includes(r.kind)).length
    };
    return {kind:final?'official':current.locked?'live':'prelock',cut,remaining,rows,
      counts,roundNumber:Number(current.round.round_number),
      roundLabel:current.round.label||'Playoff round',tiebreakerPending:!!current.tiebreaker_pending,
      locked:!!current.locked,revision:current.revision};
  }
  function roundField(data,number){
    const stage=STAGES[number-1];
    if(!stage)return null;
    const found=(data?.rounds||[]).find(r=>Number(r.round_number)===number);
    const current=data?.current;
    const calendar=(data?.calendar||[]).find(c=>c.phase==='playoff'&&Number(c.round_number)===number);
    const base={...stage,number,title:found?.label||calendar?.label||stage.title,
      startsOn:calendar?.starts_on||null,endsOn:calendar?.ends_on||null,
      mode:'future',members:[]};
    if(found?.status==='finalized'){
      const history=(data?.history||[]).filter(h=>h.round_id===found.id)
        .sort((a,b)=>Number(a.round_rank)-Number(b.round_rank));
      return {...base,mode:'official',members:history.map(h=>({
        id:h.user_id,name:h.display_name||'Member',seed:val(h.seed),rank:val(h.round_rank),
        total:val(h.cumulative_after),correct:val(h.round_correct,0),
        kind:h.status_after==='champion'?'champion':h.status_after==='runner_up'?'runner_up':h.advanced?'advanced':'eliminated',
        official:true
      }))};
    }
    if(found&&current?.round?.id===found.id&&Array.isArray(current.rows)){
      return {...base,mode:current.locked?'live':'prelock',
        members:current.rows.map(r=>({
          id:r.user_id,name:r.display_name||'Member',seed:val(r.seed),
          rank:val(r.round_rank),total:val(r.cumulative_after),
          correct:val(r.round_correct,0),kind:current.locked?statusFor(r,current,current.rows):'not_locked',
          official:false
        }))};
    }
    // Between rounds: only show qualifiers from official results.
    const prev=(data?.rounds||[]).find(r=>Number(r.round_number)===number-1);
    if(prev?.status==='finalized'&&!found){
      const qualified=(data?.history||[]).filter(h=>h.round_id===prev.id&&h.advanced)
        .sort((a,b)=>Number(a.seed)-Number(b.seed));
      if(qualified.length===stage.before)return {...base,mode:'qualified',
        members:qualified.map(h=>({id:h.user_id,name:h.display_name||'Member',
          seed:val(h.seed),total:val(h.cumulative_after),kind:'qualified',official:true}))};
    }
    // Never present predicted survivor names as an official future field.
    if(prev?.status==='live'&&current?.round?.id===prev.id&&current.locked&&number===Number(prev.round_number)+1
       &&Array.isArray(current.rows)){
      const list=current.rows.filter(r=>r.projected_status==='projected_advance'&&!r.cut_tie)
        .sort((a,b)=>Number(a.sort_index)-Number(b.sort_index));
      // With a tie across the cut or an incomplete field, don't invent future qualifiers.
      const tied=current.rows.some(r=>r.cut_tie);
      if(!tied&&list.length===stage.before)
        return {...base,mode:'projected',members:list.map(r=>({
          id:r.user_id,name:r.display_name||'Member',seed:val(r.seed),
          total:val(r.cumulative_after),kind:'projected_advance',official:false
        }))};
    }
    return base;
  }
  function road(data){
    const rounds=STAGES.map((stage,i)=>roundField(data,i+1));
    const winner=(data?.entries||[]).find(e=>e.status==='champion');
    const champion=winner?{id:winner.user_id,name:winner.display_name||'Champion',
      seed:val(winner.seed),total:val(winner.current_total),official:true}:null;
    return {rounds,champion,phase:data?.settings?.status||'scheduled',
      currentRound:val(data?.current?.round?.round_number,1)};
  }
  return {survival,road,roundField,countRemaining,statusFor,STAGES};
});