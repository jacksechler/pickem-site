(function(root,factory){
  const model=factory();
  if(typeof module==='object'&&module.exports)module.exports=model;
  else root.WeeklyPercentageModel=model;
})(typeof window!=='undefined'?window:globalThis,function(){
  const WEEK='f4e0e72a-926f-4424-ab3e-30506b742392';
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  function calculate(bundle,nextId){
    if(bundle.week.id!==WEEK)return null;
    const users=[...new Set(bundle.submissions.map(s=>s.user_id))];
    const scored=bundle.questions.filter(q=>q.counts_for_score!==false);
    const decided=scored.filter(q=>q.result!==null&&q.result!==undefined);
    const remaining=scored.filter(q=>q.result===null||q.result===undefined);
    const picks=new Map(bundle.picks.map(p=>[p.user_id+'|'+p.question_id,p.answer]));
    const players=users.map(id=>({id,correct:decided.filter(q=>same(picks.get(id+'|'+q.id),q.result)).length,total:decided.length}));
    const correct=players.reduce((sum,p)=>sum+p.correct,0);
    const total=users.length*decided.length;
    const next=remaining.find(q=>q.id===nextId)||remaining[0];
    const options=next&&Array.isArray(next.answer_options)?next.answer_options:[];
    const scenarios=options.map(answer=>{
      const added=users.filter(id=>same(picks.get(id+'|'+next.id),answer)).length;
      return {answer,added,correct:correct+added,total:total+users.length};
    });
    return {players,correct,total,remaining,next,scenarios};
  }
  return {WEEK,calculate};
});
