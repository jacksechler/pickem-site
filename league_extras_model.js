// Deterministic, read-only league features for profiles, awards and weekly studio coverage.
// Uses ONLY published regular-season weeks, their official scores, and finalized playoffs.
(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
 else root.LeagueExtrasModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const num=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
 const value=v=>num(v)??0;
 const pct=(n,d)=>d?100*n/d:0;
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const compare=(a,b)=>String(a).localeCompare(String(b));
 const name=p=>p?.display_name||p?.username||'Member';
 const sorted=(a,b)=>b.total-a.total||b.correct-a.correct||b.wins-a.wins||compare(a.name,b.name);
 function clean(data={}){
   const season=data.seasonId||null;
   const weeks=(data.weeks||[]).filter(w=>w?.id&&w.status==='published'&&
     (!w.phase||w.phase==='regular')&&(!season||!w.season_id||w.season_id===season))
     .sort((a,b)=>Number(a.number)-Number(b.number)||compare(a.id,b.id));
   const ids=new Set(weeks.map(w=>w.id));
   const profiles=(data.profiles||[]).filter(p=>p?.id);
   const rawScores=(data.scores||[]).filter(s=>ids.has(s.week_id));
   const recognized=new Set(profiles.map(p=>p.id));
   const goodWeeks=[],scores=[],issues=[];
   for(const w of weeks){
     const batch=rawScores.filter(s=>s.week_id===w.id);
     const complete=recognized.size===8&&batch.length===8&&new Set(batch.map(s=>s.user_id)).size===8
       &&batch.every(s=>recognized.has(s.user_id)&&num(s.correct_count)!==null
          &&num(s.question_count)!==null&&num(s.total_points)!==null&&num(s.placement)!==null
          &&Number(s.placement)>0&&Number(s.correct_count)>=0
          &&Number(s.correct_count)<=Number(s.question_count));
     if(!complete){issues.push(w.name||'Week '+w.number);continue;}
     goodWeeks.push(w);scores.push(...batch);
   }
   const knownIds=new Set(goodWeeks.map(w=>w.id));
   return {profiles,weeks:goodWeeks,scores,issues,
     questions:(data.questions||[]).filter(q=>knownIds.has(q.week_id)),
     picks:(data.picks||[]).filter(p=>knownIds.has(p.week_id)),
     postseason:data.postseason||null,seasonId:season};
 }
 function rankOfTotals(members){
   const list=[...members].sort(sorted);
   return Object.fromEntries(list.map((x,i)=>[x.id,i+1]));
 }
 function rarePickLedger(d){
   const ids=d.profiles.map(p=>p.id),profiles=new Map(d.profiles.map(p=>[p.id,p]));
   if(ids.length!==8)return [];
   const rare=[];
   for(const q of d.questions){
     if(!q.id||q.counts_for_score===false||q.result===null||q.result===undefined)continue;
     const rows=d.picks.filter(p=>p.week_id===q.week_id&&p.question_id===q.id);
     if(rows.length!==8||new Set(rows.map(p=>p.user_id)).size!==8||
       !rows.every(p=>profiles.has(p.user_id)&&p.answer!==undefined))continue;
     const correct=rows.filter(p=>same(p.answer,q.result));
     if(correct.length===0||correct.length>=4)continue;
     rare.push({weekId:q.week_id,questionId:q.id,prompt:q.prompt||q.title||'Question',
       result:q.result,correctIds:correct.map(p=>p.user_id),
       correctCount:correct.length,fieldSize:8,sport:q.sport||null});
   }
   return rare;
 }
 function build(data={}){
   const d=clean(data);
   const byId=new Map(d.profiles.map(p=>[p.id,{id:p.id,name:name(p),username:p.username||'',profile:p,
     weeks:[],points:0,correct:0,questions:0,wins:0,podiums:0,perfects:0,
     runnerUps:0,rareCorrect:0,rareSolo:0,rank:null,bestFinish:null}]));
   const allPlayers=Array.from(byId.values());
   const rare=rarePickLedger(d);
   const weekly=[];
   let previousRanks=null;
   for(const week of d.weeks){
     const scores=d.scores.filter(s=>s.week_id===week.id);
     const weekRows=[];
     for(const s of scores){
       const member=byId.get(s.user_id);if(!member)continue;
       const correct=value(s.correct_count),questions=value(s.question_count),points=value(s.total_points);
       const placement=value(s.placement);
       const row={id:s.user_id,weekId:week.id,weekName:week.name||'Week '+week.number,
         weekNumber:Number(week.number),correct,questions,points,placement,
         pickRate:pct(correct,questions),unicorns:value(s.unicorn_count),upsets:value(s.upset_count)};
       member.weeks.push(row);member.points+=points;member.correct+=correct;member.questions+=questions;
       if(placement===1)member.wins++;
       if(placement===2)member.runnerUps++;
       if(placement<=3)member.podiums++;
       if(questions>0&&correct===questions)member.perfects++;
       if(!member.bestFinish||placement<member.bestFinish)member.bestFinish=placement;
       weekRows.push(row);
     }
     const order=allPlayers.filter(p=>p.weeks.length).sort(sorted);
     const ranks=rankOfTotals(order);
     const changes=previousRanks?order.map(m=>({id:m.id,name:m.name,
       from:previousRanks[m.id],to:ranks[m.id],change:previousRanks[m.id]-ranks[m.id]}))
       .sort((a,b)=>b.change-a.change||a.to-b.to):[];
     const leaders=order.filter(m=>ranks[m.id]===1).map(m=>m.id);
     weekly.push({id:week.id,name:week.name||'Week '+week.number,number:Number(week.number),
       rows:weekRows.sort((a,b)=>a.placement-b.placement||b.correct-a.correct),
       winners:weekRows.filter(p=>p.placement===1).map(p=>p.id),leaders,
       movements:changes,standings:Object.fromEntries(order.map(p=>[p.id,
         {rank:ranks[p.id],total:p.points}]))});
     previousRanks=ranks;
   }
   rare.forEach(q=>q.correctIds.forEach(id=>{const m=byId.get(id);if(m){
     m.rareCorrect++;if(q.correctCount===1)m.rareSolo++;
   }}));
   const members=allPlayers.map(m=>{
     const rate=pct(m.correct,m.questions);
     const w=m.weeks;
     const last3=w.slice(-3);
     const recentCorrect=last3.reduce((x,y)=>x+y.correct,0);
     const recentQuestions=last3.reduce((x,y)=>x+y.questions,0);
     const recentRate=pct(recentCorrect,recentQuestions);
     const trend=w.length>1?m.weeks.at(-1).pickRate-m.weeks[0].pickRate:null;
     const bestWeek=[...w].sort((a,b)=>b.correct-a.correct||a.placement-b.placement)[0]||null;
     let longestWinRun=0,run=0;
     for(const row of w){run=row.placement===1?run+1:0;longestWinRun=Math.max(longestWinRun,run);}
     return {...m,pickRate:rate,averagePoints:w.length?m.points/w.length:0,
       averageFinish:w.length?w.reduce((a,b)=>a+b.placement,0)/w.length:null,
       recentRate,recentQuestions,trend,bestWeek,longestWinRun,
       lastFive:w.slice(-5).map(row=>row.placement),
       powerScore:m.questions>0?(0.65*(recentQuestions?recentRate:rate)+0.35*rate):null};
   });
   const rankings=[...members].sort(sorted);
   rankings.forEach((p,i)=>p.rank=d.weeks.length?i+1:null);
   const h2h={};
   for(const a of members)for(const b of members){
     if(a.id===b.id)continue;
     const bw=new Map(b.weeks.map(row=>[row.weekId,row]));
     let aWins=0,bWins=0,ties=0;
     for(const w of a.weeks){
       const x=bw.get(w.weekId);if(!x)continue;
       if(w.placement<x.placement)aWins++;
       else if(w.placement>x.placement)bWins++;
       else ties++;
     }
     h2h[a.id+':'+b.id]={aWins,bWins,ties,total:aWins+bWins+ties};
   }
   const power=members.filter(m=>m.powerScore!==null).sort((a,b)=>
     b.powerScore-a.powerScore||b.correct-a.correct||compare(a.name,b.name))
     .map((m,i)=>({id:m.id,name:m.name,rank:i+1,score:m.powerScore,
       recentRate:m.recentRate,seasonRate:m.pickRate,trend:m.trend}));
   const records=[];
   const byCategory=(id,label,rows,scoreFn,unit,descending=true)=>{
     if(!rows.length)return;
     const numeric=rows.map(row=>({row,score:scoreFn(row)}))
       .filter(x=>Number.isFinite(x.score));
     if(!numeric.length)return;
     const best=descending?Math.max(...numeric.map(x=>x.score)):Math.min(...numeric.map(x=>x.score));
     const winners=numeric.filter(x=>x.score===best).map(x=>x.row);
     records.push({id,label,holderIds:winners.map(x=>x.id),holderNames:winners.map(x=>x.name),
       value:best,unit,weekly:unit.includes('/week'),ties:winners.length>1});
   };
   const active=members.filter(m=>m.weeks.length>0);
   byCategory('season-points','Most season points',active,m=>m.points,'pts');
   byCategory('most-wins','Most weekly wins',active,m=>m.wins,'wins');
   byCategory('accuracy','Highest pick accuracy',active.filter(m=>m.questions>0),m=>m.pickRate,'%');
   byCategory('podiums','Most top-three finishes',active,m=>m.podiums,'top-3 finishes');
   byCategory('rare','Most rare correct picks',active.filter(m=>m.rareCorrect>0),m=>m.rareCorrect,'rare picks');
   byCategory('solo','Most unique correct picks',active.filter(m=>m.rareSolo>0),m=>m.rareSolo,'unique picks');
   byCategory('streak','Longest weekly winning streak',active.filter(m=>m.longestWinRun>0),m=>m.longestWinRun,'weeks in a row');
   const weekEntries=active.flatMap(m=>m.weeks.map(row=>({...row,id:m.id,name:m.name})));
   byCategory('best-week','Highest scoring week',weekEntries,m=>m.points,'pts/week');
   byCategory('correct-week','Most correct in a week',weekEntries,m=>m.correct,'correct/week');
   const upsets=active.filter(m=>m.weeks.some(x=>x.upsets>0));
   byCategory('upset-picks','Most recorded upset picks',upsets,m=>m.weeks.reduce((a,b)=>a+b.upsets,0),'upset picks');
   const finalRound=(d.postseason?.rounds||[]).find(r=>r.status==='finalized'&&Number(r.round_number)===4);
   const champion=finalRound?(d.postseason?.entries||[]).find(e=>e.status==='champion')||null:null;
   const frozen=d.postseason?.settings?.frozen_at?d.postseason.entries?.find(e=>Number(e.seed)===1):null;
   const championships=[];
   if(champion)championships.push({type:'league-champion',name:'League Champion',
     userId:champion.user_id,displayName:byId.get(champion.user_id)?.name||champion.display_name||'Member',
     seasonId:d.seasonId,status:'official',points:value(champion.current_total),seed:value(champion.seed)});
   if(frozen)championships.push({type:'regular-champion',name:'Regular-season Champion',
     userId:frozen.user_id,displayName:byId.get(frozen.user_id)?.name||frozen.display_name||'Member',
     seasonId:d.seasonId,status:'official',points:value(frozen.regular_season_points),seed:1});
   return {kind:'ready',weeks:weekly,members,rankings,h2h,power,records,rare,
     championships,postseason:d.postseason,issues:d.issues,
     weekCount:d.weeks.length,seasonId:d.seasonId};
 }
 function selectWeek(model,weekId){
   return model?.weeks?.find(w=>w.id===weekId)||model?.weeks?.at(-1)||null;
 }
 function headToHead(model,id){
   const me=model?.members?.find(m=>m.id===id);
   if(!me)return [];
   return model.members.filter(m=>m.id!==id)
     .map(m=>({id:m.id,name:m.name,...model.h2h[id+':'+m.id]}))
     .sort((a,b)=>b.total-a.total||b.aWins-a.aWins||compare(a.name,b.name));
 }
 function studio(model,weekId){
   const week=selectWeek(model,weekId);
   if(!week)return {kind:'empty',reason:'A published week is required before the first show.'};
   const top=week.rows[0],winners=week.winners.map(id=>model.members.find(m=>m.id===id)?.name||'Member');
   const movement=week.movements.find(m=>m.change>0)||null;
   // Each archived studio episode ranks members using only scores available that week.
   const power=model.members.map(m=>{
     const past=m.weeks.filter(w=>w.weekNumber<=week.number);
     const recent=past.slice(-3);
     const allC=past.reduce((a,b)=>a+b.correct,0),allQ=past.reduce((a,b)=>a+b.questions,0);
     const recentC=recent.reduce((a,b)=>a+b.correct,0),recentQ=recent.reduce((a,b)=>a+b.questions,0);
     return {id:m.id,name:m.name,seasonRate:pct(allC,allQ),recentRate:pct(recentC,recentQ),
       score:allQ?(0.65*pct(recentC,recentQ)+0.35*pct(allC,allQ)):null};
   }).filter(m=>m.score!==null)
     .sort((a,b)=>b.score-a.score||compare(a.name,b.name))
     .map((m,i)=>({...m,rank:i+1})).slice(0,5);
   const rare=model.rare.filter(q=>q.weekId===week.id).sort((a,b)=>a.correctCount-b.correctCount);
   const topContenders=week.rows.slice(0,3).map(r=>{
     const member=model.members.find(m=>m.id===r.id);
     return {...r,name:member?.name||'Member'};
   });
   const coverage=[
     {label:'TOP STORY',headline:winners.join(' & ')+' '+(winners.length>1?'share':'wins')+' '+week.name,
       detail:'Official first-place finish: '+(top?.correct??'—')+' correct of '+(top?.questions??'—')+' scored picks.'},
     ...(movement?[{label:'BIGGEST CLIMBER',headline:movement.name+' climbs '+movement.change+
       ' position'+(movement.change===1?'':'s'),detail:'From #'+movement.from+' to #'+movement.to+' in the published season standings.'}]:[]),
     ...(rare.length?[{label:'PICK OF THE WEEK',headline:rare[0].prompt,
       detail:rare[0].correctCount+' of 8 correct. The official result was '+String(rare[0].result)+'.'}]:[])
   ];
   return {kind:'ready',week,coverage,winners,topContenders,movement,power,rare,
     leagueLeader:week.leaders.map(id=>model.members.find(m=>m.id===id)?.name||'Member')};
 }
 function championship(data){
   const c=data?.current,round=c?.round;
   const entries=data?.entries||[];
   const currentRound=Number(round?.round_number)||0;
   const final=entries.find(e=>e.status==='champion');
   if(data?.settings?.status==='complete'&&final)
     return {kind:'official',champion:final,
       finalists:(c?.rows||[]).filter(r=>r.user_id===final.user_id||
         r.status_after==='runner_up'||r.status_after==='champion'),
       round,label:'Official League Champion'};
   if(currentRound!==4)return {kind:'upcoming',
     roundNumber:currentRound,round,status:data?.settings?.status||'scheduled',
     finalists:[],reason:'The championship matchup is determined only after the semifinals are officially finalized.'};
   const rows=c?.rows||[];
   if(rows.length!==2)return {kind:'unavailable',reason:'The championship field is not finalized.'};
   const total=row=>num(row.cumulative_after);
   const left=num(c.question_count),done=num(c.decided_count),remaining=
     left!==null&&done!==null&&done<=left&&done>=0?left-done:null;
   const ready=c.locked===true,official=round.status==='finalized';
   const sortedRows=[...rows].sort((a,b)=>Number(a.round_rank)-Number(b.round_rank));
   let mathematical=null;
   const a=sortedRows[0],b=sortedRows[1];
   if(ready&&remaining!==null&&total(a)!==null&&total(b)!==null&&
      Math.abs(total(a)-total(b))>remaining){
     mathematical=total(a)>total(b)?a.user_id:b.user_id;
   }
   let verdict='The title will be decided by the published final results and official tiebreaker.';
   if(!ready)verdict='Finalists are set. Their choices remain private until the championship card locks.';
   else if(remaining===null)verdict='The card is locked; waiting for complete scoring information.';
   else if(mathematical)verdict='One finalist has an insurmountable point lead, but the championship is not official until finalized.';
   else if(remaining===0)verdict='All scored questions are decided. Final confirmation and any tiebreaker are pending.';
   else verdict=remaining+' scored question'+(remaining===1?'':'s')+' still can change the championship outcome.';
   return {kind:official?'official':'live',finalists:sortedRows,round,
     locked:ready,remaining,decided:done,totalQuestions:left,mathematical,
     verdict,tiebreakerPending:!!c.tiebreaker_pending,weekId:c.week?.id||round.week_id||null,
     official,champion:official?entries.find(e=>e.status==='champion')||null:null};
 }
 function decidingPicks(questions=[],picks=[],finalists=[],weekId=null){
   if(finalists.length!==2||!weekId)return [];
   const [a,b]=finalists.map(r=>r.user_id);
   const byId=new Map(picks.filter(p=>p.week_id===weekId&&(p.user_id===a||p.user_id===b))
      .map(p=>[p.question_id+':'+p.user_id,p.answer]));
   return questions.filter(q=>q.week_id===weekId&&q.counts_for_score!==false&&q.id)
     .map(q=>{
       const first=byId.get(q.id+':'+a),second=byId.get(q.id+':'+b);
       if(first===undefined||second===undefined||same(first,second))return null;
       return {id:q.id,prompt:q.prompt||q.title||'Scored question',sport:q.sport||'Pick',
         first,second,result:q.result,decided:q.result!==null&&q.result!==undefined,
         firstCorrect:q.result!==null&&q.result!==undefined&&same(first,q.result),
         secondCorrect:q.result!==null&&q.result!==undefined&&same(second,q.result)};
     }).filter(Boolean);
 }
 return {build,clean,headToHead,selectWeek,studio,championship,decidingPicks,rarePickLedger};
});