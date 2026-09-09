-- Postseason release: installs an inactive 2026 schedule. It does not start playoffs.
-- Apply as one Supabase migration. All competitive writes use commissioner RPCs.
alter table public.weeks add column phase text not null default 'regular' check (phase in ('regular','playoff'));
alter table public.weeks add column playoff_round integer check (playoff_round between 1 and 4);
alter table public.weeks add column playoff_label text;
alter table public.weeks add constraint weeks_phase_round check ((phase='regular' and playoff_round is null) or (phase='playoff' and playoff_round is not null));
create unique index weeks_playoff_round_unique on public.weeks(season_id,playoff_round) where phase='playoff';

create table public.postseason_seasons (
  season_id uuid primary key references public.seasons(id),
  status text not null default 'scheduled' check (status in ('scheduled','live','complete')),
  regular_week_count integer not null default 20,
  regular_season_end date not null,
  start_not_before timestamptz not null,
  championship_date date not null,
  frozen_at timestamptz,
  champion_id uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
create table public.season_calendar (
  season_id uuid not null references public.seasons(id),
  slot integer not null,
  week_number integer,
  phase text not null check (phase in ('regular','playoff','break')),
  round_number integer check (round_number between 1 and 4),
  label text not null,
  setup_date date not null,
  starts_on date not null,
  ends_on date not null,
  suggested_lock_at timestamptz,
  lock_confirmed boolean not null default false,
  sports text[] not null default '{}',
  notes text not null default '',
  source_url text,
  primary key(season_id,slot), unique(season_id,week_number), unique(season_id,round_number),
  check (setup_date <= starts_on and starts_on <= ends_on)
);
create table public.playoff_entries (
  season_id uuid not null references public.postseason_seasons(season_id),
  user_id uuid not null references public.profiles(id),
  seed integer not null check(seed between 1 and 8),
  regular_season_points numeric not null,
  regular_correct integer not null default 0,
  regular_wins integer not null default 0,
  playoff_points integer not null default 0 check(playoff_points>=0),
  current_total numeric generated always as (regular_season_points+playoff_points) stored,
  status text not null default 'active' check(status in ('active','eliminated','champion','runner_up')),
  eliminated_round integer,
  eliminated_week_id uuid references public.weeks(id) on delete set null,
  eliminated_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(season_id,user_id), unique(season_id,seed)
);
create table public.playoff_rounds (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.postseason_seasons(season_id),
  week_id uuid not null unique references public.weeks(id) on delete cascade,
  round_number integer not null check(round_number between 1 and 4), label text not null,
  participants_before integer not null, participants_after integer not null,
  status text not null default 'live' check(status in ('live','finalized')),
  finalized_at timestamptz, created_at timestamptz not null default now(),
  unique(season_id,round_number),
  check ((round_number,participants_before,participants_after) in ((1,8,6),(2,6,4),(3,4,2),(4,2,1)))
);
create table public.playoff_round_results (
  round_id uuid not null references public.playoff_rounds(id) on delete cascade,
  user_id uuid not null references public.profiles(id), seed integer not null,
  cumulative_before numeric not null, round_correct integer not null,
  round_tiebreaker_answer numeric, round_tiebreaker_distance numeric,
  cumulative_after numeric not null, round_rank integer not null,
  advanced boolean not null, status_after text not null,
  created_at timestamptz not null default now(), primary key(round_id,user_id),
  check(cumulative_after=cumulative_before+round_correct), unique(round_id,round_rank)
);
create table private.playoff_rebuild_audit (
  id uuid primary key default gen_random_uuid(), season_id uuid not null,
  actor_id uuid not null, action text not null, snapshot jsonb not null,
  created_at timestamptz not null default now()
);
alter table private.playoff_rebuild_audit enable row level security;
revoke all on private.playoff_rebuild_audit from public,anon,authenticated;
do $$ declare t text; begin
  foreach t in array array['postseason_seasons','season_calendar','playoff_entries','playoff_rounds','playoff_round_results'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy league_read on public.%I for select to authenticated using (exists(select 1 from public.profiles where id=(select auth.uid())))',t);
  end loop;
end $$;

-- This is the proposed calendar, not a batch of active weeks. Existing lock times win.
insert into public.postseason_seasons(season_id,regular_season_end,start_not_before,championship_date)
select id,'2027-01-11','2027-01-12 08:00 America/New_York','2027-02-14' from public.seasons where year=2026;
insert into public.season_calendar(season_id,slot,week_number,phase,label,setup_date,starts_on,ends_on,suggested_lock_at,sports,notes,source_url)
select s.id,n,n,'regular','Week '||n,
  date '2026-08-25'+7*(n-1),date '2026-08-27'+7*(n-1),date '2026-08-31'+7*(n-1),
  (date '2026-08-27'+7*(n-1)+time '20:15') at time zone 'America/New_York',
  (case when n<=2 then array['CFB'] when n<10 then array['NFL','CFB'] when n<17 then array['NFL','CFB','CBB'] else array['NFL','CBB','Bowls','CFP'] end),
  'Tuesday setup; Thursday lock through Monday night. Include only games beginning after lock and ending within this card. Review kickoff times when choosing questions.',
  'https://www.nfl.com/schedules/2026'
from public.seasons s cross join generate_series(1,20) n where s.year=2026;
update public.season_calendar c set suggested_lock_at=w.lock_at,lock_confirmed=true,
  starts_on=least(c.starts_on,(w.lock_at at time zone 'America/New_York')::date),
  notes=case when w.number=3 then 'Existing Wednesday NFL opener lock is preserved. Regular weekly cadence resumes with Week 4.' else 'Existing league week and lock are preserved.' end
from public.weeks w where w.season_id=c.season_id and w.number=c.week_number and c.phase='regular';
update public.season_calendar set notes=notes||' College basketball opening games on Monday, November 2 can join this card.' where week_number=10;
update public.season_calendar set suggested_lock_at='2026-11-26 13:00 America/New_York',lock_confirmed=false,
  notes='Thanksgiving exception: review the first Thursday game, not the evening TNF game. Wednesday NFL and earlier CFB/CBB games are outside the proposed lock; leave them off unless you explicitly confirm an earlier exception.' where week_number=14;
update public.season_calendar set notes=notes||' Conference championship weekend; continue regular-season scoring.' where week_number=15;
update public.season_calendar set sports=array['NFL','CFB','CBB','Bowls'],notes=notes||' Bowl season begins; choose bowls within the locked Thursday–Monday window.' where week_number=16;
update public.season_calendar set notes=notes||' CFP first round: December 18–19.' where week_number=17;
update public.season_calendar set notes=notes||' Christmas games and bowls; check afternoon start times.' where week_number=18;
update public.season_calendar set suggested_lock_at='2026-12-30 19:30 America/New_York',starts_on='2026-12-30',
  notes='Proposed CFP exception: Wednesday December 30, 7:30 p.m. ET lock includes the Fiesta Bowl quarterfinal and January 1 quarterfinals. Confirm this exception before opening the card; the normal TNF lock would miss Fiesta.',
  source_url='https://collegefootballplayoff.com/news/2026/6/1/26-27-broadcast-sked' where week_number=19;
update public.season_calendar set sports=array['NFL','CBB'],notes='Final regular-season card: NFL Week 18 is January 9–10, with no TNF or MNF. Keep the Thursday–Monday window for CBB; confirm the lock against your selected games. Finalize on Tuesday January 12 before freezing seeds.' where week_number=20;
insert into public.season_calendar(season_id,slot,week_number,phase,round_number,label,setup_date,starts_on,ends_on,suggested_lock_at,sports,notes,source_url)
select s.id,v.slot,v.week_number,v.phase,v.round_number,v.label,v.setup_date::date,v.starts_on::date,v.ends_on::date,v.lock_at::timestamptz,v.sports,v.notes,v.source
from public.seasons s cross join (values
  (21,21,'playoff',1,'Wild Card','2027-01-12','2027-01-14','2027-01-18','2027-01-14 19:30 America/New_York',array['NFL','CFP','CBB'],'8 → 6. NFL Wild Card January 16–18; CFP semifinals January 14–15. Proposed Thursday lock is 7:30 p.m. ET before the first semifinal. Start playoffs manually during Tuesday setup.','https://collegefootballplayoff.com/news/2026/6/1/26-27-broadcast-sked'),
  (22,22,'playoff',2,'Divisional','2027-01-19','2027-01-21','2027-01-25','2027-01-21 20:15 America/New_York',array['NFL','CFP','CBB'],'6 → 4. NFL Divisional January 23–24; CFP championship Monday January 25 at 7:30 p.m. ET. No TNF: confirm Thursday lock against the CBB games selected.','https://collegefootballplayoff.com/news/2026/6/1/26-27-broadcast-sked'),
  (23,23,'playoff',3,'Conference Championship','2027-01-26','2027-01-28','2027-02-01','2027-01-28 20:15 America/New_York',array['NFL','CBB'],'4 → 2. NFL conference championships January 31. No TNF: confirm Thursday lock against the CBB games selected.','https://www.nfl.com/news/2026-27-national-football-league-important-dates'),
  (24,null,'break',null,'Championship break','2027-02-02','2027-02-04','2027-02-08',null,array[]::text[],'No championship points or elimination this week. Prepare the final card; do not add an extra playoff round.','https://www.nfl.com/news/2026-27-national-football-league-important-dates'),
  (25,24,'playoff',4,'Super Bowl Championship','2027-02-09','2027-02-11','2027-02-14','2027-02-11 20:15 America/New_York',array['NFL','CBB'],'2 → 1. Super Bowl Sunday February 14 is the finish: no Monday games on this card. Plan 15–25 scored questions. No TNF: confirm Thursday lock against selected CBB games.','https://www.nfl.com/news/2026-27-national-football-league-important-dates')
) v(slot,week_number,phase,round_number,label,setup_date,starts_on,ends_on,lock_at,sports,notes,source) where s.year=2026;

create function private.playoff_number_ok(v numeric) returns boolean language sql immutable set search_path='' as $$
 select v is not null and v::text not in ('NaN','Infinity','-Infinity');
$$;
create function private.playoff_require_member() returns void language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid()) then raise exception 'Sign in to a league account.' using errcode='42501'; end if;
end $$;
create function private.playoff_roster() returns table(user_id uuid) language sql stable security definer set search_path='' as $$
 select id from public.profiles where role='commissioner'
 union select claimed_by from public.player_slots where claimed_by is not null;
$$;
create function private.playoff_seed_preview(sid uuid) returns jsonb language sql stable security definer set search_path='' as $$
 with last_week as (select id,tiebreaker_result from public.weeks where season_id=sid and phase='regular' and status='published' order by number desc limit 1),
 totals as (
 select r.user_id,p.display_name,coalesce(sum(sc.total_points),0) points,coalesce(sum(sc.correct_count),0)::integer correct,
 count(*) filter(where sc.placement=1)::integer wins,
 (select case when private.playoff_number_ok(s.tiebreaker_answer) and private.playoff_number_ok(w.tiebreaker_result) then abs(s.tiebreaker_answer-w.tiebreaker_result) end from last_week w left join public.submissions s on s.week_id=w.id and s.user_id=r.user_id) distance
 from private.playoff_roster() r join public.profiles p on p.id=r.user_id
 left join public.week_scores sc on sc.user_id=r.user_id and sc.week_id in (select id from public.weeks where season_id=sid and phase='regular' and status='published')
 group by r.user_id,p.display_name), ranked as (
 select *,row_number() over(order by points desc,correct desc,wins desc,distance asc nulls last,user_id)::integer seed from totals)
 select coalesce(jsonb_agg(to_jsonb(ranked) order by seed),'[]') from ranked;
$$;

-- One comparator handles all ties. Before the actual tiebreaker, equal totals stay tied.
create function private.playoff_projection(rid uuid,overrides jsonb default null,actual_override numeric default null,override_actual boolean default false,final_order boolean default false)
returns jsonb language sql stable security definer set search_path='' as $$
 with r as (select * from public.playoff_rounds where id=rid),
 w as (select w.*,case when override_actual then actual_override else w.tiebreaker_result end actual from public.weeks w join r on r.week_id=w.id),
 candidates as (
 select e.*,p.display_name,case when r.status='finalized' then rr.cumulative_before else e.current_total end before_total
 from r join public.playoff_entries e on e.season_id=r.season_id join public.profiles p on p.id=e.user_id
 left join public.playoff_round_results rr on rr.round_id=r.id and rr.user_id=e.user_id
 where (r.status='finalized' and rr.user_id is not null) or (r.status<>'finalized' and e.status='active')),
 computed as (
 select c.*,case when w.lock_at<=now() or w.status='published' then s.tiebreaker_answer end tiebreaker_answer,
 case when (w.lock_at<=now() or w.status='published') and private.playoff_number_ok(w.actual) and private.playoff_number_ok(s.tiebreaker_answer) then abs(s.tiebreaker_answer-w.actual) end distance,
 (select count(*)::integer from public.questions q join public.picks p on p.question_id=q.id and p.week_id=q.week_id and p.user_id=c.user_id
 where q.week_id=w.id and q.counts_for_score and s.user_id is not null and (w.lock_at<=now() or w.status='published')
 and p.answer=case when overrides ? q.id::text then overrides->q.id::text else q.result end
 and case when overrides ? q.id::text then overrides->q.id::text else q.result end <> 'null'::jsonb) correct,
 private.playoff_number_ok(w.actual) or final_order ordered
 from candidates c cross join w left join public.submissions s on s.week_id=w.id and s.user_id=c.user_id),
 totals as (select *,before_total+correct total from computed),
 ranked as (
 select *,row_number() over(order by total desc,case when ordered then distance end asc nulls last,case when ordered then seed end asc,user_id)::integer sort_index,
 rank() over(order by total desc)::integer tied_rank,count(*) over(partition by total)::integer tie_size from totals),
 output as (select user_id,display_name,seed,regular_season_points,before_total cumulative_before,correct round_correct,total cumulative_after,tiebreaker_answer round_tiebreaker_answer,distance round_tiebreaker_distance,
 case when ordered then sort_index else tied_rank end round_rank,sort_index,
 (not ordered and tie_size>1) tied,
 (not ordered and tied_rank<=(select participants_after from r) and tied_rank+tie_size-1>(select participants_after from r)) cut_tie,
 case when not ordered and tied_rank<=(select participants_after from r) and tied_rank+tie_size-1>(select participants_after from r) then 'tiebreaker_pending'
 when sort_index<=(select participants_after from r) then 'projected_advance' else 'projected_out' end projected_status
 from ranked)
 select coalesce(jsonb_agg(to_jsonb(output) order by sort_index),'[]') from output;
$$;

create function private.playoff_round_state(wid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.playoff_rounds; w public.weeks; rows jsonb; revision text; total integer; decided integer; submitted integer; fun integer;
begin
 select * into r from public.playoff_rounds where week_id=wid;
 if not found then return null; end if;
 select * into w from public.weeks where id=wid;
 select count(*) filter(where counts_for_score),count(*) filter(where counts_for_score and result is not null and result<>'null'::jsonb) into total,decided from public.questions where week_id=wid;
 if r.status='finalized' then
   select coalesce(jsonb_agg(to_jsonb(rr)||jsonb_build_object('display_name',p.display_name,'sort_index',rr.round_rank) order by rr.round_rank),'[]') into rows from public.playoff_round_results rr join public.profiles p on p.id=rr.user_id where round_id=r.id;
 else rows:=private.playoff_projection(r.id); end if;
 select count(*) filter(where exists(select 1 from jsonb_array_elements(rows) entry where entry->>'user_id'=s.user_id::text)),count(*) filter(where not exists(select 1 from jsonb_array_elements(rows) entry where entry->>'user_id'=s.user_id::text)) into submitted,fun from public.submissions s join public.playoff_entries e on e.user_id=s.user_id and e.season_id=r.season_id where s.week_id=wid;
 select md5(jsonb_build_object('week',to_jsonb(w),'round',to_jsonb(r),'rows',rows,
 'questions',(select jsonb_agg(to_jsonb(q) order by q.id) from public.questions q where week_id=wid),
 'picks',(select jsonb_agg(to_jsonb(p) order by p.user_id,p.question_id) from public.picks p where week_id=wid),
 'submissions',(select jsonb_agg(to_jsonb(s) order by s.user_id) from public.submissions s where week_id=wid))::text) into revision;
 return jsonb_build_object('round',to_jsonb(r),'week',to_jsonb(w),'rows',rows,'revision',revision,'question_count',total,'decided_count',decided,
 'submitted',submitted,'fun_submitted',fun,'locked',w.lock_at<=now() or w.status='published',
 'tiebreaker_pending',not private.playoff_number_ok(w.tiebreaker_result),
 'ready',total>0 and total=decided and private.playoff_number_ok(w.tiebreaker_result) and w.lock_at<=now());
end $$;
create function private.postseason_state(sid uuid,wid uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; chosen uuid;
begin
 perform private.playoff_require_member();
 if not exists(select 1 from public.postseason_seasons where season_id=sid) then return null; end if;
 if wid is not null and not exists(select 1 from public.weeks where id=wid and season_id=sid) then raise exception 'Week is outside this season.'; end if;
 chosen:=coalesce(wid,(select week_id from public.playoff_rounds where season_id=sid order by round_number desc limit 1));
 select jsonb_build_object('settings',to_jsonb(s),'calendar',(select coalesce(jsonb_agg(to_jsonb(c) order by slot),'[]') from public.season_calendar c where c.season_id=sid),
 'entries',(select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('display_name',p.display_name) order by seed),'[]') from public.playoff_entries e join public.profiles p on p.id=e.user_id where e.season_id=sid),
 'rounds',(select coalesce(jsonb_agg(to_jsonb(r) order by round_number),'[]') from public.playoff_rounds r where r.season_id=sid),
 'history',(select coalesce(jsonb_agg(to_jsonb(rr)||jsonb_build_object('round_number',r.round_number,'label',r.label,'display_name',p.display_name) order by r.round_number,rr.round_rank),'[]') from public.playoff_round_results rr join public.playoff_rounds r on r.id=rr.round_id join public.profiles p on p.id=rr.user_id where r.season_id=sid),
 'current',private.playoff_round_state(chosen),'server_time',now()) into result from public.postseason_seasons s where s.season_id=sid;
 return result;
end $$;

-- Mutations serialize on the season. Direct API writes cannot publish playoff scores.
create function private.playoff_write_guard() returns trigger language plpgsql set search_path='' as $$
declare wid uuid; sid uuid; w public.weeks; frozen boolean; owner_name text;
begin
 select pg_get_userbyid(c.relowner) into owner_name from pg_class c where c.oid=tg_relid;
 if current_user=owner_name and (auth.uid() is null or current_setting('app.postseason_write',true)='on') then if tg_op='DELETE' then return old; else return new; end if; end if;
 if tg_table_name='weeks' then
   if tg_op='DELETE' then w:=old; else w:=new; end if; sid:=w.season_id; wid:=w.id;
 else
   if tg_op='UPDATE' then
    if old.week_id is distinct from new.week_id then raise exception 'Entries and results cannot be moved between weeks.'; end if;
   end if;
   if tg_op='DELETE' then wid:=old.week_id; else wid:=new.week_id; end if;
   select * into w from public.weeks where id=wid; sid:=w.season_id;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(sid::text,0));
 -- RLS may have checked an open week before a concurrent submitter acquired the lock.
 if tg_table_name<>'weeks' then select * into w from public.weeks where id=wid; end if;
 if tg_table_name in ('picks','submissions') and tg_op in ('INSERT','UPDATE') and (w.status='published' or w.lock_at<=clock_timestamp()) then raise exception 'This week is locked.'; end if;
 select frozen_at is not null into frozen from public.postseason_seasons where season_id=sid;
 if w.phase='regular' and coalesce(frozen,false) then raise exception 'Regular-season standings are frozen. Reset playoffs explicitly before changing regular-season results.'; end if;
 if tg_table_name='weeks' then
  if tg_op='INSERT' and w.phase='regular' and exists(select 1 from public.postseason_seasons where season_id=sid) then raise exception 'Use the season calendar to create the next scheduled week.'; end if;
  if tg_op='UPDATE' then
   if old.phase<>new.phase or old.season_id<>new.season_id or old.playoff_round is distinct from new.playoff_round then raise exception 'Use the postseason controls to change a week phase.'; end if;
  end if;
 end if;
 if w.phase='playoff' then
   if tg_table_name='week_scores' then raise exception 'Use Finalize Round to save playoff scores.'; end if;
   if tg_table_name='weeks' and (tg_op<>'UPDATE') then raise exception 'Use the postseason controls to create or remove a round.'; end if;
   if tg_table_name='weeks' then
    if tg_op='UPDATE' then
     if new.status is distinct from old.status or new.published_at is distinct from old.published_at or new.number<>old.number or new.is_active is distinct from old.is_active then raise exception 'Use the postseason controls to finalize a round.'; end if;
    end if;
   end if;
   if exists(select 1 from public.playoff_rounds where week_id=wid and status='finalized') then raise exception 'This playoff round is final. Use the playoff correction preview.'; end if;
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
do $$ declare t text; begin
 foreach t in array array['weeks','questions','week_scores','picks','submissions'] loop
  execute format('create trigger postseason_write_guard before insert or update or delete on public.%I for each row execute function private.playoff_write_guard()',t);
 end loop;
end $$;

create or replace function private.auto_lock_week_if_full() returns trigger language plpgsql security definer set search_path='' as $$
declare w public.weeks; needed integer; submitted integer;
begin
 select * into w from public.weeks where id=new.week_id for update;
 if w.phase='playoff' then
   select count(*) into needed from public.playoff_entries where season_id=w.season_id and status='active';
   select count(*) into submitted from public.submissions s join public.playoff_entries e on e.user_id=s.user_id and e.season_id=w.season_id and e.status='active' where s.week_id=w.id;
 else needed:=8; select count(*) into submitted from public.submissions where week_id=w.id;
 end if;
 if needed>0 and submitted>=needed and w.status='draft' and w.lock_at>now() then
   update public.weeks set lock_at=now(),auto_locked_at=coalesce(auto_locked_at,now()) where id=w.id;
 end if;
 return new;
end $$;

create function private.playoff_finalize(wid uuid,expected text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.playoff_rounds; w public.weeks; snapshot jsonb; rows jsonb; item jsonb; next_status text;
begin
 select * into r from public.playoff_rounds where week_id=wid for update;
 if not found then raise exception 'Playoff round not found.'; end if;
 if r.status='finalized' then raise exception 'This round is already finalized.'; end if;
 select * into w from public.weeks where id=wid for update;
 snapshot:=private.playoff_round_state(wid);
 if expected is null or snapshot->>'revision'<>expected then raise exception 'Results changed after your preview. Calculate the standings again.'; end if;
 if not (snapshot->>'ready')::boolean then raise exception 'Lock the week, enter every scored result and save the actual tiebreaker first.'; end if;
 if (select count(*) from public.playoff_entries where season_id=r.season_id and status='active')<>r.participants_before then raise exception 'Active contender count does not match this round.'; end if;
 rows:=private.playoff_projection(r.id,null,null,false,true);
 for item in select value from jsonb_array_elements(rows) loop
   next_status:=case when (item->>'sort_index')::integer<=r.participants_after then case when r.round_number=4 then 'champion' else 'active' end else case when r.round_number=4 then 'runner_up' else 'eliminated' end end;
   insert into public.playoff_round_results(round_id,user_id,seed,cumulative_before,round_correct,round_tiebreaker_answer,round_tiebreaker_distance,cumulative_after,round_rank,advanced,status_after)
   values(r.id,(item->>'user_id')::uuid,(item->>'seed')::integer,(item->>'cumulative_before')::numeric,(item->>'round_correct')::integer,(item->>'round_tiebreaker_answer')::numeric,(item->>'round_tiebreaker_distance')::numeric,(item->>'cumulative_after')::numeric,(item->>'sort_index')::integer,(item->>'sort_index')::integer<=r.participants_after,next_status);
   update public.playoff_entries set playoff_points=playoff_points+(item->>'round_correct')::integer,status=next_status,
    eliminated_round=case when next_status in ('eliminated','runner_up') then r.round_number end,
    eliminated_week_id=case when next_status in ('eliminated','runner_up') then wid end,
    eliminated_at=case when next_status in ('eliminated','runner_up') then now() end,updated_at=now()
   where season_id=r.season_id and user_id=(item->>'user_id')::uuid;
 end loop;
 -- All eight may play for fun. Only the active entrants above affect the title race.
 insert into public.week_scores(week_id,user_id,placement,correct_count,question_count,pick_percentage,placement_points,perfect_bonus,unicorn_bonus,upset_bonus,streak_bonus,cold_bonus,total_points,unicorn_count,upset_count,opening_streak,tiebreaker_answer)
 select wid,user_id,row_number() over(order by correct desc,distance asc nulls last,seed)::integer,correct,total,case when total>0 then 100.0*correct/total else 0 end,0,0,0,0,0,0,correct,0,0,0,tiebreaker_answer from (
  select e.user_id,e.seed,s.tiebreaker_answer,
   case when private.playoff_number_ok(s.tiebreaker_answer) then abs(s.tiebreaker_answer-w.tiebreaker_result) end distance,
   (select count(*)::integer from public.questions q where q.week_id=wid and q.counts_for_score) total,
   (select count(*)::integer from public.questions q join public.picks p on p.question_id=q.id and p.week_id=wid and p.user_id=e.user_id where q.week_id=wid and q.counts_for_score and q.result=p.answer and q.result<>'null'::jsonb and s.user_id is not null) correct
  from public.playoff_entries e left join public.submissions s on s.week_id=wid and s.user_id=e.user_id where e.season_id=r.season_id
 ) scored;
 update public.playoff_rounds set status='finalized',finalized_at=now() where id=r.id;
 update public.weeks set status='published',published_at=now() where id=wid;
 if r.round_number=4 then update public.postseason_seasons set status='complete',champion_id=(select user_id from public.playoff_entries where season_id=r.season_id and status='champion'),updated_at=now() where season_id=r.season_id; end if;
 insert into public.commissioner_activity_log(actor_id,week_id,action_type,summary,details) values(auth.uid(),wid,'playoff_finalized',r.label||' finalized',jsonb_build_object('round',r.round_number,'advance',r.participants_after));
 return private.playoff_round_state(wid);
end $$;

create function private.postseason_action(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare sid uuid:=(payload->>'season_id')::uuid; wid uuid:=(payload->>'week_id')::uuid; settings public.postseason_seasons;
 cal public.season_calendar; r public.playoff_rounds; rows jsonb; item jsonb; result jsonb; revised jsonb; changes jsonb; actual numeric;
 next_round integer; before_count integer; after_count integer; n integer; lock_time timestamptz; later boolean; expected text; snapshot jsonb;
begin
 perform private.playoff_require_member();
 if not private.is_commissioner() then raise exception 'Commissioner access required.' using errcode='42501'; end if;
 perform set_config('app.postseason_write','on',true);
 if sid is null and wid is not null then select season_id into sid from public.weeks where id=wid; end if;
 if sid is null then raise exception 'Choose a season.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(sid::text,0));
 select * into settings from public.postseason_seasons where season_id=sid for update;
 if not found then raise exception 'No postseason calendar is configured for this season.'; end if;
 if wid is not null and not exists(select 1 from public.weeks where id=wid and season_id=sid) then raise exception 'Week is outside this season.'; end if;

 if action in ('preview_start','start') then
  if settings.status<>'scheduled' or exists(select 1 from public.playoff_entries where season_id=sid) then raise exception 'Playoffs have already started.'; end if;
  rows:=private.playoff_seed_preview(sid); expected:=md5(rows::text);
  select count(*) into n from public.weeks where season_id=sid and phase='regular' and status='published';
  result:=jsonb_build_object('rows',rows,'revision',expected,'published_weeks',n,'required_weeks',settings.regular_week_count,'date_ready',now()>=settings.start_not_before,'start_not_before',settings.start_not_before);
  if action='preview_start' then return result; end if;
  if now()<settings.start_not_before then raise exception 'Playoffs are scheduled for January. They cannot start yet.'; end if;
  if n<>settings.regular_week_count or exists(select 1 from generate_series(1,settings.regular_week_count) needed where not exists(select 1 from public.weeks where season_id=sid and phase='regular' and number=needed and status='published')) or exists(select 1 from public.weeks where season_id=sid and phase='regular' and status<>'published') then raise exception 'Publish all regular-season weeks before starting playoffs.'; end if;
  if jsonb_array_length(rows)<>8 or exists(select 1 from public.player_slots where claimed_by is null) then raise exception 'Exactly eight activated league members are required.'; end if;
  if exists(select 1 from public.weeks w cross join private.playoff_roster() p where w.season_id=sid and w.phase='regular' and not exists(select 1 from public.week_scores s where s.week_id=w.id and s.user_id=p.user_id)) then raise exception 'A regular-season score is missing. Finish scoring before freezing seeds.'; end if;
  if payload->>'revision' is distinct from expected then raise exception 'Season standings changed. Review the starting standings again.'; end if;
  select * into cal from public.season_calendar where season_id=sid and round_number=1;
  if not cal.lock_confirmed or cal.suggested_lock_at<=now() then raise exception 'Confirm the Wild Card card lock before starting playoffs.'; end if;
  for item in select value from jsonb_array_elements(rows) loop
   insert into public.playoff_entries(season_id,user_id,seed,regular_season_points,regular_correct,regular_wins) values(sid,(item->>'user_id')::uuid,(item->>'seed')::integer,(item->>'points')::numeric,(item->>'correct')::integer,(item->>'wins')::integer);
  end loop;
  update public.postseason_seasons set status='live',frozen_at=now(),updated_at=now() where season_id=sid;
  insert into public.commissioner_activity_log(actor_id,action_type,summary,details) values(auth.uid(),'playoffs_started','Regular season frozen; playoffs started',jsonb_build_object('season_id',sid,'seeds',rows));
  return private.postseason_action('create_round',jsonb_build_object('season_id',sid));
 elsif action='save_calendar' then
  select * into cal from public.season_calendar where season_id=sid and slot=(payload->>'slot')::integer for update;
  if not found or cal.phase='break' then raise exception 'Select a scored calendar week.'; end if;
  if exists(select 1 from public.weeks where season_id=sid and number=cal.week_number) then raise exception 'This week already exists. Use its normal week settings.'; end if;
  lock_time:=(payload->>'lock_at')::timestamptz;
  if lock_time is null or lock_time<=now() or (lock_time at time zone 'America/New_York')::date<cal.setup_date or (lock_time at time zone 'America/New_York')::date>cal.ends_on then raise exception 'Choose a future lock within this card’s date window.'; end if;
  update public.season_calendar set suggested_lock_at=lock_time,lock_confirmed=true where season_id=sid and slot=cal.slot;
  return jsonb_build_object('saved',true);
 elsif action='create_round' then
  if settings.status<>'live' then raise exception 'Start playoffs first.'; end if;
  if exists(select 1 from public.playoff_rounds where season_id=sid and status<>'finalized') then raise exception 'Finalize the current round first.'; end if;
  select coalesce(max(round_number),0)+1 into next_round from public.playoff_rounds where season_id=sid;
  if next_round>4 then raise exception 'The championship is complete.'; end if;
  select * into cal from public.season_calendar where season_id=sid and round_number=next_round;
  if now()<(cal.setup_date+time '08:00') at time zone 'America/New_York' then raise exception 'This round opens for setup on its scheduled Tuesday.'; end if;
  if not cal.lock_confirmed or cal.suggested_lock_at<=now() then raise exception 'Confirm this round’s future lock time in the calendar first.'; end if;
  before_count:=(array[8,6,4,2])[next_round]; after_count:=(array[6,4,2,1])[next_round];
  if (select count(*) from public.playoff_entries where season_id=sid and status='active')<>before_count then raise exception 'Contender count is not ready for this round.'; end if;
  update public.weeks set is_active=false where season_id=sid and is_active;
  insert into public.weeks(season_id,number,name,lock_at,is_active,phase,playoff_round,playoff_label,tiebreaker_prompt)
  values(sid,cal.week_number,cal.label,cal.suggested_lock_at,true,'playoff',next_round,cal.label,coalesce(nullif(payload->>'tiebreaker_prompt',''),'Total points in the featured game?')) returning id into wid;
  insert into public.playoff_rounds(season_id,week_id,round_number,label,participants_before,participants_after) values(sid,wid,next_round,cal.label,before_count,after_count);
  return jsonb_build_object('week_id',wid,'round_number',next_round);
 elsif action='create_regular_week' then
  if settings.status<>'scheduled' then raise exception 'The regular season is frozen.'; end if;
  if exists(select 1 from public.weeks where season_id=sid and status<>'published') then raise exception 'Publish the current week first.'; end if;
  select coalesce(max(number),0)+1 into n from public.weeks where season_id=sid and phase='regular';
  select * into cal from public.season_calendar where season_id=sid and week_number=n and phase='regular';
  if not found then raise exception 'The regular season is complete. Use Start Playoffs when its scheduled setup day arrives.'; end if;
  if now()<(cal.setup_date+time '08:00') at time zone 'America/New_York' then raise exception 'The next card opens for setup on Tuesday morning.'; end if;
  if not cal.lock_confirmed or cal.suggested_lock_at<=now() then raise exception 'Confirm this week’s lock time in the calendar first.'; end if;
  update public.weeks set is_active=false where season_id=sid and is_active;
  insert into public.weeks(season_id,number,name,lock_at,is_active,tiebreaker_prompt) values(sid,n,cal.label,cal.suggested_lock_at,true,coalesce(nullif(payload->>'tiebreaker_prompt',''),'Total points in the featured game?')) returning id into wid;
  return jsonb_build_object('week_id',wid);
 elsif action='preview_round' then
  return private.playoff_round_state(wid);
 elsif action='finalize' then
  return private.playoff_finalize(wid,payload->>'revision');
 elsif action in ('preview_correction','correct') then
  select * into r from public.playoff_rounds where week_id=wid and season_id=sid;
  if not found or r.status<>'finalized' then raise exception 'Select a finalized playoff round.'; end if;
  result:=private.playoff_round_state(wid); changes:=coalesce(payload->'results','{}'); actual:=(payload->>'tiebreaker_result')::numeric;
  if jsonb_typeof(changes)<>'object' or not private.playoff_number_ok(actual) then raise exception 'Provide corrected results and a valid actual tiebreaker.'; end if;
  if exists(select 1 from jsonb_object_keys(changes) k where not exists(select 1 from public.questions where id::text=k and week_id=wid)) then raise exception 'A correction belongs to a different week.'; end if;
  if exists(select 1 from public.questions q where q.week_id=wid and q.counts_for_score and (case when changes ? q.id::text then changes->q.id::text else q.result end is null or case when changes ? q.id::text then changes->q.id::text else q.result end='null'::jsonb)) then raise exception 'Every scored question needs a result.'; end if;
  revised:=private.playoff_projection(r.id,changes,actual,true,true);
  later:=exists(select 1 from public.playoff_rounds where season_id=sid and round_number>r.round_number);
  if action='preview_correction' then return jsonb_build_object('rows',revised,'revision',result->>'revision','rebuild_required',later,'round',to_jsonb(r)); end if;
  if payload->>'revision' is distinct from result->>'revision' then raise exception 'The round changed. Preview this correction again.'; end if;
  if later and payload->>'confirmation' is distinct from 'REBUILD PLAYOFFS FROM THIS ROUND' then raise exception 'A later round exists. Explicitly rebuild playoffs from this round; later entries and results will be invalidated.'; end if;
 elsif action='reset' then
  if payload->>'confirmation' is distinct from 'RESET ALL PLAYOFFS' then raise exception 'Type RESET ALL PLAYOFFS to confirm.'; end if;
 else raise exception 'Unknown postseason action.';
 end if;

 -- Reset/correction paths keep a complete commissioner audit before invalidating data.
 snapshot:=jsonb_build_object('settings',to_jsonb(settings),
 'entries',(select jsonb_agg(to_jsonb(e)) from public.playoff_entries e where season_id=sid),
 'rounds',(select jsonb_agg(to_jsonb(pr)) from public.playoff_rounds pr where season_id=sid),
 'results',(select jsonb_agg(to_jsonb(rr)) from public.playoff_round_results rr join public.playoff_rounds pr on pr.id=rr.round_id where pr.season_id=sid),
 'weeks',(select jsonb_agg(to_jsonb(x)) from public.weeks x where season_id=sid and phase='playoff'),
 'questions',(select jsonb_agg(to_jsonb(q)) from public.questions q join public.weeks x on x.id=q.week_id where x.season_id=sid and x.phase='playoff'),
 'picks',(select jsonb_agg(to_jsonb(p)) from public.picks p join public.weeks x on x.id=p.week_id where x.season_id=sid and x.phase='playoff'),
 'submissions',(select jsonb_agg(to_jsonb(s)) from public.submissions s join public.weeks x on x.id=s.week_id where x.season_id=sid and x.phase='playoff'));
 insert into private.playoff_rebuild_audit(season_id,actor_id,action,snapshot) values(sid,auth.uid(),action,snapshot);
 if action='reset' then
  delete from public.weeks where season_id=sid and phase='playoff';
  delete from public.playoff_entries where season_id=sid;
  update public.postseason_seasons set status='scheduled',frozen_at=null,champion_id=null,updated_at=now() where season_id=sid;
  update public.weeks set is_active=(id=(select id from public.weeks where season_id=sid and phase='regular' order by number desc limit 1)) where season_id=sid;
  return jsonb_build_object('reset',true);
 end if;
 delete from public.weeks where season_id=sid and phase='playoff' and playoff_round>r.round_number;
 delete from public.playoff_round_results where round_id=r.id;
 delete from public.week_scores where week_id=wid;
 update public.playoff_entries e set playoff_points=coalesce((select sum(rr.round_correct) from public.playoff_round_results rr join public.playoff_rounds pr on pr.id=rr.round_id where pr.season_id=sid and rr.user_id=e.user_id),0),
 status=coalesce((select rr.status_after from public.playoff_round_results rr join public.playoff_rounds pr on pr.id=rr.round_id where pr.season_id=sid and rr.user_id=e.user_id order by pr.round_number desc limit 1),'active'),
 eliminated_round=null,eliminated_week_id=null,eliminated_at=null,updated_at=now() where e.season_id=sid;
 update public.playoff_entries e set eliminated_round=pr.round_number,eliminated_week_id=pr.week_id,eliminated_at=pr.finalized_at from public.playoff_round_results rr join public.playoff_rounds pr on pr.id=rr.round_id where e.season_id=sid and e.user_id=rr.user_id and rr.status_after='eliminated';
 update public.postseason_seasons set status='live',champion_id=null,updated_at=now() where season_id=sid;
 update public.playoff_rounds set status='live',finalized_at=null where id=r.id;
 update public.weeks set is_active=false where season_id=sid and is_active;
 update public.weeks set status='draft',published_at=null,is_active=true,tiebreaker_result=actual where id=wid;
 update public.questions q set result=changes->q.id::text where q.week_id=wid and changes ? q.id::text;
 result:=private.playoff_round_state(wid);
 return private.playoff_finalize(wid,result->>'revision');
end $$;

-- Only these two invoker wrappers are exposed. Their private implementations check identity.
create function public.postseason_state(p_season_id uuid,p_week_id uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$ select private.postseason_state(p_season_id,p_week_id); $$;
create function public.postseason_action(p_action text,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.postseason_action(p_action,p_payload); $$;
revoke all on function private.playoff_number_ok(numeric),private.playoff_require_member(),private.playoff_roster(),private.playoff_seed_preview(uuid),private.playoff_projection(uuid,jsonb,numeric,boolean,boolean),private.playoff_round_state(uuid),private.playoff_finalize(uuid,text) from public,anon,authenticated;
revoke all on function private.postseason_state(uuid,uuid),private.postseason_action(text,jsonb),public.postseason_state(uuid,uuid),public.postseason_action(text,jsonb) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.postseason_state(uuid,uuid),private.postseason_action(text,jsonb),public.postseason_state(uuid,uuid),public.postseason_action(text,jsonb) to authenticated;
grant execute on function private.playoff_write_guard() to authenticated;
notify pgrst,'reload schema';
