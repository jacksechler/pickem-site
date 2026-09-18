create or replace function private.commissioner_diagnostics(target_week uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  w public.weeks;
  member_count integer;
  commissioner_count integer;
  active_week_count integer;
  question_count integer;
  scored_count integer;
  decided_count integer;
  ordered_count integer;
  ordered_distinct integer;
  ordered_min integer;
  ordered_max integer;
  submission_count integer;
  required_count integer;
  pick_count integer;
  score_row_count integer;
  connected_count integer;
  live_sources jsonb;
  entry_health jsonb;
  push_users integer;
  push_subscriptions integer;
  cron_active boolean;
  last_notification_test jsonb;
  postseason_status text;
  playoff_active integer;
  playoff_round_count integer;
begin
  if auth.uid() is null or not private.is_commissioner() then
    raise exception 'Commissioner access required.' using errcode = '42501';
  end if;

  if target_week is null then
    select * into w from public.weeks where is_active order by number desc limit 1;
  else
    select * into w from public.weeks where id = target_week;
  end if;
  if not found then raise exception 'Week not found.'; end if;

  select count(*), count(*) filter (where role::text = 'commissioner')
  into member_count, commissioner_count from public.profiles;
  select count(*) into active_week_count from public.weeks where season_id = w.season_id and is_active;

  select count(*),
    count(*) filter (where counts_for_score),
    count(*) filter (where counts_for_score and result is not null and result <> 'null'::jsonb),
    count(*) filter (where counts_for_score and result is not null and result <> 'null'::jsonb and result_order is not null),
    count(distinct result_order) filter (where counts_for_score and result is not null and result <> 'null'::jsonb and result_order is not null),
    min(result_order) filter (where counts_for_score and result is not null and result <> 'null'::jsonb and result_order is not null),
    max(result_order) filter (where counts_for_score and result is not null and result <> 'null'::jsonb and result_order is not null)
  into question_count, scored_count, decided_count, ordered_count, ordered_distinct, ordered_min, ordered_max
  from public.questions where week_id = w.id;

  select count(*) into submission_count from public.submissions where week_id = w.id;
  if w.phase = 'playoff' then
    select coalesce(pr.participants_before, 0) into required_count from public.playoff_rounds pr where pr.week_id = w.id;
  else
    required_count := member_count;
  end if;
  select count(*) into pick_count from public.picks where week_id = w.id;
  select count(*) into score_row_count from public.week_scores where week_id = w.id;

  with required_users as (
    select p.id user_id,p.display_name from public.profiles p where w.phase <> 'playoff'
    union all
    select e.user_id,p.display_name from public.playoff_entries e join public.profiles p on p.id=e.user_id
    where w.phase='playoff' and e.season_id=w.season_id and e.status='active'
  ), health as (
    select ru.user_id,ru.display_name,
      exists(select 1 from public.submissions s where s.week_id=w.id and s.user_id=ru.user_id) submitted,
      (select count(*) from public.picks p where p.week_id=w.id and p.user_id=ru.user_id)::integer picks
    from required_users ru
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',user_id,'display_name',display_name,'submitted',submitted,'picks',picks,
    'expected_picks',question_count,'complete',submitted and picks=question_count
  ) order by display_name),'[]'::jsonb) into entry_health from health;

  select count(*) into connected_count from public.questions q
  where q.week_id=w.id and q.team_meta #>> '{live_score,provider}'='cbs'
    and nullif(q.team_meta #>> '{live_score,sourcePage}','') is not null;

  with sources as (
    select distinct q.team_meta #>> '{live_score,sourcePage}' source_page,
      q.team_meta #>> '{live_score,league}' league
    from public.questions q
    where q.week_id=w.id and q.team_meta #>> '{live_score,provider}'='cbs'
      and nullif(q.team_meta #>> '{live_score,sourcePage}','') is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'league',s.league,'source_page',s.source_page,'fetched_at',c.fetched_at,
    'failure_count',coalesce(c.failure_count,0),'game_count',coalesce(jsonb_array_length(c.games),0),
    'cached',c.source_page is not null
  ) order by s.league,s.source_page),'[]'::jsonb)
  into live_sources from sources s left join public.live_score_cache c on c.source_page=s.source_page;

  select count(distinct user_id),count(*) into push_users,push_subscriptions from public.push_subscriptions;
  select coalesce(bool_or(active),false) into cron_active from cron.job where jobname='pickem-automatic-notifications';
  select to_jsonb(x) into last_notification_test from (
    select created_at,summary,details from public.commissioner_activity_log
    where action_type='notification_test' order by created_at desc limit 1
  ) x;
  select ps.status into postseason_status from public.postseason_seasons ps where ps.season_id=w.season_id;
  select count(*) filter(where status='active') into playoff_active from public.playoff_entries where season_id=w.season_id;
  select count(*) into playoff_round_count from public.playoff_rounds where season_id=w.season_id;

  return jsonb_build_object(
    'checked_at',now(),
    'week',jsonb_build_object('id',w.id,'season_id',w.season_id,'number',w.number,'name',w.name,'phase',w.phase,
      'status',w.status,'is_active',w.is_active,'lock_at',w.lock_at,'locked',now()>=w.lock_at or w.status::text='published',
      'auto_locked_at',w.auto_locked_at,'tiebreaker_result_saved',w.tiebreaker_result is not null),
    'league',jsonb_build_object('members',member_count,'commissioners',commissioner_count,'active_weeks',active_week_count),
    'questions',jsonb_build_object('total',question_count,'scored',scored_count,'decided',decided_count,
      'result_ordered',ordered_count,'result_order_distinct',ordered_distinct,'result_order_min',ordered_min,'result_order_max',ordered_max),
    'entries',jsonb_build_object('required',required_count,'submitted',submission_count,'pick_rows',pick_count,
      'expected_required_pick_rows',required_count*question_count,'players',entry_health),
    'scores',jsonb_build_object('rows',score_row_count,'expected_when_published',member_count),
    'live_scores',jsonb_build_object('connected_questions',connected_count,'question_count',question_count,'sources',live_sources),
    'notifications',jsonb_build_object('cron_active',cron_active,'subscription_users',push_users,'subscriptions',push_subscriptions,'last_test',last_notification_test),
    'postseason',jsonb_build_object('status',postseason_status,'active_entries',playoff_active,'rounds_created',playoff_round_count,
      'starting_bonuses',jsonb_build_array(
        private.playoff_start_bonus(1),private.playoff_start_bonus(2),private.playoff_start_bonus(3),private.playoff_start_bonus(4),
        private.playoff_start_bonus(5),private.playoff_start_bonus(6),private.playoff_start_bonus(7),private.playoff_start_bonus(8)))
  );
end;
$$;

revoke all on function private.commissioner_diagnostics(uuid) from public;
revoke all on function private.commissioner_diagnostics(uuid) from anon;
revoke all on function private.commissioner_diagnostics(uuid) from authenticated;

create or replace function public.commissioner_diagnostics(p_week_id uuid default null)
returns jsonb language sql security invoker set search_path=''
as $$ select private.commissioner_diagnostics(p_week_id); $$;

revoke all on function public.commissioner_diagnostics(uuid) from public;
revoke all on function public.commissioner_diagnostics(uuid) from anon;
grant execute on function public.commissioner_diagnostics(uuid) to authenticated;
