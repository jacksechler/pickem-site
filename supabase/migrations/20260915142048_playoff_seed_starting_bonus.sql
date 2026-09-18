alter table public.playoff_entries rename column regular_season_points to starting_bonus;

alter table public.playoff_entries
  add column regular_season_points numeric;

update public.playoff_entries
set regular_season_points = starting_bonus,
    starting_bonus = case seed
      when 1 then 8
      when 2 then 6
      when 3 then 5
      when 4 then 4
      when 5 then 3
      when 6 then 2
      when 7 then 1
      when 8 then 0
    end;

alter table public.playoff_entries
  alter column regular_season_points set not null;

alter table public.playoff_entries
  add constraint playoff_entries_starting_bonus_matches_seed
  check (
    starting_bonus = case seed
      when 1 then 8
      when 2 then 6
      when 3 then 5
      when 4 then 4
      when 5 then 3
      when 6 then 2
      when 7 then 1
      when 8 then 0
    end
  );

comment on column public.playoff_entries.starting_bonus is
  'One-time playoff starting bonus derived from regular-season seed.';
comment on column public.playoff_entries.regular_season_points is
  'Frozen raw regular-season point total retained for history and display; it does not carry into playoff scoring.';

create or replace function private.playoff_start_bonus(seed_value integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case seed_value
    when 1 then 8
    when 2 then 6
    when 3 then 5
    when 4 then 4
    when 5 then 3
    when 6 then 2
    when 7 then 1
    when 8 then 0
    else null
  end;
$$;

create or replace function private.set_playoff_starting_bonus()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.starting_bonus := private.playoff_start_bonus(new.seed);
  if new.starting_bonus is null then
    raise exception 'Playoff seed must be between 1 and 8.';
  end if;
  return new;
end;
$$;

drop trigger if exists playoff_entries_seed_bonus on public.playoff_entries;
create trigger playoff_entries_seed_bonus
before insert or update of seed on public.playoff_entries
for each row execute function private.set_playoff_starting_bonus();

create or replace function private.playoff_seed_preview(sid uuid)
returns jsonb
language sql
stable security definer
set search_path=''
as $$
 with last_week as (
   select id,tiebreaker_result
   from public.weeks
   where season_id=sid and phase='regular' and status='published'
   order by number desc
   limit 1
 ),
 totals as (
   select r.user_id,p.display_name,
     coalesce(sum(sc.total_points),0) points,
     coalesce(sum(sc.correct_count),0)::integer correct,
     count(*) filter(where sc.placement=1)::integer wins,
     (select case
        when private.playoff_number_ok(s.tiebreaker_answer) and private.playoff_number_ok(w.tiebreaker_result)
        then abs(s.tiebreaker_answer-w.tiebreaker_result)
      end
      from last_week w
      left join public.submissions s on s.week_id=w.id and s.user_id=r.user_id) distance
   from private.playoff_roster() r
   join public.profiles p on p.id=r.user_id
   left join public.week_scores sc on sc.user_id=r.user_id
     and sc.week_id in (
       select id from public.weeks
       where season_id=sid and phase='regular' and status='published'
     )
   group by r.user_id,p.display_name
 ),
 ranked as (
   select *,
     row_number() over(order by points desc,correct desc,wins desc,distance asc nulls last,user_id)::integer seed
   from totals
 )
 select coalesce(
   jsonb_agg(
     to_jsonb(ranked) || jsonb_build_object('starting_bonus',private.playoff_start_bonus(seed))
     order by seed
   ),
   '[]'::jsonb
 )
 from ranked;
$$;
