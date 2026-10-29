const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../playoff_race_model.js');

const ids=Array.from({length:8},(_,i)=>'user-'+i);
const field=ids.map((user_id,i)=>({user_id,seed:i+1,display_name:'Player '+(i+1),
  starting_bonus:[10,8,7,5,4,3,2,0][i],current_total:[10,8,7,5,4,3,2,0][i],status:'active'}));
const cut=[6,4,2,1];
const make=(config={})=>{
  const roundNumber=config.number||1, participantsBefore=[8,6,4,2][roundNumber-1],
    participantsAfter=cut[roundNumber-1], values=config.values||[30,25,20,15,14,13,2,1].slice(0,participantsBefore);
  const entries=(config.entries||field).map(x=>({...x}));
  const rows=(config.rows||entries.filter(x=>x.status==='active').slice(0,participantsBefore).map((e,i)=>({
    user_id:e.user_id,display_name:e.display_name,seed:e.seed,sort_index:i+1,round_rank:i+1,
    cumulative_after:values[i],round_correct:0,
    projected_status:i<participantsAfter?'projected_advance':'projected_out',cut_tie:false
  }))).map(x=>({...x}));
  const round={id:'round-'+roundNumber,round_number:roundNumber,label:'Round '+roundNumber,
    participants_before:participantsBefore,participants_after:participantsAfter,status:config.final?'finalized':'live'};
  return {
    settings:{season_id:'2026',status:config.complete?'complete':config.scheduled?'scheduled':'live',champion_id:config.championId||null},
    entries,rounds:config.rounds||[round],history:config.history||[],
    calendar:M.STAGES.map(s=>({phase:'playoff',round_number:s.number,label:s.title,starts_on:'2027-01-14',ends_on:'2027-01-18'})),
    current:config.scheduled?null:{
      round,rows,locked:config.locked!==false,question_count:config.total??12,decided_count:config.decided??10,
      tiebreaker_pending:config.actualEntered!==true,revision:'revision'
    }
  };
};
test('the road has exactly the official four cuts',()=>{
  assert.deepEqual(M.STAGES.map(s=>[s.before,s.after]),[[8,6],[6,4],[4,2],[2,1]]);
});
test('scheduled playoffs expose dates and progression but no made-up entrants',()=>{
  const d=make({scheduled:true,rounds:[],entries:[]});
  const road=M.road(d);
  assert.equal(road.rounds.length,4);
  assert.ok(road.rounds.every(x=>x.members.length===0&&x.mode==='future'));
  assert.equal(road.champion,null);
  assert.equal(M.survival(d).kind,'unavailable');
});
test('the tracker keeps all picks and projections concealed until lock',()=>{
  const d=make({locked:false});
  const s=M.survival(d);
  assert.equal(s.kind,'prelock');
  assert.ok(s.rows.every(x=>x.kind==='not_locked'));
  assert.equal(M.road(d).rounds[1].members.length,0);
});
test('with a two-question swing left, six clinch and two become mathematically unable to advance',()=>{
  const d=make();
  const s=M.survival(d);
  assert.equal(s.remaining,2);
  assert.equal(s.counts.clinched,6);
  assert.equal(s.counts.mathematicallyOut,2);
  assert.deepEqual(s.rows.map(r=>r.kind).slice(-2),['eliminated_math','eliminated_math']);
  assert.ok(s.rows.every(r=>r.mathematicallyCertain));
  assert.equal(s.kind,'live');
});
test('without decisive gaps, members remain projected, not officially eliminated',()=>{
  const d=make({values:[20,19,18,17,16,15,14,13],total:12,decided:5});
  const s=M.survival(d);
  assert.equal(s.remaining,7);
  assert.equal(s.rows[6].kind,'projected_out');
  assert.equal(s.rows[6].official,false);
  assert.match(s.rows[6].reason,/net points? needed to tie/);
  assert.equal(s.counts.mathematicallyOut,0);
});
test('a tiebreaker across the cut is unresolved unless scores mathematically prove otherwise',()=>{
  const d=make({values:[20,19,18,17,16,15,15,15],decided:12});
  d.current.rows[5].cut_tie=true;
  d.current.rows[5].projected_status='tiebreaker_pending';
  d.current.rows[6].cut_tie=true;
  d.current.rows[6].projected_status='tiebreaker_pending';
  const s=M.survival(d);
  assert.equal(s.rows[5].kind,'tiebreaker');
  assert.equal(s.rows[6].kind,'tiebreaker');
  assert.match(s.rows[6].reason,/tiebreaker/);
  assert.equal(M.road(d).rounds[1].mode,'future');
});
test('no question rows must not create official-seeming clinch statuses',()=>{
  const d=make({total:0,decided:0});
  assert.equal(M.survival(d).rows[0].kind,'pending');
});
test('finalized rounds use saved advanced flags rather than projections',()=>{
  const d=make({final:true});
  d.current.rows.forEach((r,i)=>{r.advanced=i<6;r.status_after=i<6?'active':'eliminated';});
  const s=M.survival(d);
  assert.equal(s.kind,'official');
  assert.equal(s.rows[0].kind,'advanced');
  assert.equal(s.rows[7].kind,'eliminated');
  assert.equal(s.counts.clinched,6);
  assert.equal(s.counts.mathematicallyOut,2);
});
test('official round history populates the previous stage and next-round qualifiers',()=>{
  const d=make({final:true});
  d.current.rows.forEach((r,i)=>{r.advanced=i<6;r.status_after=i<6?'active':'eliminated';});
  d.history=d.current.rows.map(r=>({...r,round_id:'round-1'}));
  const road=M.road(d);
  assert.equal(road.rounds[0].mode,'official');
  assert.equal(road.rounds[0].members.length,8);
  assert.equal(road.rounds[1].mode,'qualified');
  assert.equal(road.rounds[1].members.length,6);
  assert.ok(road.rounds[1].members.every(r=>r.official));
});
test('the next round may show projected qualifiers but never calls them official',()=>{
  const d=make();
  const road=M.road(d);
  assert.equal(road.rounds[1].mode,'projected');
  assert.equal(road.rounds[1].members.length,6);
  assert.ok(road.rounds[1].members.every(r=>r.official===false));
  assert.equal(road.rounds[2].members.length,0);
});
test('the 6→4 field does not reintroduce eliminated contestants',()=>{
  const entries=field.map((r,i)=>({...r,status:i<6?'active':'eliminated'}));
  const d=make({number:2,entries,values:[20,19,18,17,16,15]});
  const s=M.survival(d);
  assert.equal(s.cut,4);
  assert.equal(s.rows.length,6);
  assert.deepEqual(s.rows.map(r=>r.id),ids.slice(0,6));
  assert.equal(M.road(d).rounds[1].members.length,6);
});
test('championship completion shows confirmed winner and runner-up',()=>{
  const entries=field.map((r,i)=>({...r,status:i===0?'champion':i===1?'runner_up':'eliminated',current_total:20+i}));
  const d=make({number:4,final:true,complete:true,entries,championId:ids[0],
    rows:[
      {user_id:ids[0],display_name:'Player 1',seed:1,round_rank:1,cumulative_after:20,round_correct:7,advanced:true,status_after:'champion'},
      {user_id:ids[1],display_name:'Player 2',seed:2,round_rank:2,cumulative_after:19,round_correct:7,advanced:false,status_after:'runner_up'}
    ]});
  assert.equal(M.survival(d).rows[1].kind,'runner_up');
  assert.equal(M.road(d).champion.name,'Player 1');
  assert.equal(M.road(d).rounds[3].members[1].kind,'runner_up');
});
test('no caller-provided scores or cut values are mutated by modeling',()=>{
  const d=make(),before=JSON.stringify(d);
  M.survival(d);M.road(d);
  assert.equal(JSON.stringify(d),before);
});
