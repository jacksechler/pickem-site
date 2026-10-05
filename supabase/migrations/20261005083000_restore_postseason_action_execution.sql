-- public.postseason_action is an invoker wrapper around the protected
-- private function. The private function performs its own commissioner
-- authorization and must be executable by authenticated callers.
grant usage on schema private to authenticated;
revoke all on function private.postseason_action(text,jsonb) from public, anon;
grant execute on function private.postseason_action(text,jsonb) to authenticated;
