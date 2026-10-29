// LTSPN long-form reporting. Evidence comes exclusively from finalized league cards,
// eight-submission question rows, official placements, and retrospective rank math.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.LTSPNEditorialModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const fmt=n=>Number(n).toFixed(1).replace(/\.0$/,'');
  const valid=n=>n!==null&&n!==undefined&&n!==''&&Number.isFinite(Number(n));
  const word=v=>typeof v==='string'?v:String(v===undefined||v===null?'—':JSON.stringify(v));
  const plurality=(n,s)=>n===1?s:s+'s';
  const join=(names)=>{
    if(names.length===0)return 'none';
    if(names.length===1)return names[0];
    if(names.length===2)return names.join(' and ');
    return names.slice(0,-1).join(', ')+', and '+names.at(-1);
  };
  function sortedMembers(rows,names){
    return rows.map(r=>({id:r.user_id,name:names[r.user_id]||'Member',
      placement:Number(r.placement),correct:Number(r.correct_count),total:Number(r.total_points),
      questionCount:Number(r.question_count)}))
      .sort((a,b)=>a.placement-b.placement||b.correct-a.correct||a.name.localeCompare(b.name));
  }
  function stand(players){
    const rows=[...players].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name));
    const map={};
    rows.forEach(r=>map[r.id]=1+rows.filter(x=>x.total>r.total).length);
    return map;
  }
  function questionHighlights(questions,picks,members,weekId){
    const candidates=questions.filter(q=>q.week_id===weekId&&q.counts_for_score!==false&&
      q.result!==null&&q.result!==undefined && q.id);
    const idSet=new Set(members.map(m=>m.id));
    const picksMap=new Map();
    for(const p of picks){
      if(p.week_id!==weekId||!idSet.has(p.user_id)||!p.question_id)continue;
      const key=p.question_id+':'+p.user_id;
      if(picksMap.has(key))continue;
      picksMap.set(key,p.answer);
    }
    const winners=members.filter(m=>m.placement===1),rivals=members.filter(m=>m.placement!==1).slice(0,2);
    const results=[];
    for(const q of candidates){
      const answerByUser=new Map();
      for(const member of members){
        const key=q.id+':'+member.id;
        if(picksMap.has(key))answerByUser.set(member.id,picksMap.get(key));
      }
      // A missing member's answer would make the "only one picked it"
      // assertion wrong. Only describe distributions with a full eight picks.
      if(answerByUser.size!==8)continue;
      const correct=members.filter(m=>same(answerByUser.get(m.id),q.result));
      const winnerCorrect=winners.filter(m=>same(answerByUser.get(m.id),q.result));
      const rivalCorrect=rivals.filter(m=>same(answerByUser.get(m.id),q.result));
      const solo=correct.length===1?correct[0]:null;
      const rank=(winnerCorrect.length?45:0)+(winnerCorrect.length&&!rivalCorrect.length?40:0)+
        (solo?35:0)+(correct.length<4?(4-correct.length)*10:0)+
        ((Number(q.result_order)||Number(q.position)||0)/100);
      results.push({
        id:q.id,weekId,prompt:word(q.prompt||q.title||q.text||'Scored question'),
        sport:q.sport?word(q.sport):'League pick',
        outcome:word(q.result),correctCount:correct.length,fieldSize:members.length,
        correctNames:correct.map(m=>m.name),
        correctIds:correct.map(m=>m.id),
        winnerCorrect:winnerCorrect.map(m=>m.name),
        winnerIncorrect:winners.filter(m=>!winnerCorrect.includes(m)).map(m=>m.name),
        rivalCorrect:rivalCorrect.map(m=>m.name),
        soleWinner:solo?.name||null,
        winnerAnswers:winners.map(m=>({name:m.name,answer:word(answerByUser.get(m.id)),correct:same(answerByUser.get(m.id),q.result)})),
        challengerAnswers:rivals.map(m=>({name:m.name,answer:word(answerByUser.get(m.id)),correct:same(answerByUser.get(m.id),q.result)})),
        rank
      });
    }
    return results.sort((a,b)=>b.rank-a.rank||a.prompt.localeCompare(b.prompt));
  }
  function describePick(q,lead){
    const correctLabel=q.correctCount+' of '+q.fieldSize+' league members got it right';
    const leaders=q.winnerCorrect.length?
      join(q.winnerCorrect)+' '+(q.winnerCorrect.length===1?'was':'were')+' among them':
      'the weekly winner'+(q.winnerIncorrect.length>1?'s were':' was')+' not among them';
    const other=q.challengerAnswers.length?(' The closest challengers had '+
      q.challengerAnswers.map(p=>p.name+' on "'+p.answer+'"'+(p.correct?' (correct)':' (incorrect)')).join('; ')+'.'):'';
    return 'On "'+q.prompt+'", the officially recorded result was "'+q.outcome+
      '". '+correctLabel+', and '+leaders+'.'+other;
  }
  function buildRecap({week,members,highlights,previous,totals,profiles,submissions}){
    const name=week.name||'Week '+week.number;
    const winners=members.filter(m=>m.placement===1),next=members.find(m=>m.placement>1);
    if(!winners.length)return null;
    const top=winners[0],winnerNames=join(winners.map(m=>m.name));
    const maxCorrect=Math.max(...winners.map(m=>m.correct));
    const runner=next;
    const lead=winnerNames+(winners.length>1?' shared first place':' finished first')+
      ' in '+name+', completing '+maxCorrect+' of the '+top.questionCount+
      ' scored questions correctly. The official placements—not season point bonuses—established the weekly winner'+
      (winners.length>1?'s':'')+'.';
    const body=[lead];
    if(runner){
      const margin=maxCorrect-runner.correct;
      body.push(runner.name+' was the top finisher behind the winner'+(winners.length===1?'':'s')+
        ', with '+runner.correct+' correct answers and an official finish of #'+runner.placement+
        '. The gap on correct picks was '+margin+'. '+
        (margin===0?'With equal correct-pick totals, the official tiebreaker or tied-placement rules determined the listed finish.':
          'A difference of '+margin+' correctly answered '+plurality(margin,'question')+
          ' separated the top two totals. Individual correct answers, not point multipliers, were the basis for that gap.'));
    }
    const sorted=[...members].sort((a,b)=>b.correct-a.correct||a.placement-b.placement);
    body.push('Across all eight members, correct-pick totals ran from '+sorted.at(-1).correct+
      ' to '+sorted[0].correct+' for this card. '+sorted.slice(0,4).map(m=>
        m.name+' ('+m.correct+' correct, #'+m.placement+')').join(', ')+
      ' formed the leading group on the published scoreboard. Those totals show how close the race was before any season-scoring bonuses were applied.');
    const selected=highlights.slice(0,5);
    if(selected.length){
      const standout=selected[0];
      body.push('The clearest separation in the submitted picks came from specific answers rather than the season standings. '+
        'One prominent example was "'+standout.prompt+'". The official result was "'+standout.outcome+
        '", and '+standout.correctCount+' of eight members predicted it correctly. '+
        (standout.soleWinner?standout.soleWinner+' was the only member credited with a correct answer on that question.':
          standout.winnerCorrect.length?
            join(standout.winnerCorrect)+' '+(standout.winnerCorrect.length===1?'was':'were')+' credited among the correct picks.':
            'The weekly winner did not receive credit for that result.'));
      selected.slice(1,4).forEach((q,i)=>{
        const correct=q.correctCount;
        const rare=correct<=2?'It was one of the more unusual correct calls on the published card.':
          correct>=6?'Most of the league anticipated that outcome, leaving little separation on this question.':
          'The league split on that outcome, creating a meaningful difference in correct-pick totals.';
        body.push('Another pick worth examining was "'+q.prompt+'". The recorded answer was "'+q.outcome+
          '", with '+correct+' of eight members correct. '+
          (q.winnerCorrect.length?join(q.winnerCorrect)+' had the right answer.':
            join(q.winnerIncorrect)+' missed this result.')+' '+rare+
          (q.challengerAnswers.length?' Among the next finishers, '+q.challengerAnswers.map(p=>
            p.name+' chose "'+p.answer+'"'+(p.correct?' correctly':' incorrectly')).join('; ')+'.':''));
      });
      const rare=highlights.filter(q=>q.correctCount===1);
      const leaderRare=rare.filter(q=>q.winnerCorrect.length>0);
      if(rare.length){
        body.push('The question-by-question ledger also shows '+rare.length+
          ' result'+(rare.length===1?'':'s')+' that only one member answered correctly. '+
          (leaderRare.length?
            'The weekly winner'+(winners.length>1?'s were':' was')+' responsible for '+
              leaderRare.length+' of those rare correct calls. ':
            'None of those single-member correct calls came from the weekly winner. ')+
          'That distinction matters for understanding the story of the picks, even though the official winner is ranked by total correct answers.');
      }else{
        body.push('The eight-player ledger did not show a question where exactly one member alone got the answer right. The week was instead shaped by how members combined correct calls across multiple questions, including answers shared by a smaller or larger share of the group.');
      }
    }else{
      body.push('The officially published scoreboard confirms the results and finishing positions, but a complete eight-person question-by-question archive is not available for this week. LTSPN cannot reliably identify which individual picks were rare or decisive without the original answer ledger, so this recap focuses on verified totals rather than guessing.');
    }
    const names=Object.fromEntries(profiles.filter(p=>p.id).map(p=>[p.id,p.display_name||p.username||'Member']));
    const after=stand([...totals.values()]),ranked=[...totals.values()].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name));
    const leader=ranked[0];
    const before=previous?stand([...previous.values()]):null;
    const movement=winners.map(w=>{
      const start=before?.[w.id],finish=after[w.id];
      return w.name+' '+(start===undefined?'opened the season at':'moved from #'+start+' to')+
        ' #'+finish+' in the current season standings';
    });
    body.push('The consequences go beyond one weekly trophy. Season standings award cumulative points, including any bonuses, and the latest published totals put '+
      leader.name+' at the top with '+fmt(leader.total)+' points. '+movement.join('; ')+
      '. Those positions reflect the published results through '+name+', not a projection of future picks.');
    const winnerPoints=winners.map(m=>m.name+' added '+fmt(m.total)+' season points').join('; ');
    body.push('The separate scoring systems explain why the weekly finish and the season race should not be confused: '+
      winnerPoints+', while the weekly crown comes from finishing position after correct picks and any applicable tiebreaker. The next update to the league standings will come from another published card, not from a prediction in this report.');
    const headline=winners.length===1?
      top.name+' wins '+name+': the picks that defined the week':
      winnerNames+' share '+name+' as the biggest picks reshape the race';
    const deck=winners.length===1?
      top.correct+' of '+top.questionCount+' correct and '+(runner?Math.max(0,top.correct-runner.correct)+' ahead of the next finisher':'an official first-place finish')+
        '. LTSPN breaks down the questions that created the separation.':
      winners.length+' members tie for first. A question-by-question look at the league-wide results.';
    return {
      id:week.id+':deep-dive',weekId:week.id,weekNumber:Number(week.number),weekName:name,
      group:'regular',category:'weekly',headline,deck,body,featured:true,
      priority:115,highlights:selected.map(q=>({
        id:q.id,prompt:q.prompt,outcome:q.outcome,correctCount:q.correctCount,
        fieldSize:q.fieldSize,correctNames:q.correctNames,winnerCorrect:q.winnerCorrect,
        description:describePick(q)
      })),
      stats:[{label:'Winner'+(winners.length>1?'s':''),value:winnerNames},
        {label:'Winning correct picks',value:maxCorrect+'/'+top.questionCount},
        {label:'Results analyzed',value:highlights.length+'/'+top.questionCount}],
      evidence:highlights.length?'Official published scores and complete eight-member picks':'Published scores; individual answer archive unavailable',
      readMinutes:Math.max(2,Math.ceil(body.join(' ').split(/\s+/).length/200)),
      winnerIds:winners.map(w=>w.id)
    };
  }
  function build({news,profiles=[],weeks=[],scores=[],questions=[],picks=[],submissions=[],seasonId=null}={}){
    if(!news||news.kind!=='ready')return news;
    const names=Object.fromEntries(profiles.filter(p=>p.id).map(p=>[p.id,p.display_name||p.username||'Member']));
    const ordered=[...weeks].filter(w=>w.id&&w.status==='published'&&(w.phase==null||w.phase==='regular')&&
      (!seasonId||!w.season_id||w.season_id===seasonId))
      .sort((a,b)=>Number(a.number)-Number(b.number));
    const totals=new Map(),original=new Map(news.entries.map(e=>[e.id,e]));
    const rebuilt=[];
    for(const week of ordered){
      const base=original.get(week.id);
      if(!base)continue;
      const official=scores.filter(s=>s.week_id===week.id);
      if(official.length!==8||new Set(official.map(s=>s.user_id)).size!==8)continue;
      const previous=new Map([...totals].map(([id,r])=>[id,{...r}]));
      const members=sortedMembers(official,names);
      members.forEach(m=>{
        const old=totals.get(m.id)||{id:m.id,name:m.name,total:0};
        totals.set(m.id,{...old,total:old.total+m.total});
      });
      const highlights=questionHighlights(questions,picks,members,week.id);
      const recap=buildRecap({week,members,highlights,previous,totals,profiles,submissions});
      const originalStories=base.stories||[];
      const richer=originalStories.map(story=>{
        if(story.id.endsWith(':winner'))return {
          ...story,
          body:recap?[...recap.body]:story.body,
          highlights:recap?.highlights||[],
          stats:recap?.stats||[],
          readMinutes:recap?.readMinutes||2,
          evidence:recap?.evidence||'Official published results'
        };
        const contextual=recap?[
          'The wider context of '+base.name+' begins with the officially published scoreboard: '+
            members.slice(0,3).map(m=>m.name+' finished #'+m.placement+
              ' with '+m.correct+' correct picks').join('; ')+'. '+
            'That leaderboard was determined by correct answers and the official tiebreaker rules.',
          ...highlights.slice(0,2).map(q=>describePick(q)),
          'The regular-season table is a separate cumulative points race. Following '+base.name+
            ', '+[...totals.values()].sort((a,b)=>b.total-a.total).slice(0,2)
            .map(m=>m.name+' had '+fmt(m.total)+' season points').join(' and ')+
            '. Only results already published through this week are counted.',
          'LTSPN uses archived answers and commissioner-published scores for this report. There are no invented interviews, game scores, or on-field events.'
        ]:[];
        return {...story,body:[...story.body,...contextual],
          highlights:highlights.slice(0,2).map(q=>({
            id:q.id,prompt:q.prompt,outcome:q.outcome,correctCount:q.correctCount,
            fieldSize:q.fieldSize,correctNames:q.correctNames,description:describePick(q)
          })),
          readMinutes:Math.max(2,Math.ceil(([...story.body,...contextual].join(' ').split(/\s+/).length)/200)),
          evidence:highlights.length?'Official published scores and complete eight-member picks':'Published scores; answer archive incomplete'};
      });
      const expanded=recap?[recap,...richer]:richer;
      rebuilt.push({...base,stories:expanded});
    }
    const playoffs=(news.playoffs||[]).map(story=>({
      ...story,
      body:[...story.body,
        'The bracket is decided by the rules of the postseason: each officially scored correct answer adds to the cumulative playoff total, and the advancement cut reduces the surviving field after each round. A live projected cut does not become official until the commissioner finalizes it.',
        'The retained seeds and starting bonuses carry across the playoff path. The listed finishers advanced or were eliminated according to the finalized round results, rather than a probability forecast.',
        'LTSPN will continue to track the surviving contenders and the path to the title as the remaining rounds are officially completed. Unpublished game outcomes and future picks are not reported as facts.'
      ],
      readMinutes:Math.max(2,Math.ceil(story.body.join(' ').split(/\s+/).length/180))
    }));
    const stories=[...playoffs,...rebuilt.slice().reverse().flatMap(w=>w.stories)];
    return {...news,entries:rebuilt,playoffs,stories,latest:stories[0]||null};
  }
  return {build,questionHighlights,buildRecap};
});