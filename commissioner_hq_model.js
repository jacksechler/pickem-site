// Pure commissioner operations summary: no picks or private answer values.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.CommissionerHQModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const numeric=v=>Number.isFinite(Number(v))?Number(v):0;
  const val=v=>v===null||v===undefined?'':String(v);
  function analyze(diag,activity=[],{auditAvailable=true}={}){
    if(!diag||!diag.week||!diag.entries||!diag.questions){
      return {kind:'unavailable',readiness:'unknown',reasons:['Commissioner diagnostics could not be loaded.'],
        metrics:[],checks:[],activity:[],canExport:true};
    }
    const week=diag.week;
    const entries=diag.entries,questions=diag.questions;
    const scored=numeric(questions.scored),decided=numeric(questions.decided);
    const players=Array.isArray(entries.players)?entries.players:[];
    const submitted=numeric(entries.submitted),required=numeric(entries.required)||8;
    const misses=players.filter(p=>!p.complete);
    const fullSubmissions=submitted>=required&&misses.length===0&&players.length===required;
    const orderValid=decided===numeric(questions.result_ordered)
      &&numeric(questions.result_ordered)===numeric(questions.result_order_distinct)
      &&(decided===0||(numeric(questions.result_order_min)===1&&numeric(questions.result_order_max)===decided));
    const resultsDone=scored>0&&decided===scored;
    const tieSaved=week.tiebreaker_result_saved===true;
    const locked=week.locked===true, published=week.status==='published';
    const scoreRows=numeric(diag.scores?.rows);
    const expectedRows=numeric(diag.scores?.expected_when_published)||required;
    const allScoresSaved=scoreRows===expectedRows;
    const failed=misses.map(p=>({
      id:p.user_id||p.id||null,name:p.display_name||'Member',
      picks:numeric(p.picks),expected:numeric(p.expected_picks),
      submitted:!!p.submitted,complete:!!p.complete
    }));
    const checks=[
      {id:'submissions',label:'Member submissions',passed:fullSubmissions,
        detail:submitted+'/'+required+' submitted'+(failed.length?' · '+failed.length+' incomplete':'')},
      {id:'results',label:'Question results',passed:resultsDone,
        detail:decided+'/'+scored+' scored questions decided'},
      {id:'order',label:'Result scoring order',passed:orderValid,
        detail:orderValid?'Sequential and unique':'Check missing or duplicate result order positions'},
      {id:'tiebreaker',label:'Tiebreaker result',passed:tieSaved,
        detail:tieSaved?'Official result saved':'Awaiting an official tiebreaker result'}
    ];
    let readiness='not_locked';
    const reasons=[];
    if(published){
      readiness=allScoresSaved?'published':'attention';
      if(!allScoresSaved)reasons.push('A published week should have '+expectedRows+' official score rows; '+scoreRows+' found.');
    }else if(!locked){
      readiness='open';
      reasons.push('The card is still open. Final scoring must wait for the official lock.');
    }else if(checks.every(c=>c.passed)){
      readiness='ready';
    }else{
      readiness='attention';
      checks.filter(c=>!c.passed).forEach(c=>reasons.push(c.label+': '+c.detail+'.'));
    }
    const actions=Array.isArray(activity)?activity:[];
    const normalized=actions.filter(a=>a&&a.created_at&&a.action_type)
      .map(a=>({createdAt:a.created_at,actionType:val(a.action_type),
        summary:val(a.summary)||val(a.action_type).replace(/_/g,' '),
        actorId:a.actor_id||null,weekId:a.week_id||null}))
      .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,20);
    return {kind:'ready',weekName:week.name||'Current week',status:week.status,
      readiness,reasons,checks,failed,locked,published,
      metrics:[
        {label:'Submitted',value:submitted+'/'+required},
        {label:'Scored results',value:decided+'/'+scored},
        {label:'Official score rows',value:String(scoreRows)},
        {label:'Recorded actions',value:auditAvailable?String(normalized.length):'Unavailable'}
      ],activity:normalized,auditAvailable,canExport:true};
  }
  function summarizeArchive({seasonId=null,weeks=[],scores=[],questions=[],profiles=[]}={}){
    const published=weeks.filter(w=>w?.id&&w.status==='published'&&
      (!seasonId||w.season_id===seasonId));
    const allowed=new Set(published.map(w=>w.id));
    const archive={
      format:'pickem-published-results-v1',
      created_at:new Date().toISOString(),season_id:seasonId,
      note:'Read-only published-results snapshot. Not a full database backup or restorable migration. Does not include private picks, login credentials or push subscriptions.',
      members:profiles.map(p=>({id:p.id,display_name:p.display_name||'Member'})),
      published_weeks:published.map(w=>({
        id:w.id,season_id:w.season_id,number:w.number,name:w.name,
        phase:w.phase,status:w.status,published_at:w.published_at,
        lock_at:w.lock_at,tiebreaker_result:w.tiebreaker_result
      })),
      published_questions:questions.filter(q=>allowed.has(q.week_id)).map(q=>({
        id:q.id,week_id:q.week_id,position:q.position,
        prompt:q.prompt,sport:q.sport,counts_for_score:q.counts_for_score,
        result:q.result,result_order:q.result_order
      })),
      published_scores:scores.filter(s=>allowed.has(s.week_id)).map(s=>({
        week_id:s.week_id,user_id:s.user_id,placement:s.placement,
        correct_count:s.correct_count,question_count:s.question_count,
        total_points:s.total_points,placement_points:s.placement_points,
        perfect_bonus:s.perfect_bonus,unicorn_bonus:s.unicorn_bonus,
        upset_bonus:s.upset_bonus,streak_bonus:s.streak_bonus,cold_bonus:s.cold_bonus
      }))
    };
    return archive;
  }
  function validateArchive(archive){
    if(archive.format!=='pickem-published-results-v1')return false;
    const ids=new Set(archive.published_weeks.map(w=>w.id));
    return archive.published_weeks.every(w=>w.status==='published')&&
      archive.published_questions.every(q=>ids.has(q.week_id))&&
      archive.published_scores.every(s=>ids.has(s.week_id))&&
      !('picks' in archive)&&!('push_subscriptions' in archive)&&
      !('auth' in archive);
  }
  return {analyze,summarizeArchive,validateArchive};
});