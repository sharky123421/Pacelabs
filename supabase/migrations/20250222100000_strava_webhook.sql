-- Strava webhook & sync: connections, run datapoints/splits, soft delete, push token
-- Run after apple_health. Extends runs for Strava and processing pipeline.

-- =============================================================================
-- RUNS: soft delete + Strava activity id
-- =============================================================================
alter table public.runs
  add column if not exists deleted_at timestamptz,
  add column if not exists strava_activity_id bigint;

create unique index if not exists runs_user_strava_activity_id_idx
  on public.runs (user_id, strava_activity_id)
  where strava_activity_id is not null;

comment on column public.runs.deleted_at is 'Soft delete for sync sources (e.g. deleted on Strava)';
comment on column public.runs.strava_activity_id is 'Strava activity ID for webhook/API lookup';

-- =============================================================================
-- STRAVA CONNECTIONS
-- =============================================================================
create table public.strava_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade unique,
  strava_athlete_id bigint not null unique,
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz not null,
  scope text,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index strava_connections_user_id_idx on public.strava_connections (user_id);
create index strava_connections_strava_athlete_id_idx on public.strava_connections (strava_athlete_id);

comment on table public.strava_connections is 'Strava OAuth tokens and connection state per user';

alter table public.strava_connections enable row level security;

create policy "Users can view own strava_connections"
  on public.strava_connections for select
  using (auth.uid() = user_id);

create policy "Users can insert own strava_connections"
  on public.strava_connections for insert
  with check (auth.uid() = user_id);

create policy "Users can update own strava_connections"
  on public.strava_connections for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own strava_connections"
  on public.strava_connections for delete
  using (auth.uid() = user_id);

create trigger strava_connections_updated_at
  before update on public.strava_connections
  for each row execute function public.set_updated_at();

-- =============================================================================
-- RUN DATAPOINTS (time-series stream per run: time, lat, lng, hr, cadence, etc.)
-- =============================================================================
create table public.run_datapoints (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id) on delete cascade,
  sequence integer not null,
  time_offset_seconds integer not null,
  lat double precision,
  lng double precision,
  heartrate integer,
  cadence integer,
  altitude numeric(8, 2),
  velocity_smooth numeric(10, 4),
  watts integer,
  unique (run_id, sequence)
);

create index run_datapoints_run_id_idx on public.run_datapoints (run_id);

comment on table public.run_datapoints is 'Stream datapoints per run (Strava/Apple Watch/GPS)';

alter table public.run_datapoints enable row level security;

create policy "Users can view own run_datapoints"
  on public.run_datapoints for select
  using (
    exists (
      select 1 from public.runs r
      where r.id = run_datapoints.run_id and r.user_id = auth.uid()
    )
  );

create policy "Users can insert own run_datapoints"
  on public.run_datapoints for insert
  with check (
    exists (
      select 1 from public.runs r
      where r.id = run_datapoints.run_id and r.user_id = auth.uid()
    )
  );

-- =============================================================================
-- RUN SPLITS (e.g. per km)
-- =============================================================================
create table public.run_splits (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id) on delete cascade,
  split_index integer not null,
  distance_meters numeric(12, 2) not null,
  elapsed_seconds integer not null,
  moving_seconds integer,
  pace_seconds_per_km numeric(8, 2),
  elevation_gain_meters numeric(8, 2),
  unique (run_id, split_index)
);

create index run_splits_run_id_idx on public.run_splits (run_id);

comment on table public.run_splits is 'Distance splits per run (e.g. km splits)';

alter table public.run_splits enable row level security;

create policy "Users can view own run_splits"
  on public.run_splits for select
  using (
    exists (
      select 1 from public.runs r
      where r.id = run_splits.run_id and r.user_id = auth.uid()
    )
  );

-- =============================================================================
-- PROFILES: Expo push token for run-synced notifications
-- =============================================================================
alter table public.profiles
  add column if not exists expo_push_token text;

comment on column public.profiles.expo_push_token is 'Expo push token for notifications (e.g. run synced)';

-- =============================================================================
-- RUNS: optional metrics from pipeline (TSS, TRIMP, etc.)
-- =============================================================================
alter table public.runs
  add column if not exists tss numeric(8, 2),
  add column if not exists trimp numeric(8, 2),
  add column if not exists intensity_factor numeric(6, 4),
  add column if not exists efficiency_factor numeric(6, 4),
  add column if not exists ai_summary text;

comment on column public.runs.tss is 'Training Stress Score';
comment on column public.runs.trimp is 'TRIMP score';
comment on column public.runs.ai_summary is 'AI-generated post-run summary';
