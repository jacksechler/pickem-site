alter table public.playoff_entries
  drop constraint if exists playoff_entries_starting_bonus_matches_seed;

alter table public.playoff_entries
  add constraint playoff_entries_starting_bonus_matches_seed
  check (
    starting_bonus = case seed
      when 1 then 10
      when 2 then 8
      when 3 then 7
      when 4 then 5
      when 5 then 4
      when 6 then 3
      when 7 then 2
      when 8 then 0
    end
  );

comment on column public.playoff_entries.starting_bonus is
  'One-time playoff starting bonus derived from regular-season seed: 10,8,7,5,4,3,2,0.';
