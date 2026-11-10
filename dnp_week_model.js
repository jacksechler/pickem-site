// A one-week, commissioner-approved joke. Submission metadata only; no scoring changes.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DNPWeekModel=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  const WEEK='f4e0e72a-926f-4424-ab3e-30506b742392';
  const MEMBER='04d2ae6d-1eea-4536-878a-b4f24a61fa33';
  function build({activeWeek,profiles=[],submissions,seasonId,now=Date.now()}={}){
    const w=activeWeek;
    if(!w||w.id!==WEEK||w.is_active!==true||
      (seasonId&&w.season_id!==seasonId)||!Number.isFinite(Date.parse(w.lock_at))||
      now<Date.parse(w.lock_at)||!Array.isArray(submissions)||
      submissions.some(s=>s.user_id===MEMBER))return null;
    const member=profiles.find(p=>p.id===MEMBER);
    if(!member)return null;
    const name=member.display_name||member.username||'League member';
    return {
      id:WEEK+':dnp',weekId:WEEK,weekNumber:w.number,weekName:w.name||'Week 12',
      category:'satire',group:'satire',memberName:name,
      headline:name+' Sidelined by the Submit Button',
      deck:'DNP — Did Not Pick. A special LTSPN availability report on the toughest matchup of the week: the submission deadline.',
      body:[
        'LTSPN SATIRE — The submission record is real. The sports-report treatment is a joke; this article adds no scoring penalty.',
        name+' has landed on the Week 12 availability report with a designation rarely covered by television analysts: DNP — Did Not Pick. The deadline has passed, and no submitted entry is on file.',
        'On paper, the matchup looked manageable. One member. One entry. One submit button. Yet the button has emerged with the kind of defensive performance normally reserved for a championship highlight reel.',
        'There will be no film breakdown of the picks, because there are no submitted picks to break down. The empty space is currently making a compelling case for the league’s most minimalist game plan.',
        'The recovery plan is straightforward: locate next week’s games, make the selections, and finish the drive by pressing Submit. LTSPN considers that final step an underrated part of the offense.',
        'The DNP badge retires when the next week becomes active. Until then, the submit button remains undefeated in this particular matchup.'
      ],
      stats:[{label:'Availability',value:'DNP — Did Not Pick'},{label:'Extra penalty',value:'None'}],
      readMinutes:1
    };
  }
  return {WEEK,MEMBER,build};
});
