-- AI session adaptation: baselines, daily recovery, session modifications, AI feedback
-- Run after training_plans. Enables Groq-powered daily session decisions.

-- =============================================================================
-- SESSIONS: add importance for AI context
-- =============================================================================
alter table public.sessions
  add column if not exists importance text check (importance in ('key_session', 'normal', 'optional'));

comment on column public.sessions.importance is 'key_session | normal | optional';

-- =============================================================================
-- USER BASELINES (HRV, RHR, sleep — for recovery comparison)
-- =============================================================================
create table public.user_baselines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade unique,
  hrv_baseline_avg numeric(10, 2),
  hrv_baseline_std numeric(10, 2),
  hrv_7day_avg numeric(10, 2),
  rhr_baseline_avg numeric(8, 2),
  rhr_baseline_std numeric(8, 2),
  rhr_7day_avg numeric(8, 2),
  sleep_baseline_avg numeric(6, 2),
  sleep_deep_percent_avg numeric(6, 2),
  sleep_duration_avg_hours numeric(6, 2),
  calculated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index user_baselines_user_id_idx on public.user_baselines (user_id);

comment on table public.user_baselines is 'Rolling baselines for HRV, RHR, sleep; used by session adaptation AI';

alter table public.user_baselines enable row level security;

create policy "Users can view own user_baselines"
  on public.user_baselines for select using (auth.uid() = user_id);

create trigger user_baselines_updated_at
  before update on public.user_baselines
  for each row execute function public.set_updated_at();

-- =============================================================================
-- DAILY RECOVERY (one row per user per day; AI decision + user choice)
-- =============================================================================
create table public.daily_recovery (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  hrv_today numeric(10, 2),
  hrv_7day_avg numeric(10, 2),
  hrv_30day_avg numeric(10, 2),
  hrv_trend text,
  hrv_days_below_baseline integer,
  rhr_today integer,
  rhr_30day_avg numeric(8, 2),
  rhr_trend text,
  rhr_days_elevated integer,
  sleep_score integer,
  sleep_duration_hours numeric(6, 2),
  sleep_deep_percent numeric(6, 2),
  sleep_rem_percent numeric(6, 2),
  sleep_30day_avg numeric(6, 2),
  sleep_consecutive_poor integer,
  body_battery_current integer,
  stress_yesterday numeric(8, 2),
  recovery_score integer,
  recovery_status text,
  ai_decision jsonb,
  ai_reasoning text,
  user_choice text check (user_choice in ('accepted', 'modified', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create index daily_recovery_user_id_date_idx on public.daily_recovery (user_id, date desc);

comment on table public.daily_recovery is 'Daily recovery snapshot + AI session decision and user choice';

alter table public.daily_recovery enable row level security;

create policy "Users can view own daily_recovery"
  on public.daily_recovery for select using (auth.uid() = user_id);

create policy "Users can insert own daily_recovery"
  on public.daily_recovery for insert with check (auth.uid() = user_id);

create policy "Users can update own daily_recovery"
  on public.daily_recovery for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger daily_recovery_updated_at
  before update on public.daily_recovery
  for each row execute function public.set_updated_at();

-- =============================================================================
-- SESSION MODIFICATIONS (when AI or user changes today's session)
-- =============================================================================
create table public.session_modifications (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.sessions (id) on delete set null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  original_type text,
  original_distance numeric(10, 2),
  original_pace_target text,
  modified_type text,
  modified_distance numeric(10, 2),
  modified_pace_target text,
  modification_reason text,
  recovery_score_at_modification integer,
  ai_reasoning text,
  modified_at timestamptz not null default now()
);

create index session_modifications_user_id_date_idx on public.session_modifications (user_id, date desc);

comment on table public.session_modifications is 'Log of AI or user session changes for learning';

alter table public.session_modifications enable row level security;

create policy "Users can view own session_modifications"
  on public.session_modifications for select using (auth.uid() = user_id);

create policy "Users can insert own session_modifications"
  on public.session_modifications for insert with check (auth.uid() = user_id);

-- =============================================================================
-- AI FEEDBACK (outcome of AI recommendation vs what user did)
-- =============================================================================
create table public.ai_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  ai_recommendation jsonb,
  user_choice text,
  actual_run_id uuid references public.runs (id) on delete set null,
  actual_run_data jsonb,
  next_day_hrv numeric(10, 2),
  next_day_recovery_score integer,
  outcome text check (outcome in ('positive', 'neutral', 'negative')),
  created_at timestamptz not null default now()
);

create index ai_feedback_user_id_date_idx on public.ai_feedback (user_id, date desc);

comment on table public.ai_feedback is 'AI recommendation vs user action and next-day recovery; used to improve prompts';

alter table public.ai_feedback enable row level security;

create policy "Users can view own ai_feedback"
  on public.ai_feedback for select using (auth.uid() = user_id);
