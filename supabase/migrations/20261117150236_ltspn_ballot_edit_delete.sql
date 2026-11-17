-- Members may revise their own existing ballot, including archived weeks.
drop policy own_active_ballot_update on public.ltspn_ballots;
create policy own_ballot_update on public.ltspn_ballots for update to authenticated
using (user_id=(select auth.uid()) and exists(select 1 from public.weeks w where w.id=week_id and w.questions_released_at is not null))
with check (user_id=(select auth.uid()) and exists(select 1 from public.weeks w where w.id=week_id and w.questions_released_at is not null));
grant delete on public.ltspn_ballots to authenticated;
create policy commissioner_delete_ballot on public.ltspn_ballots for delete to authenticated
using ((select private.is_commissioner()));
