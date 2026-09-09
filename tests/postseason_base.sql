-- Minimal isolated replica of the existing schema and authorization policies.
-- This fixture is only used in the local WASM PostgreSQL test database.
create role anon; create role authenticated;
create schema auth; create schema private;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema public,auth,private to authenticated;
grant execute on function auth.uid() to authenticated;
create type public.user_role as enum('player','commissioner');
create type public.week_status as enum('draft','published');
create table public.seasons(id uuid primary key default gen_random_uuid(),year integer not null,name text not null,created_at timestamptz default now());
create table public.profiles(id uuid primary key default gen_random_uuid(),username text not null,display_name text not null,role public.user_role not null default 'player');
create table public.player_slots(slot smallint primary key,display_name text,username text,claimed_by uuid references public.profiles(id));
create table public.weeks(id uuid primary key default gen_random_uuid(),season_id uuid not null references public.seasons(id),number integer not null,name text not null,lock_at timestamptz not null,status public.week_status not null default 'draft',is_active boolean not null default false,tiebreaker_prompt text not null default 'Total?',tiebreaker_result numeric,published_at timestamptz,created_at timestamptz default now(),auto_locked_at timestamptz,unique(season_id,number));
create table public.questions(id uuid primary key default gen_random_uuid(),week_id uuid not null references public.weeks(id) on delete cascade,position integer not null,sport text not null,question_type text not null,prompt text not null,answer_options jsonb not null default '[]',counts_for_score boolean not null default true,result jsonb,result_order integer,result_entered_at timestamptz,unique(week_id,position));
create table public.picks(id uuid primary key default gen_random_uuid(),week_id uuid not null references public.weeks(id) on delete cascade,question_id uuid not null references public.questions(id) on delete cascade,user_id uuid not null references public.profiles(id),answer jsonb not null,updated_at timestamptz default now(),unique(week_id,question_id,user_id));
create table public.submissions(week_id uuid not null references public.weeks(id) on delete cascade,user_id uuid not null references public.profiles(id),tiebreaker_answer numeric,submitted_at timestamptz default now(),primary key(week_id,user_id));
create table public.week_scores(week_id uuid not null references public.weeks(id) on delete cascade,user_id uuid not null references public.profiles(id),placement integer not null,correct_count integer not null,question_count integer not null,pick_percentage numeric not null,placement_points numeric not null,perfect_bonus numeric not null default 0,unicorn_bonus numeric not null default 0,upset_bonus numeric not null default 0,streak_bonus numeric not null default 0,cold_bonus numeric not null default 0,total_points numeric not null,unicorn_count integer not null default 0,upset_count integer not null default 0,opening_streak integer not null default 0,tiebreaker_answer numeric,primary key(week_id,user_id));
create table public.commissioner_activity_log(id uuid primary key default gen_random_uuid(),actor_id uuid not null,week_id uuid references public.weeks(id) on delete set null,action_type text not null,summary text not null,details jsonb default '{}',created_at timestamptz default now());
create function private.is_commissioner() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='commissioner') $$;
create function private.week_is_open(wid uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.weeks where id=wid and status='draft' and now()<lock_at) $$;
grant all on all tables in schema public to authenticated;
do $$ declare t text; begin
 foreach t in array array['weeks','questions','profiles','seasons','week_scores','player_slots','commissioner_activity_log'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy read_league on public.%I for select to authenticated using(true)',t);
  execute format('create policy write_commissioner on public.%I for all to authenticated using(private.is_commissioner()) with check(private.is_commissioner())',t);
 end loop;
 foreach t in array array['picks','submissions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy read_picks on public.%I for select to authenticated using(user_id=auth.uid() or exists(select 1 from public.weeks w where w.id=week_id and (w.status=''published'' or w.lock_at<=now())))',t);
  execute format('create policy insert_pick on public.%I for insert to authenticated with check(user_id=auth.uid() and private.week_is_open(week_id))',t);
  execute format('create policy update_pick on public.%I for update to authenticated using(user_id=auth.uid() and private.week_is_open(week_id)) with check(user_id=auth.uid() and private.week_is_open(week_id))',t);
 end loop;
end $$;
