-- Commissioner-only correction of an existing pick after a week locks but before publication.
create or replace function public.commissioner_override_locked_pick(
  p_week_id uuid,
  p_user_id uuid,
  p_question_id uuid,
  p_answer jsonb,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  w public.weeks;
  q public.questions;
  existing public.picks;
  player_name text;
  actor uuid := auth.uid();
  reason_text text := trim(coalesce(p_reason,''));
begin
  if actor is null or not private.is_commissioner() then
    raise exception 'Commissioner access required.' using errcode='42501';
  end if;

  select * into w from public.weeks where id=p_week_id for update;
  if not found then raise exception 'Week not found.'; end if;
  if now() < w.lock_at then raise exception 'This week is not locked yet.'; end if;
  if w.status = 'published' then raise exception 'Published weeks cannot use the post-lock pick editor.'; end if;
  if w.status <> 'draft' then raise exception 'This week is not editable.'; end if;
  if length(reason_text) < 3 then raise exception 'Add a short reason for the post-lock change.'; end if;

  select * into q from public.questions where id=p_question_id and week_id=p_week_id;
  if not found then raise exception 'Question not found for this week.'; end if;
  if not exists (
    select 1 from jsonb_array_elements(q.answer_options) as option_value(value)
    where option_value.value = p_answer
  ) then
    raise exception 'The replacement answer is not a valid option for this question.';
  end if;

  select * into existing
  from public.picks
  where week_id=p_week_id and question_id=p_question_id and user_id=p_user_id
  for update;
  if not found then raise exception 'That player does not have an existing pick for this question.'; end if;
  if existing.answer = p_answer then raise exception 'That is already the player''s current pick.'; end if;

  select display_name into player_name from public.profiles where id=p_user_id;
  if player_name is null then raise exception 'Player not found.'; end if;

  update public.picks
  set answer=p_answer, updated_at=now()
  where id=existing.id;

  insert into public.commissioner_activity_log(actor_id,week_id,action_type,summary,details)
  values(
    actor,
    p_week_id,
    'post_lock_pick_override',
    'Post-lock pick changed for '||player_name,
    jsonb_build_object(
      'player_id',p_user_id,
      'player_name',player_name,
      'question_id',p_question_id,
      'question',q.prompt,
      'old_answer',existing.answer,
      'new_answer',p_answer,
      'reason',reason_text,
      'changed_at',now()
    )
  );

  return jsonb_build_object(
    'ok',true,
    'player_id',p_user_id,
    'question_id',p_question_id,
    'old_answer',existing.answer,
    'new_answer',p_answer
  );
end;
$$;

revoke all on function public.commissioner_override_locked_pick(uuid,uuid,uuid,jsonb,text) from public, anon;
grant execute on function public.commissioner_override_locked_pick(uuid,uuid,uuid,jsonb,text) to authenticated;
