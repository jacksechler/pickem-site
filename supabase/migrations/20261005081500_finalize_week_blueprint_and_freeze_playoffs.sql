-- Finalize the manual regular-week launcher and make the playoff calendar immutable.
-- Regular-season schedule rows remain editable as a planning blueprint; actual
-- regular weeks use commissioner-selected name/lock values and do not consult it.

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

  if sid is null then raise exception 'Choose a season.'; end if;

  select * into settings from public.postseason_seasons where season_id=sid for update;
  if not found then raise exception 'No postseason calendar is configured for this season.'; end if;
  if settings.status <> 'scheduled' then raise exception 'The regular season is frozen.'; end if;
  if week_name='' then raise exception 'Enter a name for the new week.'; end if;
  if p_lock_at is null or p_lock_at<=now() then raise exception 'Choose a future lock time.'; end if;
  if tie_prompt='' then tie_prompt:='Total points in the featured game?'; end if;

  if exists(select 1 from public.weeks where season_id=sid and phase='regular' and status='draft') then
    raise exception 'Finish or publish the current regular-season week first.';
  end if;

  select coalesce(max(number),0)+1 into next_number
  from public.weeks where season_id=sid and phase='regular';

  if next_number>settings.regular_week_count then
    raise exception 'The regular season is complete. Use Start Playoffs.';
  end if;

  if exists(select 1 from public.weeks where season_id=sid and number=next_number) then
    raise exception 'The next week number is already in use.';
  end if;

  select * into current_week
  from public.weeks where season_id=sid and is_active order by number desc limit 1;

  if found and (current_week.phase<>'regular' or current_week.status<>'published') then
    raise exception 'Publish the current active week first.';
  end if;

  -- Allow the protected week trigger to recognize this as an authorized
  -- postseason/commissioner write while preserving its other guards.
  perform set_config('app.postseason_write','on',true);

  update public.weeks set is_active=false where season_id=sid and is_active;

  insert into public.weeks(season_id,number,name,lock_at,status,is_active,tiebreaker_prompt)
  values(sid,next_number,week_name,p_lock_at,'draft',true,tie_prompt)
  returning id into new_week_id;

  insert into public.commissioner_activity_log(actor_id,week_id,action_type,summary,details)
  values(
    auth.uid(),new_week_id,'regular_week_started',
    'Regular-season week started manually',
    jsonb_build_object(
      'season_id',sid,
      'week_number',next_number,
      'name',week_name,
      'lock_at',p_lock_at,
      'schedule_mode','blueprint'
    )
  );

  return jsonb_build_object('week_id',new_week_id,'week_number',next_number,'name',week_name,'lock_at',p_lock_at);
end;
$$;

create or replace function private.postseason_action(action text, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  sid uuid := (payload->>'season_id')::uuid;
  slot_number integer := (payload->>'slot')::integer;
begin
  if action='save_calendar' and exists(
    select 1 from public.season_calendar
    where season_id=sid and slot=slot_number and phase='playoff'
  ) then
    raise exception 'Playoff schedule is fixed. Regular-season schedule is a blueprint.';
  end if;

  return private.postseason_action_schedule_legacy(action,payload);
end;
$$;

revoke all on function private.postseason_action(text,jsonb) from public;
revoke all on function private.postseason_action(text,jsonb) from anon;
revoke all on function private.postseason_action(text,jsonb) from authenticated;

create or replace function public.postseason_action(p_action text,p_payload jsonb)
returns jsonb
language sql
set search_path=''
as $$ select private.postseason_action(p_action,p_payload); $$;

revoke all on function public.postseason_action(text,jsonb) from public;
revoke all on function public.postseason_action(text,jsonb) from anon;
grant execute on function public.postseason_action(text,jsonb) to authenticated;

-- The playoff schedule is fixed from the season plan. The lock-confirmation
-- flag is treated as a built-in fixed value rather than something the
-- commissioner edits later.
update public.season_calendar
set lock_confirmed=true
where phase='playoff'
  and suggested_lock_at is not null;

