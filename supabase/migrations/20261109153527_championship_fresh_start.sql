-- Rounds 1-3 remain cumulative. Qualifying finalists begin a fresh one-week final.
-- Keep seed bonuses, all playoff correct counts, and earlier round results intact.
begin;
do $$ begin
  if exists(select 1 from public.playoff_rounds where round_number=4) then
    raise exception 'Review existing championship results before changing the finals scoring rule.';
  end if;
end $$;
alter table public.playoff_entries
  add column championship_offset numeric not null default 0 check(championship_offset>=0);
alter table public.playoff_entries alter column current_total
  set expression as (starting_bonus + playoff_points - championship_offset);

-- Derive the reset from official semifinal qualification, rather than a mutable
-- client flag. Rebuilds remove the old results first, so they also undo the reset.
create function private.playoff_championship_offset() returns trigger
language plpgsql set search_path='' as $$
begin
  new.championship_offset:=0;
  if exists(
    select 1 from public.playoff_round_results rr
    join public.playoff_rounds r on r.id=rr.round_id
    where r.season_id=new.season_id and r.round_number=3
      and rr.user_id=new.user_id and rr.advanced
  ) then
    select new.starting_bonus + coalesce(sum(rr.round_correct),0)
      into new.championship_offset
    from public.playoff_round_results rr
    join public.playoff_rounds r on r.id=rr.round_id
    where r.season_id=new.season_id and r.round_number<=3 and rr.user_id=new.user_id;
  end if;
  return new;
end $$;
revoke all on function private.playoff_championship_offset() from public,anon,authenticated;
create trigger playoff_championship_offset
before insert or update on public.playoff_entries
for each row execute function private.playoff_championship_offset();
-- Also covers a semifinal already finalized before this migration.
update public.playoff_entries set updated_at=updated_at;
comment on column public.playoff_entries.championship_offset is
  'Seed bonus plus rounds 1-3 correct picks for official finalists; subtracted so finals start at zero. Earlier results remain in round history.';
commit;
