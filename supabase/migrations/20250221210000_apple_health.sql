-- Apple HealthKit integration: connections and wellness
-- Run after initial_schema. Extends runs for source/source_app.

-- =============================================================================
-- RUNS: add source columns for Strava / Apple Watch / manual
-- =============================================================================
alter table public.runs
  add column if not exists source text default 'manual' check (source in ('manual', 'strava', 'apple_watch', 'gpx')),
  add column if not exists source_app text,
  add column if not exists external_id text,
  add column if not exists avg_hr integer,
  add column if not exists avg_cadence numeric(6,2),
  add column if not exists calories integer,
  add column if not exists route_coordinates jsonb;

create index if not exists runs_source_idx on public.runs (source);
create unique index if not exists runs_user_external_id_idx on public.runs (user_id, source, external_id) where external_id is not null;

comment on column public.runs.source is 'manual | strava | apple_watch | gpx';
comment on column public.runs.external_id is 'External ID for dedup (e.g. HealthKit workout UUID)';

-- =============================================================================
-- APPLE HEALTH CONNECTIONS
-- =============================================================================
create table public.apple_health_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade unique,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  permissions_granted jsonb not null default '[]',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index apple_health_connections_user_id_idx on public.apple_health_connections (user_id);

comment on table public.apple_health_connections is 'Apple Health connection state per user';

alter table public.apple_health_connections enable row level security;

create policy "Users can view own apple_health_connections"
  on public.apple_health_connections for select
  using (auth.uid() = user_id);

create policy "Users can insert own apple_health_connections"
  on public.apple_health_connections for insert
  with check (auth.uid() = user_id);

create policy "Users can update own apple_health_connections"
  on public.apple_health_connections for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own apple_health_connections"
  on public.apple_health_connections for delete
  using (auth.uid() = user_id);

create trigger apple_health_connections_updated_at
  before update on public.apple_health_connections
  for each row execute function public.set_updated_at();

-- =============================================================================
-- APPLE WELLNESS (one row per user per day)
-- =============================================================================
create table public.apple_wellness (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  hrv_last_night numeric(8,2),
  hrv_status text check (hrv_status in ('BALANCED', 'LOW', 'POOR')),
  resting_heart_rate integer,
  sleep_score integer check (sleep_score >= 0 and sleep_score <= 100),
  sleep_duration_seconds integer,
  sleep_deep_seconds integer,
  sleep_rem_seconds integer,
  sleep_core_seconds integer,
  sleep_awake_seconds integer,
  apple_vo2_max numeric(5,2),
  move_calories integer,
  move_goal integer,
  exercise_minutes integer,
  exercise_goal integer,
  stand_hours integer,
  stand_goal integer,
  readiness_score integer check (readiness_score >= 0 and readiness_score <= 100),
  readiness_verdict text check (readiness_verdict in ('GREEN', 'YELLOW', 'RED')),
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create index apple_wellness_user_id_date_idx on public.apple_wellness (user_id, date desc);

comment on table public.apple_wellness is 'Apple Health wellness metrics per user per day';

alter table public.apple_wellness enable row level security;

create policy "Users can view own apple_wellness"
  on public.apple_wellness for select
  using (auth.uid() = user_id);

create policy "Users can insert own apple_wellness"
  on public.apple_wellness for insert
  with check (auth.uid() = user_id);

create policy "Users can update own apple_wellness"
  on public.apple_wellness for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger apple_wellness_updated_at
  before update on public.apple_wellness
  for each row execute function public.set_updated_at();
