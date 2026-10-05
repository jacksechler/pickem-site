-- Regular-season cards are launched manually; the season calendar is a blueprint.
-- Playoff calendar changes are rejected through the exposed postseason action.
-- The existing week number sequence remains 1..regular_week_count so playoff seeding stays deterministic.

create or replace function private.start_regular_week(
  sid uuid,
  p_name text,
  p_lock_at timestamptz,
  p_tiebreaker_prompt text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  settings public.postseason_seasons;
  current_week public.weeks;
  next_number integer;
  new_week_id uuid;
  week_name text := trim(coalesce(p_name,''));
  tie_prompt text := trim(coalesce(p_tiebreaker_prompt,''));
begin
  if auth.uid() is null or not private.is_commissioner() then
    raise exception 'Commissioner access required.' using errcode='42501';
  end if;

  if sid is null then
    raise exception 'Choose a season.';
  end if;

  select * into settings
  from public.postseason_seasons
  where season_id=sid
  for update;

  if not found then
    raise exception 'No postseason calendar is configured for this season.';
  end if;

  if settings.status <> 'scheduled' then
    raise exception 'The regular season is frozen.';
  end if;

  if week_name = '' then
    raise exception 'Enter a name for the new week.';
  end if;

  if p_lock_at is null or p_lock_at <= now() then
    raise exception 'Choose a future lock time.';
  end if;

  if tie_prompt = '' then
    tie_prompt := 'Total points in the featured game?';
  end if;

  if exists(
    select 1
    from public.weeks
    where season_id=sid
      and phase='regular'
      and status='draft'
  ) then
    raise exception 'Finish or publish the current regular-season week first.';
  end if;

  select coalesce(max(number),0)+1
    into next_number
  from public.weeks
  where season_id=sid
    and phase='regular';

  if next_number > settings.regular_week_count then
    raise exception 'The regular season is complete. Use Start Playoffs.';
  end if;

  if exists(
    select 1
    from public.weeks
    where season_id=sid
      and number=next_number
  ) then
    raise exception 'The next week number is already in use.';
  end if;

  select *
    into current_week
  from public.weeks
  where season_id=sid
    and is_active
  order by number desc
  limit 1;

  if found and (current_week.phase <> 'regular' or current_week.status <> 'published') then
    raise exception 'Publish the current active week first.';
  end if;

  update public.weeks
  set is_active=false
  where season_id=sid
    and is_active;

  insert into public.weeks(
    season_id,
    number,
    name,
    lock_at,
    status,
    is_active,
    tiebreaker_prompt
  )
  values(
    sid,
    next_number,
    week_name,
    p_lock_at,
    'draft',
    true,
    tie_prompt
  )
  returning id into new_week_id;

  insert into public.commissioner_activity_log(
    actor_id,
    week_id,
    action_type,
    summary,
    details
  )
  values(
    auth.uid(),
    new_week_id,
    'regular_week_started',
    'Regular-season week started manually',
    jsonb_build_object(
      'season_id',sid,
      'week_number',next_number,
      'name',week_name,
      'lock_at',p_lock_at,
      'schedule_mode','blueprint'
    )
  );

  return jsonb_build_object(
    'week_id',new_week_id,
    'week_number',next_number,
    'name',week_name,
    'lock_at',p_lock_at
  );
end;
$$;

revoke all on function private.start_regular_week(uuid,text,timestamptz,text) from public;
revoke all on function private.start_regular_week(uuid,text,timestamptz,text) from anon;
revoke all on function private.start_regular_week(uuid,text,timestamptz,text) from authenticated;

create or replace function public.commissioner_start_regular_week(
  p_season_id uuid,
  p_name text,
  p_lock_at timestamptz,
  p_tiebreaker_prompt text default null
)
returns jsonb
language sql
security definer
set search_path=''
as $$
  select private.start_regular_week(
    p_season_id,
    p_name,
    p_lock_at,
    p_tiebreaker_prompt
  );
$$;

revoke all on function public.commissioner_start_regular_week(uuid,text,timestamptz,text) from public;
revoke all on function public.commissioner_start_regular_week(uuid,text,timestamptz,text) from anon;
grant execute on function public.commissioner_start_regular_week(uuid,text,timestamptz,text) to authenticated;

-- The exposed postseason action remains the common playoff API. Its old
-- regular-week action stays available only for backward compatibility; the
-- client now uses commissioner_start_regular_week instead.
alter function private.postseason_action(text,jsonb)
  rename to postseason_action_schedule_legacy;

revoke all on function private.postseason_action_schedule_legacy(text,jsonb) from public;
revoke all on function private.postseason_action_schedule_legacy(text,jsonb) from anon;
revoke all on function private.postseason_action_schedule_legacy(text,jsonb) from authenticated;

create or replace function private.postseason_action(action text, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  if action='save_calendar' then
    raise exception 'Playoff schedule is fixed. Regular-season schedule is a blueprint.';
  end if;

  return private.postseason_action_schedule_legacy(action,payload);
end;
$$;

revoke all on function private.postseason_action(text,jsonb) from public;
revoke all on function private.postseason_action(text,jsonb) from anon;
revoke all on function private.postseason_action(text,jsonb) from authenticated;

create or replace function public.postseason_action(
  p_action text,
  p_payload jsonb
)
returns jsonb
language sql
set search_path=''
as $$
  select private.postseason_action(p_action,p_payload);
$$;

revoke all on function public.postseason_action(text,jsonb) from public;
revoke all on function public.postseason_action(text,jsonb) from anon;
grant execute on function public.postseason_action(text,jsonb) to authenticated;
