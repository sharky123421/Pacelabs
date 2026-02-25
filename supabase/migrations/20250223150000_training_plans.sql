-- AI-generated training plans (Gemini 1.5 Pro) and planned sessions
-- Run in Supabase SQL Editor or: supabase db push

-- =============================================================================
-- TRAINING PLANS
-- =============================================================================
create table public.training_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan_name text not null,
  goal text,
  race_date date,
  goal_time text,
  total_weeks integer not null,
  current_week integer not null default 1,
  phase text,
  generated_at timestamptz not null default now(),
  generated_by text not null default 'gemini-1.5-pro',
  coach_summary text,
  gemini_raw_json jsonb,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index training_plans_user_id_idx on public.training_plans (user_id);
create index training_plans_user_active_idx on public.training_plans (user_id, is_active) where is_active = true;

comment on table public.training_plans is 'AI-generated training plans; one active per user, older ones archived';

alter table public.training_plans enable row level security;

create policy "Users can view own training_plans"
  on public.training_plans for select
  using (auth.uid() = user_id);

create policy "Users can insert own training_plans"
  on public.training_plans for insert
  with check (auth.uid() = user_id);

create policy "Users can update own training_plans"
  on public.training_plans for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger training_plans_updated_at
  before update on public.training_plans
  for each row execute function public.set_updated_at();

-- =============================================================================
-- SESSIONS (planned runs per week)
-- =============================================================================
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.training_plans (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_number integer not null,
  phase text,
  day_of_week text not null,
  date date,
  type text not null,
  distance_km numeric(10, 2),
  target_pace_min text,
  target_pace_max text,
  target_hr_zone text,
  structure text,
  coach_notes text,
  estimated_duration_min integer,
  estimated_tss integer,
  status text not null default 'planned' check (status in ('planned', 'completed', 'missed', 'modified')),
  completed_run_id uuid references public.runs (id) on delete set null,
  modified_at timestamptz,
  modification_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sessions_plan_id_idx on public.sessions (plan_id);
create index sessions_user_id_idx on public.sessions (user_id);
create index sessions_plan_week_idx on public.sessions (plan_id, week_number);
create index sessions_date_idx on public.sessions (date) where date is not null;

comment on table public.sessions is 'Planned sessions from training plan; linked to runs when completed';

alter table public.sessions enable row level security;

create policy "Users can view own sessions"
  on public.sessions for select
  using (auth.uid() = user_id);

create policy "Users can insert own sessions"
  on public.sessions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own sessions"
  on public.sessions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own sessions"
  on public.sessions for delete
  using (auth.uid() = user_id);

create trigger sessions_updated_at
  before update on public.sessions
  for each row execute function public.set_updated_at();

-- =============================================================================
-- PLAN CONVERSATIONS (Gemini Q&A flow before generating plan)
-- =============================================================================
create table public.plan_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan_id uuid references public.training_plans (id) on delete set null,
  messages jsonb not null default '[]',
  user_answers jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index plan_conversations_user_id_idx on public.plan_conversations (user_id);

comment on table public.plan_conversations is 'Full conversation and extracted answers from plan builder flow';

alter table public.plan_conversations enable row level security;

create policy "Users can view own plan_conversations"
  on public.plan_conversations for select
  using (auth.uid() = user_id);

create policy "Users can insert own plan_conversations"
  on public.plan_conversations for insert
  with check (auth.uid() = user_id);

create policy "Users can update own plan_conversations"
  on public.plan_conversations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
