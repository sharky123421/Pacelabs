-- Core AI Coaching Engine: athlete state, bottleneck analysis, philosophy periods,
-- adaptation records, daily decisions, and run extensions for fitness metrics.

-- =============================================================================
-- RUNS: extend for fitness calculation (TSS, IF, decoupling, HR zones)
-- =============================================================================
alter table public.runs
  add column if not exists tss numeric(10, 2),
  add column if not exists intensity_factor numeric(6, 4),
  add column if not exists normalized_pace_sec numeric(10, 2),
  add column if not exists aerobic_decoupling numeric(6, 2),
  add column if not exists max_hr integer,
  add column if not exists cadence_avg numeric(6, 2),
  add column if not exists ground_contact_time_ms numeric(8, 2),
  add column if not exists vertical_oscillation_cm numeric(6, 2),
  add column if not exists stride_length_m numeric(6, 4),
  add column if not exists running_power_avg numeric(8, 2),
  add column if not exists elevation_gain_m numeric(8, 2),
  add column if not exists elevation_loss_m numeric(8, 2),
  add column if not exists ai_summary text,
  add column if not exists is_pr boolean default false,
  add column if not exists pr_type text;

comment on column public.runs.tss is 'Training Stress Score for this run';
comment on column public.runs.intensity_factor is 'Normalized pace / threshold pace';
comment on column public.runs.aerobic_decoupling is 'First/second half pace:HR ratio difference (%)';

-- =============================================================================
-- ATHLETE STATE (unified snapshot per user, updated after every sync/run)
-- =============================================================================
create table if not exists public.athlete_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade unique,
  runner_level text check (runner_level in ('beginner', 'intermediate', 'advanced', 'elite')),
  experience_years numeric(4, 1),

  -- Fitness
  vo2max numeric(6, 2),
  vo2max_confidence text check (vo2max_confidence in ('high', 'medium', 'low')),
  vo2max_trend text check (vo2max_trend in ('improving', 'stable', 'declining')),
  threshold_pace_sec_per_km integer,
  threshold_hr integer,
  threshold_trend text check (threshold_trend in ('improving', 'stable', 'declining')),
  aerobic_threshold_pace_sec integer,
  aerobic_threshold_hr integer,
  easy_pace_min_sec integer,
  easy_pace_max_sec integer,
  recovery_pace_sec integer,
  running_economy_index numeric(8, 4),
  running_economy_trend text,
  aerobic_decoupling_avg numeric(6, 2),

  -- Load
  ctl numeric(8, 2),
  atl numeric(8, 2),
  tsb numeric(8, 2),
  tsb_trend text,
  weekly_km_current numeric(8, 2),
  weekly_km_4week_avg numeric(8, 2),
  weekly_km_8week_avg numeric(8, 2),
  weekly_km_trend text check (weekly_km_trend in ('building', 'stable', 'declining')),
  load_increase_7day_percent numeric(6, 2),
  load_increase_28day_percent numeric(6, 2),
  intensity_easy_percent numeric(5, 2),
  intensity_moderate_percent numeric(5, 2),
  intensity_hard_percent numeric(5, 2),
  tss_7day numeric(8, 2),
  tss_28day_avg numeric(8, 2),
  longest_run_recent_km numeric(8, 2),
  longest_run_ever_km numeric(8, 2),
  consecutive_run_days integer default 0,
  days_since_rest integer,
  days_since_hard_session integer,
  hard_sessions_last_14_days integer default 0,

  -- Recovery
  hrv_today numeric(8, 2),
  hrv_7day_avg numeric(8, 2),
  hrv_60day_avg numeric(8, 2),
  hrv_trend text check (hrv_trend in ('improving', 'stable', 'declining', 'volatile')),
  hrv_percent_from_baseline numeric(6, 2),
  hrv_consecutive_days_suppressed integer default 0,
  rhr_today integer,
  rhr_30day_avg numeric(8, 2),
  rhr_bpm_from_baseline numeric(6, 2),
  rhr_trend text,
  sleep_score_last integer,
  sleep_duration_hours_last numeric(5, 2),
  sleep_deep_percent_last numeric(5, 2),
  sleep_30day_avg numeric(5, 2),
  sleep_consecutive_poor_nights integer default 0,
  body_battery integer,
  stress_yesterday numeric(5, 2),
  readiness_score integer,
  readiness_status text check (readiness_status in ('optimal', 'suboptimal', 'poor', 'very_poor')),

  -- Biomechanics
  cadence_avg numeric(6, 2),
  cadence_trend text,
  ground_contact_time_avg numeric(8, 2),
  vertical_oscillation_avg numeric(6, 2),
  stride_length_avg numeric(6, 4),
  running_power_avg numeric(8, 2),
  cadence_drops_on_long_runs boolean default false,
  asymmetry_detected boolean default false,
  efficiency_declining_with_fatigue boolean default false,

  -- Injury
  injury_risk_score integer default 0,
  injury_risk_trend text,
  injury_history jsonb default '[]',
  current_issue text,
  vulnerable_areas jsonb default '[]',

  -- Goal
  race_distance text check (race_distance in ('5k', '10k', 'half', 'marathon', 'ultra', 'fitness')),
  race_date date,
  weeks_to_race integer,
  goal_time_seconds integer,
  current_predicted_time integer,
  time_gap_seconds integer,
  plan_phase text check (plan_phase in ('base', 'build', 'peak', 'taper', 'recovery')),
  plan_week integer,
  plan_total_weeks integer,

  -- Trends
  fitness_trajectory text check (fitness_trajectory in (
    'rapid_improvement', 'steady_improvement', 'plateau', 'slight_decline', 'significant_decline'
  )),
  pace_at_standard_hr_trend text,
  race_predictions_trend text,
  consistency_score numeric(5, 2),
  adaptation_rate text check (adaptation_rate in ('fast', 'normal', 'slow')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists athlete_state_user_id_idx on public.athlete_state (user_id);

comment on table public.athlete_state is 'Unified athlete state snapshot; single source of truth for all coaching decisions';

alter table public.athlete_state enable row level security;

drop policy if exists "Users can view own athlete_state" on public.athlete_state;
create policy "Users can view own athlete_state"
  on public.athlete_state for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own athlete_state" on public.athlete_state;
create policy "Users can insert own athlete_state"
  on public.athlete_state for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own athlete_state" on public.athlete_state;
create policy "Users can update own athlete_state"
  on public.athlete_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Service role full access athlete_state" on public.athlete_state;
create policy "Service role full access athlete_state"
  on public.athlete_state for all using (
    (select auth.role()) = 'service_role'
  );

drop trigger if exists athlete_state_updated_at on public.athlete_state;
create trigger athlete_state_updated_at
  before update on public.athlete_state
  for each row execute function public.set_updated_at();

-- =============================================================================
-- BOTTLENECK ANALYSES
-- =============================================================================
create table if not exists public.bottleneck_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary_bottleneck text not null,
  primary_strength text,
  primary_evidence text,
  primary_coaching_note text,
  secondary_signals jsonb default '[]',
  all_signals jsonb default '[]',
  confidence text check (confidence in ('high', 'medium', 'low')),
  previous_bottleneck text,
  bottleneck_changed boolean default false,
  athlete_state_snapshot jsonb,
  analyzed_at timestamptz not null default now()
);

create index if not exists bottleneck_analyses_user_id_idx on public.bottleneck_analyses (user_id, analyzed_at desc);

comment on table public.bottleneck_analyses is 'Bottleneck detection results; tracks what limits the athlete over time';

alter table public.bottleneck_analyses enable row level security;

drop policy if exists "Users can view own bottleneck_analyses" on public.bottleneck_analyses;
create policy "Users can view own bottleneck_analyses"
  on public.bottleneck_analyses for select using (auth.uid() = user_id);

drop policy if exists "Service role full access bottleneck_analyses" on public.bottleneck_analyses;
create policy "Service role full access bottleneck_analyses"
  on public.bottleneck_analyses for all using (
    (select auth.role()) = 'service_role'
  );

-- =============================================================================
-- PHILOSOPHY PERIODS
-- =============================================================================
create table if not exists public.philosophy_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan_id uuid references public.training_plans (id) on delete set null,
  mode text not null,
  bottleneck_that_triggered text,
  volume_target_km numeric(8, 2),
  intensity_easy_percent integer,
  intensity_moderate_percent integer,
  intensity_hard_percent integer,
  session_composition jsonb,
  key_workout_types text[],
  forbidden_workout_types text[],
  progression_rate_percent numeric(5, 2),
  success_metric text,
  typical_duration_weeks integer,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  outcome text
);

create index if not exists philosophy_periods_user_id_idx on public.philosophy_periods (user_id, started_at desc);

comment on table public.philosophy_periods is 'Training philosophy periods; maps bottleneck to training mode over time';

alter table public.philosophy_periods enable row level security;

drop policy if exists "Users can view own philosophy_periods" on public.philosophy_periods;
create policy "Users can view own philosophy_periods"
  on public.philosophy_periods for select using (auth.uid() = user_id);

drop policy if exists "Service role full access philosophy_periods" on public.philosophy_periods;
create policy "Service role full access philosophy_periods"
  on public.philosophy_periods for all using (
    (select auth.role()) = 'service_role'
  );

-- =============================================================================
-- ADAPTATION RECORDS (weekly Monday analysis)
-- =============================================================================
create table if not exists public.adaptation_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_start_date date not null,
  planned_km numeric(8, 2),
  actual_km numeric(8, 2),
  planned_sessions integer,
  completed_sessions integer,
  completion_rate numeric(5, 2),
  ctl_change_actual numeric(8, 2),
  ctl_change_expected numeric(8, 2),
  adaptation_ratio numeric(6, 4),
  threshold_pace_change integer,
  decoupling_change numeric(6, 2),
  hrv_response numeric(6, 2),
  adaptation_outcome text check (adaptation_outcome in (
    'strong_positive', 'normal_positive', 'weak_positive', 'stagnant', 'negative'
  )),
  action_taken text check (action_taken in ('accelerate', 'continue', 'hold', 'replan', 'reduce')),
  volume_adjustment_percent numeric(6, 2),
  intensity_adjustment_percent numeric(6, 2),
  ai_explanation text,
  bottleneck_resolved boolean default false,
  philosophy_changed boolean default false,
  new_philosophy text,
  analyzed_at timestamptz not null default now(),
  unique (user_id, week_start_date)
);

create index if not exists adaptation_records_user_id_idx on public.adaptation_records (user_id, week_start_date desc);

comment on table public.adaptation_records is 'Weekly adaptation measurements and coaching adjustments';

alter table public.adaptation_records enable row level security;

drop policy if exists "Users can view own adaptation_records" on public.adaptation_records;
create policy "Users can view own adaptation_records"
  on public.adaptation_records for select using (auth.uid() = user_id);

drop policy if exists "Service role full access adaptation_records" on public.adaptation_records;
create policy "Service role full access adaptation_records"
  on public.adaptation_records for all using (
    (select auth.role()) = 'service_role'
  );

-- =============================================================================
-- DAILY DECISIONS (enhanced daily coaching decisions)
-- =============================================================================
create table if not exists public.daily_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  session_id uuid references public.sessions (id) on delete set null,
  recovery_score integer,
  hrv_today numeric(8, 2),
  hrv_vs_baseline_percent numeric(6, 2),
  rhr_today integer,
  rhr_vs_baseline integer,
  sleep_score integer,
  body_battery integer,
  tsb_today numeric(8, 2),
  action text check (action in ('proceed', 'modify', 'replace', 'rest')),
  confidence text check (confidence in ('high', 'medium', 'low')),
  primary_reason text,
  original_session_type text,
  original_distance_km numeric(8, 2),
  modified_session_type text,
  modified_distance_km numeric(8, 2),
  modification_reason text,
  user_choice text check (user_choice in ('accepted', 'modified', 'declined')),
  actual_session_type text,
  actual_distance_km numeric(8, 2),
  outcome_quality text check (outcome_quality in ('excellent', 'good', 'fair', 'poor')),
  next_day_hrv_change numeric(6, 2),
  bottleneck_at_time text,
  philosophy_at_time text,
  full_decision jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists daily_decisions_user_id_date_idx on public.daily_decisions (user_id, date desc);

comment on table public.daily_decisions is 'Complete daily coaching decisions with outcome tracking for AI learning';

alter table public.daily_decisions enable row level security;

drop policy if exists "Users can view own daily_decisions" on public.daily_decisions;
create policy "Users can view own daily_decisions"
  on public.daily_decisions for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own daily_decisions" on public.daily_decisions;
create policy "Users can insert own daily_decisions"
  on public.daily_decisions for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update own daily_decisions" on public.daily_decisions;
create policy "Users can update own daily_decisions"
  on public.daily_decisions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Service role full access daily_decisions" on public.daily_decisions;
create policy "Service role full access daily_decisions"
  on public.daily_decisions for all using (
    (select auth.role()) = 'service_role'
  );

-- =============================================================================
-- SESSIONS: add coaching engine fields
-- =============================================================================
alter table public.sessions
  add column if not exists target_hr_max_bpm integer,
  add column if not exists training_stimulus text,
  add column if not exists energy_system_targeted text,
  add column if not exists recovery_cost text check (recovery_cost in ('low', 'medium', 'high')),
  add column if not exists expected_adaptation text,
  add column if not exists bottleneck_connection text;

-- =============================================================================
-- TRAINING PLANS: add coaching engine metadata
-- =============================================================================
alter table public.training_plans
  add column if not exists bottleneck_addressed text,
  add column if not exists philosophy_mode text,
  add column if not exists philosophy_id uuid references public.philosophy_periods (id) on delete set null,
  add column if not exists phases_json jsonb,
  add column if not exists key_workouts_json jsonb;

-- =============================================================================
-- HELPER: get Monday of current week
-- =============================================================================
create or replace function public.week_start(d date default current_date)
returns date
language sql immutable
as $$
  select d - extract(isodow from d)::int + 1;
$$;
