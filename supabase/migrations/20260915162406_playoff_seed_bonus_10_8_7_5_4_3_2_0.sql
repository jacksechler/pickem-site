create or replace function private.playoff_start_bonus(seed_value integer)
returns integer
language sql
immutable
set search_path=''
as $$
  select case seed_value
    when 1 then 10
    when 2 then 8
    when 3 then 7
    when 4 then 5
    when 5 then 4
    when 6 then 3
    when 7 then 2
    when 8 then 0
    else null
  end;
$$;
