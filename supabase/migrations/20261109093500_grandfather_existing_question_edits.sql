-- Existing live weeks may already have player submissions and may still need editing.
-- Enforce the all-at-once freeze only for weeks created after this rollout.
alter table public.weeks
  add column batch_release_enforced boolean not null default true;

update public.weeks set batch_release_enforced = false;

create or replace function private.guard_question_batch_insert()
returns trigger language plpgsql
set search_path = ''
as $$
declare released_at timestamptz;
declare strict_batch boolean;
begin
  select w.questions_released_at, w.batch_release_enforced
    into released_at, strict_batch
  from public.weeks w
  where w.id = new.week_id
  for update;

  if strict_batch and released_at is not null then
    raise exception 'This week has already been released. New questions cannot be added.';
  end if;
  return new;
end;
$$;

comment on column public.weeks.batch_release_enforced is
  'True for newly created staged weeks: after the full batch is released, new question inserts are blocked. Existing active and archived weeks were grandfathered.';
