create table public.live_score_cache (
source_page text primary key,
league text not null check (league in ('nfl','college-football','mens-college-basketball')),
games jsonb not null default '[]'::jsonb check (jsonb_typeof(games)='array'),
fetched_at timestamptz,
next_attempt_at timestamptz not null default '1970-01-01 00:00:00+00',
failure_count integer not null default 0 check (failure_count between 0 and 10)
);
alter table public.live_score_cache enable row level security;
revoke all on public.live_score_cache from public,anon,authenticated;
grant select,insert,update,delete on public.live_score_cache to service_role;
comment on table public.live_score_cache is 'Server-only cache of public CBS game facts. Never stores league picks or official results.';
