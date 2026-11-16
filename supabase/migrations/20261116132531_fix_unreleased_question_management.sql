-- Commissioner setup is allowed before release. Player submission eligibility
-- remains governed by week_is_open, which correctly requires a released batch.
do $$
declare
  target regprocedure;
  definition text;
  old_guard text := 'if not private.week_is_open(q.week_id) then';
  new_guard text := 'if not exists (select 1 from public.weeks w where w.id = q.week_id and w.status = ''draft'' and w.auto_locked_at is null and clock_timestamp() < w.lock_at) then';
begin
  foreach target in array array[
    'public.commissioner_delete_question(uuid,boolean)'::regprocedure,
    'public.commissioner_update_question(uuid,text,text,jsonb,boolean)'::regprocedure,
    'public.commissioner_move_question(uuid,integer)'::regprocedure
  ] loop
    definition := pg_get_functiondef(target);
    if position(old_guard in definition) = 0 then
      raise exception 'Expected question eligibility guard missing in %', target;
    end if;
    execute replace(definition, old_guard, new_guard);
  end loop;
end;
$$;
