// Shared regular-season scoring rules used by live scoring and archived corrections.
(() => {
  const placementPoints = [8,7,6,5,4,3,2,0];
  const sameAnswer = (a,b) => JSON.stringify(a) === JSON.stringify(b);

  function sortScoredQuestions(questions){
    return (questions||[]).filter(q=>q.counts_for_score!==false).slice().sort((a,b)=>{
      const ao=a.result_order==null?999999:Number(a.result_order);
      const bo=b.result_order==null?999999:Number(b.result_order);
      return ao-bo || Number(a.position||0)-Number(b.position||0);
    });
  }

  function calculate({
    people,
    questions,
    picks,
    submissions,
    tiebreakerResult,
    previousScores=[],
    results=null
  }){
    if(!Array.isArray(people) || people.length!==8) throw new Error('Scoring requires exactly 8 players.');
    const scored=sortScoredQuestions(questions);
    if(!scored.length) throw new Error('There are no scored questions.');

    const resultFor=q=>{
      if(results && Object.prototype.hasOwnProperty.call(results,q.id)) return results[q.id];
      return q.result;
    };
    if(scored.some(q=>resultFor(q)===null || resultFor(q)===undefined)) throw new Error('Save every question result first.');
    if(tiebreakerResult===null || tiebreakerResult===undefined || !Number.isFinite(Number(tiebreakerResult))) throw new Error('Save the actual tiebreaker result first.');

    if(!Array.isArray(submissions) || submissions.length!==8) throw new Error('All 8 players must have a submitted entry before publishing.');
    const subMap={};
    submissions.forEach(s=>subMap[s.user_id]=s);
    for(const p of people){
      if(!subMap[p.id]) throw new Error((p.name||'A player')+' does not have a submitted entry.');
    }

    const pickMap={};
    (picks||[]).forEach(p=>{
      (pickMap[p.user_id]??={})[p.question_id]=p.answer;
    });
    const prevScoreMap={};
    (previousScores||[]).forEach(s=>prevScoreMap[s.user_id]=s);

    const correctness={};
    const correctUsersByQuestion={};
    for(const p of people){
      correctness[p.id]=[];
      for(const q of scored){
        const ok=sameAnswer(pickMap[p.id]?.[q.id],resultFor(q));
        correctness[p.id].push(ok);
        if(ok) (correctUsersByQuestion[q.id]??=[]).push(p.id);
      }
    }

    const rows=people.map(p=>{
      const arr=correctness[p.id];
      const correct=arr.filter(Boolean).length;
      const questionCount=scored.length;
      let baseOpening=0;
      for(const ok of arr){ if(!ok) break; baseOpening++; }
      const prev=prevScoreMap[p.id];
      const prevPerfect=!!(prev && Number(prev.question_count)>0 && Number(prev.correct_count)===Number(prev.question_count));
      const openingStreak=prevPerfect?baseOpening:0;

      let unicornCount=0,upsetCount=0;
      for(const q of scored){
        if(!sameAnswer(pickMap[p.id]?.[q.id],resultFor(q))) continue;
        const winners=(correctUsersByQuestion[q.id]||[]).length;
        if(winners===1) unicornCount++;
        else if(winners===2) upsetCount++;
      }

      const tbAnswer=Number(subMap[p.id].tiebreaker_answer);
      const tbDistance=Math.abs(tbAnswer-Number(tiebreakerResult));
      return {
        user_id:p.id,
        name:p.name,
        correct_count:correct,
        question_count:questionCount,
        pick_percentage:questionCount?correct/questionCount*100:0,
        tiebreaker_answer:tbAnswer,
        tb_distance:tbDistance,
        perfect_bonus:correct===questionCount?5:0,
        unicorn_count:unicornCount,
        unicorn_bonus:unicornCount*3,
        upset_count:upsetCount,
        upset_bonus:upsetCount*0.5,
        opening_streak:openingStreak,
        streak_bonus:openingStreak*0.5,
        cold_bonus:correct===0?-5:0
      };
    });

    rows.sort((a,b)=>{
      if(b.correct_count!==a.correct_count) return b.correct_count-a.correct_count;
      if(a.tb_distance!==b.tb_distance) return a.tb_distance-b.tb_distance;
      return String(a.name||'').localeCompare(String(b.name||''));
    });

    let i=0;
    while(i<rows.length){
      let j=i+1;
      while(j<rows.length && rows[j].correct_count===rows[i].correct_count && rows[j].tb_distance===rows[i].tb_distance) j++;
      const tieSize=j-i;
      const splitPoints=placementPoints.slice(i,j).reduce((sum,v)=>sum+Number(v??0),0)/tieSize;
      for(let k=i;k<j;k++){
        const r=rows[k];
        r.placement=i+1;
        r.placement_points=splitPoints;
        r.golf_tie=tieSize>1;
        r.total_points=r.placement_points+r.perfect_bonus+r.unicorn_bonus+r.upset_bonus+r.streak_bonus+r.cold_bonus;
      }
      i=j;
    }
    return {rows,unresolved:[]};
  }

  function scorePayload(weekId,rows){
    return rows.map(r=>({
      week_id:weekId,
      user_id:r.user_id,
      placement:r.placement,
      correct_count:r.correct_count,
      question_count:r.question_count,
      pick_percentage:r.pick_percentage,
      placement_points:r.placement_points,
      perfect_bonus:r.perfect_bonus,
      unicorn_bonus:r.unicorn_bonus,
      upset_bonus:r.upset_bonus,
      streak_bonus:r.streak_bonus,
      cold_bonus:r.cold_bonus,
      total_points:r.total_points,
      unicorn_count:r.unicorn_count,
      upset_count:r.upset_count,
      opening_streak:r.opening_streak,
      tiebreaker_answer:r.tiebreaker_answer
    }));
  }

  window.RegularScoringCore={
    placementPoints:[...placementPoints],
    sameAnswer,
    sortScoredQuestions,
    calculate,
    scorePayload
  };
})();
