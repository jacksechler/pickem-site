-- Planned setup dates describe the season calendar, not commissioner availability.
-- Replace only the two setup-date gates. Preserve completion, deadline, member,
-- commissioner, transaction, and postseason activation checks and all saved data.
do $migration$
declare
 definition text := pg_get_functiondef('private.postseason_action(text,jsonb)'::regprocedure);
 gate text;
begin
 foreach gate in array array[
  $gate$if now()<(cal.setup_date+time '08:00') at time zone 'America/New_York' then raise exception 'This round opens for setup on its scheduled Tuesday.'; end if;$gate$,
  $gate$if now()<(cal.setup_date+time '08:00') at time zone 'America/New_York' then raise exception 'The next card opens for setup on Tuesday morning.'; end if;$gate$
 ] loop
  if strpos(definition,gate)=0 then
   raise exception 'Week creation changed since this migration was prepared; review the current function.';
  end if;
  definition:=replace(definition,gate,'-- Setup date is informational; completion and future-lock checks control creation.');
 end loop;
 execute definition;
end $migration$;
