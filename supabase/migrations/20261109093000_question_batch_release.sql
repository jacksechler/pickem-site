-- New weeks stay invisible to players until the commissioner releases the complete card.
-- Grandfather existing weeks, including the live Week 12 with submissions, so no picks are disrupted.
alter table public.weeks
  add column if not exists questions_released_at timestamptz;

update public.weeks
set questions_released_at = coalesce(published_at, now())
where questions_released_at is null;

comment on column public.weeks.questions_released_at is
  'Null until the commissioner releases the complete question card. Existing weeks were grandfathered during rollout.';

-- The week itself and its tiebreaker are hidden from members while in preparation.
drop policy if exists "authenticated read weeks" on public.weeks;
drop policy if exists read_league on public.weeks;
create policy "authenticated read weeks"
on public.weeks for select to authenticated
using (private.is_commissioner() or questions_released_at is not null);

-- Guard question content at the database level, not just in the browser.
drop policy if exists "authenticated read questions" on public.questions;
drop policy if exists read_league on public.questions;
create policy "authenticated read questions"
on public.questions for select to authenticated
using (
  private.is_commissioner()
  or exists (
    select 1 from public.weeks w
    where w.id = questions.week_id
      and w.questions_released_at is not null
  )
);

-- No pick or submission can be written while a card is still being assembled.
create or replace function private.week_is_open(target_week uuid)
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.weeks
    where id = target_week
      and status = 'draft'
      and questions_released_at is not null
      and now() < lock_at
  );
$$;

-- Once a batch is released, don't allow newly added questions to trickle out one by one.
create or replace function private.guard_question_batch_insert()
returns trigger language plpgsql
set search_path = ''
as $$
declare released_at timestamptz;
begin
  select w.questions_released_at into released_at
  from public.weeks w
  where w.id = new.week_id
  for update;
  if released_at is not null then
    raise exception 'This week has already been released. New questions cannot be added.';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_question_batch_insert on public.questions;
create trigger guard_question_batch_insert
before insert on public.questions
for each row execute function private.guard_question_batch_insert();

-- Keep releases irreversible and validate even if a commissioner updates the week directly.
create or replace function private.guard_question_release()
returns trigger language plpgsql
set search_path = ''
as $$
declare invalid_count integer;
declare question_count integer;
begin
  if old.questions_released_at is not null
     and new.questions_released_at is distinct from old.questions_released_at then
    raise exception 'This question batch has already been released and cannot be hidden again.';
  end if;
  if old.questions_released_at is null and new.questions_released_at is not null then
    if new.status <> 'draft' or not new.is_active or new.lock_at <= clock_timestamp() then
      raise exception 'Release an active, unlocked draft week with a future deadline.';
    end if;
    if nullif(btrim(new.tiebreaker_prompt), '') is null then
      raise exception 'Add a tiebreaker question before releasing the week.';
    end if;
    select count(*),
      count(*) filter (
        where nullif(btrim(q.prompt),'') is null
           or jsonb_typeof(q.answer_options) is distinct from 'array'
           or jsonb_array_length(q.answer_options) < 2
      )
    into question_count,invalid_count
    from public.questions q where q.week_id = new.id;
    if question_count = 0 then
      raise exception 'Add at least one question before releasing the week.';
    end if;
    if invalid_count > 0 then
      raise exception 'Finish every question and provide at least two choices before releasing.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_question_release on public.weeks;
create trigger guard_question_release
before update of questions_released_at on public.weeks
for each row execute function private.guard_question_release();

-- Explicit one-click release, atomic for all questions in the card.
create or replace function public.commissioner_release_week_questions(p_week_id uuid)
returns jsonb
language plpgsql security invoker
set search_path = ''
as $$
declare w public.weeks%rowtype;
declare count_questions integer;
begin
  if auth.uid() is null or not private.is_commissioner() then
    raise exception 'Commissioner access required.' using errcode = '42501';
  end if;

  select * into w from public.weeks
  where id = p_week_id for update;
  if not found then raise exception 'Week not found.'; end if;

  if w.questions_released_at is not null then
    raise exception 'These questions have already been released.';
  end if;

  -- The release trigger validates the deadline, tiebreaker and every question.
  update public.weeks
  set questions_released_at = now()
  where id = p_week_id;

  select count(*) into count_questions
  from public.questions where week_id = p_week_id;

  return jsonb_build_object(
    'week_id', p_week_id,
    'questions', count_questions,
    'released', true,
    'released_at', (select questions_released_at from public.weeks where id = p_week_id)
  );
end;
$$;

revoke all on function public.commissioner_release_week_questions(uuid) from public;
revoke all on function public.commissioner_release_week_questions(uuid) from anon;
grant execute on function public.commissioner_release_week_questions(uuid) to authenticated;
