-- Revision requested before playoffs: neutral round names and continuous semifinals.
-- Apply after postseason.sql. No active week, points, picks or submissions are changed.
do $$ begin
 if exists(select 1 from public.postseason_seasons p join public.seasons s on s.id=p.season_id where s.year=2026 and (p.status<>'scheduled' or exists(select 1 from public.playoff_rounds r where r.season_id=p.season_id))) then
  raise exception 'This calendar revision requires a postseason that has not started.';
 end if;
end $$;

alter table public.season_calendar add column finalize_not_before timestamptz;
update public.season_calendar c set label=(array['Playoff Week 1','Quarterfinals','Semifinals','Championship'])[c.round_number],
 sports=case when c.round_number<=2 then array['NFL','CFB','CBB'] else array['NFL','CBB'] end
from public.seasons s where s.id=c.season_id and s.year=2026 and c.phase='playoff';
update public.season_calendar c set ends_on='2027-02-08',finalize_not_before='2027-02-09 08:00 America/New_York',
 notes='4 → 2. One extended semifinal card, January 28–February 8, covering NFL conference championships and CBB across both weeks. The initial Thursday lock covers all picks for this card; February 2 continues the same round. Finalize on Tuesday February 9 after every scored result is entered. CFB remains available for any real game within the window; the CFP concludes January 25.'
from public.seasons s where s.id=c.season_id and s.year=2026 and c.round_number=3;
-- The former off week now belongs to Semifinals. Championship retains its own card.
delete from public.season_calendar c using public.seasons s where s.id=c.season_id and s.year=2026 and c.phase='break';
update public.season_calendar c set slot=24,
 notes='2 → 1. Championship card February 11–14, with CBB and the Super Bowl on Sunday February 14. No Monday games. Set up Tuesday February 9 and confirm the Thursday lock against selected games. Plan 15–25 scored questions. CFB remains selectable if a real game fits; the CFP concludes January 25.'
from public.seasons s where s.id=c.season_id and s.year=2026 and c.round_number=4;

create or replace function private.playoff_round_state(wid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.playoff_rounds; w public.weeks; rows jsonb; revision text; total integer; decided integer; submitted integer; fun integer; cal public.season_calendar; schedule_pending boolean;
begin
 select * into r from public.playoff_rounds where week_id=wid;
 if not found then return null; end if;
 select * into w from public.weeks where id=wid;
 select * into cal from public.season_calendar where season_id=r.season_id and round_number=r.round_number;
 schedule_pending:=cal.finalize_not_before is not null and now()<cal.finalize_not_before;
 select count(*) filter(where counts_for_score),count(*) filter(where counts_for_score and result is not null and result<>'null'::jsonb) into total,decided from public.questions where week_id=wid;
 if r.status='finalized' then
   select coalesce(jsonb_agg(to_jsonb(rr)||jsonb_build_object('display_name',p.display_name,'sort_index',rr.round_rank) order by rr.round_rank),'[]') into rows from public.playoff_round_results rr join public.profiles p on p.id=rr.user_id where round_id=r.id;
 else rows:=private.playoff_projection(r.id); end if;
 select count(*) filter(where exists(select 1 from jsonb_array_elements(rows) entry where entry->>'user_id'=s.user_id::text)),count(*) filter(where not exists(select 1 from jsonb_array_elements(rows) entry where entry->>'user_id'=s.user_id::text)) into submitted,fun from public.submissions s join public.playoff_entries e on e.user_id=s.user_id and e.season_id=r.season_id where s.week_id=wid;
 select md5(jsonb_build_object('week',to_jsonb(w),'round',to_jsonb(r),'rows',rows,
 'questions',(select jsonb_agg(to_jsonb(q) order by q.id) from public.questions q where week_id=wid),
 'picks',(select jsonb_agg(to_jsonb(p) order by p.user_id,p.question_id) from public.picks p where week_id=wid),
 'submissions',(select jsonb_agg(to_jsonb(s) order by s.user_id) from public.submissions s where week_id=wid))::text) into revision;
 return jsonb_build_object('round',to_jsonb(r),'week',to_jsonb(w),'rows',rows,'revision',revision,'question_count',total,'decided_count',decided,
 'ends_on',cal.ends_on,'finalize_not_before',cal.finalize_not_before,'schedule_pending',schedule_pending,
 'submitted',submitted,'fun_submitted',fun,'locked',w.lock_at<=now() or w.status='published',
 'tiebreaker_pending',not private.playoff_number_ok(w.tiebreaker_result),
 'ready',not schedule_pending and total>0 and total=decided and private.playoff_number_ok(w.tiebreaker_result) and w.lock_at<=now());
end $$;

create or replace function private.playoff_finalize(wid uuid,expected text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.playoff_rounds; w public.weeks; snapshot jsonb; rows jsonb; item jsonb; next_status text;
begin
 select * into r from public.playoff_rounds where week_id=wid for update;
 if not found then raise exception 'Playoff round not found.'; end if;
 if r.status='finalized' then raise exception 'This round is already finalized.'; end if;
 select * into w from public.weeks where id=wid for update;
 snapshot:=private.playoff_round_state(wid);
 if expected is null or snapshot->>'revision'<>expected then raise exception 'Results changed after your preview. Calculate the standings again.'; end if;
 if (snapshot->>'schedule_pending')::boolean then raise exception 'The extended semifinals are still in progress. Finalize after the full round ends, from %.',snapshot->>'finalize_not_before'; end if;
 if not (snapshot->>'ready')::boolean then raise exception 'Lock the week, enter every scored result and save the actual tiebreaker first.'; end if;
 if (select count(*) from public.playoff_entries where season_id=r.season_id and status='active')<>r.participants_before then raise exception 'Active contender count does not match this round.'; end if;
 rows:=private.playoff_projection(r.id,null,null,false,true);
 for item in select value from jsonb_array_elements(rows) loop
   next_status:=case when (item->>'sort_index')::integer<=r.participants_after then case when r.round_number=4 then 'champion' else 'active' end else case when r.round_number=4 then 'runner_up' else 'eliminated' end end;
   insert into public.playoff_round_results(round_id,user_id,seed,cumulative_before,round_correct,round_tiebreaker_answer,round_tiebreaker_distance,cumulative_after,round_rank,advanced,status_after)
   values(r.id,(item->>'user_id')::uuid,(item->>'seed')::integer,(item->>'cumulative_before')::numeric,(item->>'round_correct')::integer,(item->>'round_tiebreaker_answer')::numeric,(item->>'round_tiebreaker_distance')::numeric,(item->>'cumulative_after')::numeric,(item->>'sort_index')::integer,(item->>'sort_index')::integer<=r.participants_after,next_status);
   update public.playoff_entries set playoff_points=playoff_points+(item->>'round_correct')::integer,status=next_status,
    eliminated_round=case when next_status in ('eliminated','runner_up') then r.round_number end,
    eliminated_week_id=case when next_status in ('eliminated','runner_up') then wid end,
    eliminated_at=case when next_status in ('eliminated','runner_up') then now() end,updated_at=now()
   where season_id=r.season_id and user_id=(item->>'user_id')::uuid;
 end loop;
 -- All eight may play for fun. Only the active entrants above affect the title race.
 insert into public.week_scores(week_id,user_id,placement,correct_count,question_count,pick_percentage,placement_points,perfect_bonus,unicorn_bonus,upset_bonus,streak_bonus,cold_bonus,total_points,unicorn_count,upset_count,opening_streak,tiebreaker_answer)
 select wid,user_id,row_number() over(order by correct desc,distance asc nulls last,seed)::integer,correct,total,case when total>0 then 100.0*correct/total else 0 end,0,0,0,0,0,0,correct,0,0,0,tiebreaker_answer from (
  select e.user_id,e.seed,s.tiebreaker_answer,
   case when private.playoff_number_ok(s.tiebreaker_answer) then abs(s.tiebreaker_answer-w.tiebreaker_result) end distance,
   (select count(*)::integer from public.questions q where q.week_id=wid and q.counts_for_score) total,
   (select count(*)::integer from public.questions q join public.picks p on p.question_id=q.id and p.week_id=wid and p.user_id=e.user_id where q.week_id=wid and q.counts_for_score and q.result=p.answer and q.result<>'null'::jsonb and s.user_id is not null) correct
  from public.playoff_entries e left join public.submissions s on s.week_id=wid and s.user_id=e.user_id where e.season_id=r.season_id
 ) scored;
 update public.playoff_rounds set status='finalized',finalized_at=now() where id=r.id;
 update public.weeks set status='published',published_at=now() where id=wid;
 if r.round_number=4 then update public.postseason_seasons set status='complete',champion_id=(select user_id from public.playoff_entries where season_id=r.season_id and status='champion'),updated_at=now() where season_id=r.season_id; end if;
 insert into public.commissioner_activity_log(actor_id,week_id,action_type,summary,details) values(auth.uid(),wid,'playoff_finalized',r.label||' finalized',jsonb_build_object('round',r.round_number,'advance',r.participants_after));
 return private.playoff_round_state(wid);
end $$;

create or replace function private.postseason_action(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare sid uuid:=(payload->>'season_id')::uuid; wid uuid:=(payload->>'week_id')::uuid; settings public.postseason_seasons;
 cal public.season_calendar; r public.playoff_rounds; rows jsonb; item jsonb; result jsonb; revised jsonb; changes jsonb; actual numeric;
 next_round integer; before_count integer; after_count integer; n integer; lock_time timestamptz; later boolean; expected text; snapshot jsonb;
begin
 perform private.playoff_require_member();
 if not private.is_commissioner() then raise exception 'Commissioner access required.' using errcode='42501'; end if;
 perform set_config('app.postseason_write','on',true);
 if sid is null and wid is not null then select season_id into sid from public.weeks where id=wid; end if;
 if sid is null then raise exception 'Choose a season.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(sid::text,0));
 select * into settings from public.postseason_seasons where season_id=sid for update;
 if not found then raise exception 'No postseason calendar is configured for this season.'; end if;
 if wid is not null and not exists(select 1 from public.weeks where id=wid and season_id=sid) then raise exception 'Week is outside this season.'; end if;

 if action in ('preview_start','start') then
  if settings.status<>'scheduled' or exists(select 1 from public.playoff_entries where season_id=sid) then raise exception 'Playoffs have already started.'; end if;
  rows:=private.playoff_seed_preview(sid); expected:=md5(rows::text);
  select count(*) into n from public.weeks where season_id=sid and phase='regular' and status='published';
  result:=jsonb_build_object('rows',rows,'revision',expected,'published_weeks',n,'required_weeks',settings.regular_week_count,'date_ready',now()>=settings.start_not_before,'start_not_before',settings.start_not_before);
  if action='preview_start' then return result; end if;
  if now()<settings.start_not_before then raise exception 'Playoffs are scheduled for January. They cannot start yet.'; end if;
  if n<>settings.regular_week_count or exists(select 1 from generate_series(1,settings.regular_week_count) needed where not exists(select 1 from public.weeks where season_id=sid and phase='regular' and number=needed and status='published')) or exists(select 1 from public.weeks where season_id=sid and phase='regular' and status<>'published') then raise exception 'Publish all regular-season weeks before starting playoffs.'; end if;
  if jsonb_array_length(rows)<>8 or exists(select 1 from public.player_slots where claimed_by is null) then raise exception 'Exactly eight activated league members are required.'; end if;
  if exists(select 1 from public.weeks w cross join private.playoff_roster() p where w.season_id=sid and w.phase='regular' and not exists(select 1 from public.week_scores s where s.week_id=w.id and s.user_id=p.user_id)) then raise exception 'A regular-season score is missing. Finish scoring before freezing seeds.'; end if;
  if payload->>'revision' is distinct from expected then raise exception 'Season standings changed. Review the starting standings again.'; end if;
  select * into cal from public.season_calendar where season_id=sid and round_number=1;
  if not cal.lock_confirmed or cal.suggested_lock_at<=now() then raise exception 'Confirm the Playoff Week 1 lock before starting playoffs.'; end if;
  for item in select value from jsonb_array_elements(rows) loop
   insert into public.playoff_entries(season_id,user_id,seed,regular_season_points,regular_correct,regular_wins) values(sid,(item->>'user_id')::uuid,(item->>'seed')::integer,(item->>'points')::numeric,(item->>'correct')::integer,(item->>'wins')::integer);
  end loop;
  update public.postseason_seasons set status='live',frozen_at=now(),updated_at=now() where season_id=sid;
  insert into public.commissioner_activity_log(actor_id,action_type,summary,details) values(auth.uid(),'playoffs_started','Regular season frozen; playoffs started',jsonb_build_object('season_id',sid,'seeds',rows));
  return private.postseason_action('create_round',jsonb_build_object('season_id',sid));
 elsif action='save_calendar' then
  select * into cal from public.season_calendar where season_id=sid and slot=(payload->>'slot')::integer for update;
  if not found or cal.phase='break' then raise exception 'Select a scored calendar week.'; end if;
  if exists(select 1 from public.weeks where season_id=sid and number=cal.week_number) then raise exception 'This week already exists. Use its normal week settings.'; end if;
  lock_time:=(payload->>'lock_at')::timestamptz;
  if lock_time is null or lock_time<=now() or (lock_time at time zone 'America/New_York')::date<cal.setup_date or (lock_time at time zone 'America/New_York')::date>cal.ends_on then raise exception 'Choose a future lock within this card’s date window.'; end if;
  update public.season_calendar set suggested_lock_at=lock_time,lock_confirmed=true where season_id=sid and slot=cal.slot;
  return jsonb_build_object('saved',true);
 elsif action='create_round' then
  if settings.status<>'live' then raise exception 'Start playoffs first.'; end if;
  if exists(select 1 from public.playoff_rounds where season_id=sid and status<>'finalized') then raise exception 'Finalize the current round first.'; end if;
  select coalesce(max(round_number),0)+1 into next_round from public.playoff_rounds where season_id=sid;
  if next_round>4 then raise exception 'The championship is complete.'; end if;
  select * into cal from public.season_calendar where season_id=sid and round_number=next_round;
  if now()<(cal.setup_date+time '08:00') at time zone 'America/New_York' then raise exception 'This round opens for setup on its scheduled Tuesday.'; end if;
  if not cal.lock_confirmed or cal.suggested_lock_at<=now() then raise exception 'Confirm this round’s future lock time in the calendar first.'; end if;
  before_count:=(array[8,6,4,2])[next_round]; after_count:=(array[6,4,2,1])[next_round];
  if (select count(*) from public.playoff_entries where season_id=sid and status='active')<>before_count then raise exception 'Contender count is not ready for this round.'; end if;
  update public.weeks set is_active=false where season_id=sid and is_active;
  insert into public.weeks(season_id,number,name,lock_at,is_active,phase,playoff_round,playoff_label,tiebreaker_prompt)
  values(sid,cal.week_number,cal.label,cal.suggested_lock_at,true,'playoff',next_round,cal.label,coalesce(nullif(payload->>'tiebreaker_prompt',''),'Total points in the featured game?')) returning id into wid;
  insert into public.playoff_rounds(season_id,week_id,round_number,label,participants_before,participants_after) values(sid,wid,next_round,cal.label,before_count,after_count);
  return jsonb_build_object('week_id',wid,'round_number',next_round);
 elsif action='create_regular_week' then
  if settings.status<>'scheduled' then raise exception 'The regular season is frozen.'; end if;
  if exists(select 1 from public.weeks where season_id=sid and status<>'published') then raise exception 'Publish the current week first.'; end if;
  select coalesce(max(number),0)+1 into n from public.weeks where season_id=sid and phase='regular';
  select * into cal from public.season_calendar where season_id=sid and week_number=n and phase='regular';
  if not found then raise exception 'The regular season is complete. Use Start Playoffs when its scheduled setup day arrives.'; end if;
  if now()<(cal.setup_date+time '08:00') at time zone 'America/New_York' then raise exception 'The next card opens for setup on Tuesday morning.'; end if;
  if not cal.lock_confirmed or cal.suggested_lock_at<=now() then raise exception 'Confirm this week’s lock time in the calendar first.'; end if;
  update public.weeks set is_active=false where season_id=sid and is_active;
  insert into public.weeks(season_id,number,name,lock_at,is_active,tiebreaker_prompt) values(sid,n,cal.label,cal.suggested_lock_at,true,coalesce(nullif(payload->>'tiebreaker_prompt',''),'Total points in the featured game?')) returning id into wid;
  return jsonb_build_object('week_id',wid);
 elsif action='preview_round' then
  return private.playoff_round_state(wid);
 elsif action='finalize' then
  return private.playoff_finalize(wid,payload->>'revision');
 elsif action in ('preview_correction','correct') then
  select * into r from public.playoff_rounds where week_id=wid and season_id=sid;
  if not found or r.status<>'finalized' then raise exception 'Select a finalized playoff round.'; end if;
  result:=private.playoff_round_state(wid); changes:=coalesce(payload->'results','{}'); actual:=(payload->>'tiebreaker_result')::numeric;
  if jsonb_typeof(changes)<>'object' or not private.playoff_number_ok(actual) then raise exception 'Provide corrected results and a valid actual tiebreaker.'; end if;
  if exists(select 1 from jsonb_object_keys(changes) k where not exists(select 1 from public.questions where id::text=k and week_id=wid)) then raise exception 'A correction belongs to a different week.'; end if;
  if exists(select 1 from public.questions q where q.week_id=wid and q.counts_for_score and (case when changes ? q.id::text then changes->q.id::text else q.result end is null or case when changes ? q.id::text then changes->q.id::text else q.result end='null'::jsonb)) then raise exception 'Every scored question needs a result.'; end if;
  revised:=private.playoff_projection(r.id,changes,actual,true,true);
  later:=exists(select 1 from public.playoff_rounds where season_id=sid and round_number>r.round_number);
  if action='preview_correction' then return jsonb_build_object('rows',revised,'revision',result->>'revision','rebuild_required',later,'round',to_jsonb(r)); end if;
  if payload->>'revision' is distinct from result->>'revision' then raise exception 'The round changed. Preview this correction again.'; end if;
  if later and payload->>'confirmation' is distinct from 'REBUILD PLAYOFFS FROM THIS ROUND' then raise exception 'A later round exists. Explicitly rebuild playoffs from this round; later entries and results will be invalidated.'; end if;
 elsif action='reset' then
  if payload->>'confirmation' is distinct from 'RESET ALL PLAYOFFS' then raise exception 'Type RESET ALL PLAYOFFS to confirm.'; end if;
 else raise exception 'Unknown postseason action.';
 end if;

 -- Reset/correction paths keep a complete commissioner audit before invalidating data.
 snapshot:=jsonb_build_object('settings',to_jsonb(settings),
 'entries',(select jsonb_agg(to_jsonb(e)) from public.playoff_entries e where season_id=sid),
 'rounds',(select jsonb_agg(to_jsonb(pr)) from public.playoff_rounds pr where season_id=sid),
 'results',(select jsonb_agg(to_jsonb(rr)) from public.playoff_round_results rr join public.playoff_rounds pr on pr.id=rr.round_id where pr.season_id=sid),
 'weeks',(select jsonb_agg(to_jsonb(x)) from public.weeks x where season_id=sid and phase='playoff'),
 'questions',(select jsonb_agg(to_jsonb(q)) from public.questions q join public.weeks x on x.id=q.week_id where x.season_id=sid and x.phase='playoff'),
 'picks',(select jsonb_agg(to_jsonb(p)) from public.picks p join public.weeks x on x.id=p.week_id where x.season_id=sid and x.phase='playoff'),
 'submissions',(select jsonb_agg(to_jsonb(s)) from public.submissions s join public.weeks x on x.id=s.week_id where x.season_id=sid and x.phase='playoff'));
 insert into private.playoff_rebuild_audit(season_id,actor_id,action,snapshot) values(sid,auth.uid(),action,snapshot);
 if action='reset' then
  delete from public.weeks where season_id=sid and phase='playoff';
  delete from public.playoff_entries where season_id=sid;
  update public.postseason_seasons set status='scheduled',frozen_at=null,champion_id=null,updated_at=now() where season_id=sid;
  update public.weeks set is_active=(id=(select id from public.weeks where season_id=sid and phase='regular' order by number desc limit 1)) where season_id=sid;
  return jsonb_build_object('reset',true);
 end if;
 delete from public.weeks where season_id=sid and phase='playoff' and playoff_round>r.round_number;
 delete from public.playoff_round_results where round_id=r.id;
 delete from public.week_scores where week_id=wid;
 update public.playoff_entries e set playoff_points=coalesce((select sum(rr.round_correct) from public.playoff_round_results rr join public.playoff_rounds pr on pr.id=rr.round_id where pr.season_id=sid and rr.user_id=e.user_id),0),
 status=coalesce((select rr.status_after from public.playoff_round_results rr join public.playoff_rounds pr on pr.id=rr.round_id where pr.season_id=sid and rr.user_id=e.user_id order by pr.round_number desc limit 1),'active'),
 eliminated_round=null,eliminated_week_id=null,eliminated_at=null,updated_at=now() where e.season_id=sid;
 update public.playoff_entries e set eliminated_round=pr.round_number,eliminated_week_id=pr.week_id,eliminated_at=pr.finalized_at from public.playoff_round_results rr join public.playoff_rounds pr on pr.id=rr.round_id where e.season_id=sid and e.user_id=rr.user_id and rr.status_after='eliminated';
 update public.postseason_seasons set status='live',champion_id=null,updated_at=now() where season_id=sid;
 update public.playoff_rounds set status='live',finalized_at=null where id=r.id;
 update public.weeks set is_active=false where season_id=sid and is_active;
 update public.weeks set status='draft',published_at=null,is_active=true,tiebreaker_result=actual where id=wid;
 update public.questions q set result=changes->q.id::text where q.week_id=wid and changes ? q.id::text;
 result:=private.playoff_round_state(wid);
 return private.playoff_finalize(wid,result->>'revision');
end $$;

notify pgrst,'reload schema';
