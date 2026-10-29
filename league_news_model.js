// League News Center: deterministic, source-backed headlines from OFFICIALLY PUBLISHED
// league results. No AI-generated quotes, fictional interviews or unfinalized winners.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.LeagueNewsModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const number=v=>v===null||v===undefined||v===''?NaN:Number(v);
  const fmt=v=>Number(v).toFixed(1).replace(/\.0$/,'');
  const valid=v=>Number.isFinite(number(v));
  const stable=(a,b)=>String(a).localeCompare(String(b));
  function competitionRanks(points){
    const rows=[...points].sort((a,b)=>b.total-a.total||stable(a.name,b.name));
    const ranks={};for(let i=0;i<rows.length;i++)
      ranks[rows[i].id]=1+rows.filter(p=>p.total>rows[i].total).length;
    return ranks;
  }
  function title(person){return person?.name||'Member';}
  function oddsMap(snapshots=[]){
    return new Map((snapshots||[]).filter(p=>p?.id&&p.odds).map(p=>[p.id,p]));
  }
  function build({profiles=[],weeks=[],scores=[],oddsSnapshots=[],postseason=null,seasonId=null}={}){
    const names=Object.fromEntries(profiles.filter(p=>p.id).map(p=>[p.id,p.display_name||p.username||'Member']));
    const regularWeeks=[...weeks].filter(w=>w?.id&&w.status==='published'&&
      (w.phase==null||w.phase==='regular')&&(!seasonId||!w.season_id||w.season_id===seasonId))
      .sort((a,b)=>Number(a.number)-Number(b.number)||stable(a.id,b.id));
    const entries=[],issues=[];
    const running=new Map();
    let previousRanks=null,previousLeaders=[],priorBest=-1,previousWeekId=null;
    const odds=oddsMap(oddsSnapshots);
    function story(week,type,headline,deck,body,priority=50,category='weekly',details={}){
      return {id:week.id+':'+type,weekId:week.id,weekNumber:Number(week.number),
        weekName:week.name||'Week '+week.number,group:'regular',category,
        headline,deck,body:Array.isArray(body)?body:[body],priority,...details};
    }
    for(const w of regularWeeks){
      const rows=scores.filter(s=>s.week_id===w.id);
      if(rows.length!==8||new Set(rows.map(r=>r.user_id)).size!==8||
        rows.some(r=>!r.user_id||!names[r.user_id]||
          ![r.placement,r.correct_count,r.question_count,r.total_points].every(valid)||
          Number(r.placement)<1||Number(r.correct_count)<0||Number(r.question_count)<Number(r.correct_count))){
        issues.push({weekId:w.id,weekName:w.name||'Week '+w.number,reason:'Incomplete official score records'});
        continue; // Never claim a weekly winner using partial or provisional scores.
      }
      const members=rows.map(r=>({
        id:r.user_id,name:names[r.user_id],placement:Number(r.placement),
        correct:Number(r.correct_count),questions:Number(r.question_count),
        points:Number(r.total_points)
      }));
      members.forEach(m=>{
        const past=running.get(m.id)||{id:m.id,name:m.name,total:0,correct:0,wins:0};
        running.set(m.id,{...past,total:past.total+m.points,
          correct:past.correct+m.correct,wins:past.wins+(m.placement===1?1:0)});
      });
      const after=[...running.values()],rankAfter=competitionRanks(after);
      const leaders=after.filter(p=>rankAfter[p.id]===1).map(p=>p.id);
      const winners=members.filter(m=>m.placement===1).sort((a,b)=>stable(a.name,b.name));
      const weekStories=[];
      if(winners.length){
        const winNames=winners.map(m=>m.name).join(' & ');
        const high=Math.max(...winners.map(m=>m.correct));
        const second=members.filter(m=>m.placement!==1).sort((a,b)=>a.placement-b.placement)[0];
        const different=second&&high!==second.correct;
        const headline=winners.length>1?
          winNames+' share the '+(w.name||'Week '+w.number)+' victory':
          winners[0].name+' wins '+(w.name||'Week '+w.number);
        const deck=winners.length>1?
          winners.length+' members officially finish tied for first.':
          winners[0].correct+' correct of '+winners[0].questions+' scored picks earns the weekly top finish.';
        let detail='Official results list '+winNames+' '+(winners.length>1?'as tied winners':'in first place')+
          '. The top finish has '+high+' correct picks.';
        if(winners.length===1&&second){
          detail+=different?
            ' The next finisher, '+second.name+', made '+second.correct+' correct picks.':
            ' '+second.name+' also had '+second.correct+' correct picks, so the official placement rules separated their finishes.';
        }
        weekStories.push(story(w,'winner',headline,deck,[
          detail,'These are the commissioner-published weekly placements, not a ranking based on bonus-heavy season points.'
        ],100,'weekly',{winnerIds:winners.map(m=>m.id)}));
      }
      if(previousRanks){
        const movers=after.map(p=>({id:p.id,name:p.name,
          before:previousRanks[p.id],after:rankAfter[p.id],
          change:previousRanks[p.id]-rankAfter[p.id]}))
          .filter(p=>Number.isFinite(p.change)&&p.change>0)
          .sort((a,b)=>b.change-a.change||a.after-b.after||stable(a.name,b.name));
        const mover=movers[0];
        if(mover){
          const lead=mover.change>=2?'surges':'climbs';
          weekStories.push(story(w,'movement',mover.name+' '+lead+' '+mover.change+' place'+(mover.change===1?'':'s'), 
            'The biggest positive regular-season standings move in '+(w.name||'this week')+'.',[
            mover.name+' moved from #'+mover.before+' to #'+mover.after+' on cumulative season points.',
            'Ranks are based on total season points, with equal point totals sharing a position.'
          ],75,'standings',{playerIds:[mover.id],movement:mover.change}));
        }
        if(leaders.length===1&&!previousLeaders.includes(leaders[0])){
          const champ=after.find(p=>p.id===leaders[0]);
          const old=previousLeaders.map(id=>names[id]).join(' & ');
          weekStories.push(story(w,'lead-change',champ.name+' takes the season lead',
            'A new outright leader moves to the top of the regular-season standings.',[
              champ.name+' now leads with '+fmt(champ.total)+' cumulative season points.',
              'The previous leader'+(previousLeaders.length===1?' was ':'s were ')+old+'. The standings reflect all published weeks through '+(w.name||'this week')+'.'
            ],88,'standings',{playerIds:[champ.id]}));
        }
        const prevTop=previousLeaders.length===1?previousLeaders[0]:null;
        const surprise=winners.find(m=>prevTop&&m.id!==prevTop&&previousRanks[m.id]>=5);
        if(surprise){
          weekStories.push(story(w,'outsider',surprise.name+' wins from the lower half of the standings',
            'An unexpected weekly winner based on entering-week season rank.',[
              'Entering '+(w.name||'this week')+', '+surprise.name+' was #'+previousRanks[surprise.id]+
              ' on cumulative points but finished first in the official weekly results.',
              'The result shows a member outside the top four in the previous standings winning the week. This is a standings-based surprise, not a betting upset.'
            ],66,'weekly',{playerIds:[surprise.id]}));
        }
      }
      const best=members.reduce((a,b)=>a.correct>b.correct?a:b);
      if(priorBest>=0&&best.correct>priorBest){
        weekStories.push(story(w,'pick-record',best.name+' sets a new season-high for correct picks',
          best.correct+' correct answers set a new single-week mark through '+(w.name||'this week')+'.',[
            best.name+' recorded '+best.correct+' correct picks in '+(w.name||'this week')+
            ', surpassing the previous season high of '+priorBest+'.',
            'This record compares correct picks in published regular-season weeks, not point bonuses.'
          ],65,'records',{playerIds:[best.id]}));
      }
      // Head-to-head news uses actual weekly correct picks; no made-up matchups or odds.
      if(previousRanks){
        const ordered=members.slice().sort((a,b)=>previousRanks[a.id]-previousRanks[b.id]||stable(a.name,b.name));
        const contenders=[];
        for(let i=0;i<ordered.length-1;i++){
          const a=ordered[i],b=ordered[i+1];
          const difference=Math.abs(a.correct-b.correct);
          if(difference===1&&Math.abs(previousRanks[a.id]-previousRanks[b.id])<=2)
            contenders.push({a,b,difference,priorGap:Math.abs(previousRanks[a.id]-previousRanks[b.id])});
        }
        contenders.sort((a,b)=>a.priorGap-b.priorGap||
          Math.min(a.a.placement,a.b.placement)-Math.min(b.a.placement,a.b.placement));
        if(contenders.length){
          const {a,b}=contenders[0],top=a.correct>b.correct?a:b,runner=top===a?b:a;
          weekStories.push(story(w,'rivalry',top.name+' edges '+runner.name+' in close weekly picks race',
            'Two neighboring contenders entered this week close in the season standings.',[
              top.name+' made '+top.correct+' correct picks, one more than '+runner.name+
              ' ('+runner.correct+') in '+(w.name||'this week')+'.',
              'This is a head-to-head comparison of weekly pick totals, not a separate league matchup or award of extra points.'
            ],60,'rivalries',{playerIds:[top.id,runner.id]}));
        }
      }
      if(odds.size){
        const current=odds.get('week:'+w.id);
        const prior=odds.get(previousWeekId?'week:'+previousWeekId:'start');
        if(current&&prior){
          const changed=members.map(m=>{
            const now=number(current.odds?.[m.id]),before=number(prior.odds?.[m.id]);
            return {name:m.name,id:m.id,now,before,change:now-before};
          }).filter(m=>Number.isFinite(m.change)).sort((a,b)=>b.change-a.change);
          const leader=changed[0];
          if(leader&&leader.change>=2.5){
            weekStories.push(story(w,'odds-rise',leader.name+' makes the biggest championship-odds gain',
              'The reconstructed title forecast moves '+leader.change.toFixed(1)+' percentage points.',[
                leader.name+"'s retrospective championship chance rose from "+leader.before.toFixed(1)+
                  '% to '+leader.now.toFixed(1)+'% across '+(w.name||'this week')+'.',
                'These are model estimates reconstructed from published scores, not probabilities that were recorded when the games happened.'
              ],70,'odds',{playerIds:[leader.id],oddsChange:leader.change}));
          }
        }
      }
      const topScore=Math.max(...members.map(m=>m.correct));
      priorBest=Math.max(priorBest,topScore);
      previousRanks=rankAfter;previousLeaders=leaders;previousWeekId=w.id;
      if(winners.length===0)issues.push({weekId:w.id,weekName:w.name||'Week '+w.number,
        reason:'No official first-place placement has been published'});
      entries.push({id:w.id,name:w.name||'Week '+w.number,number:Number(w.number),stories:weekStories});
    }
    const playoffs=playoffStories(postseason,names);
    const allStories=[...playoffs,...entries.slice().reverse().flatMap(w=>w.stories)];
    return {kind:'ready',entries,playoffs,stories:allStories,issues,
      latest:allStories[0]||null,weekCount:entries.length};
  }
  function playoffStories(data,names){
    if(!data||!['live','complete'].includes(data.settings?.status))return [];
    const rounds=[...(data.rounds||[])].filter(r=>r.status==='finalized')
      .sort((a,b)=>Number(a.round_number)-Number(b.round_number));
    const out=[];
    for(const round of rounds){
      const rows=(data.history||[]).filter(r=>r.round_id===round.id)
        .sort((a,b)=>Number(a.round_rank)-Number(b.round_rank));
      const before=Number(round.participants_before),after=Number(round.participants_after);
      if(rows.length!==before||new Set(rows.map(r=>r.user_id)).size!==before||!rows.every(r=>r.status_after))continue;
      const advancing=rows.filter(r=>r.advanced);
      if(advancing.length!==after)continue;
      const eliminated=rows.filter(r=>!r.advanced);
      const roundName=round.label||'Playoff Round '+round.round_number;
      const champ=rows.find(r=>r.status_after==='champion');
      const name=r=>r.display_name||names[r.user_id]||'Member';
      const isFinal=Number(round.round_number)===4;
      const headline=isFinal&&champ?
        name(champ)+' wins the league championship':
        roundName+' complete: '+advancing.length+' advance';
      const deck=isFinal&&champ?
        'The title is official after the commissioner finalized the championship round.':
        eliminated.length+' contender'+(eliminated.length===1?'':'s')+' eliminated from the title race.';
      const body=isFinal&&champ?[
        name(champ)+' finished #1 in the officially finalized championship round with '+
          (Number(champ.cumulative_after)).toFixed(1).replace(/\.0$/,'')+' cumulative playoff points.',
        'The runner-up was '+name(eliminated[0])+'. This result is official.'
      ]:[
        'The commissioner finalized '+roundName+'. '+advancing.map(r=>name(r)).join(', ')+
          ' officially advanced to the next round.',
        eliminated.map(r=>name(r)).join(' and ')+
          (eliminated.length===1?' was':' were')+' officially eliminated. '+
          'The playoff field is now '+after+' member'+(after===1?'':'s')+'.'
      ];
      out.push({id:'playoff:'+round.id,weekId:round.week_id||null,
        weekNumber:20+Number(round.round_number),weekName:roundName,group:'playoffs',
        category:'playoffs',headline,deck,body,priority:100,
        official:true,playerIds:advancing.map(r=>r.user_id)});
    }
    return out.reverse();
  }
  return {build,competitionRanks,playoffStories};
});