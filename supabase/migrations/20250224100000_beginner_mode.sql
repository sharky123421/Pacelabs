-- Beginner Mode: add runner_mode and related fields

-- Extend profiles
alter table profiles
  add column if not exists runner_mode text not null default 'advanced'
    check (runner_mode in ('beginner', 'advanced')),
  add column if not exists beginner_started_at timestamptz,
  add column if not exists beginner_completed_at timestamptz,
  add column if not exists mode_switch_history jsonb default '[]'::jsonb;

-- Extend training_plans
alter table training_plans
  add column if not exists plan_type text not null default 'advanced'
    check (plan_type in ('beginner', 'advanced')),
  add column if not exists is_time_based boolean not null default false;

-- Extend sessions
alter table sessions
  add column if not exists is_time_based boolean not null default false,
  add column if not exists duration_target_min integer,
  add column if not exists run_walk_intervals jsonb,
  add column if not exists distance_target_km numeric;

-- Beginner milestones tracking
create table if not exists beginner_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  milestone_key text not null,
  unlocked_at timestamptz not null default now(),
  unique (user_id, milestone_key)
);

alter table beginner_milestones enable row level security;

create policy "Users see own milestones"
  on beginner_milestones for select using (auth.uid() = user_id);
create policy "Users insert own milestones"
  on beginner_milestones for insert with check (auth.uid() = user_id);

-- Beginner check-ins (simplified daily feedback)
create table if not exists beginner_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null default current_date,
  feeling text check (feeling in ('tired', 'ok', 'good', 'great')),
  post_run_effort text check (post_run_effort in ('really_hard', 'hard', 'ok', 'good', 'easy')),
  post_run_completed text check (post_run_completed in ('all', 'most', 'some', 'no')),
  post_run_feeling text check (post_run_feeling in ('exhausted', 'tired_good', 'good', 'energized')),
  ai_encouragement text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

alter table beginner_checkins enable row level security;

create policy "Users see own checkins"
  on beginner_checkins for select using (auth.uid() = user_id);
create policy "Users insert own checkins"
  on beginner_checkins for insert with check (auth.uid() = user_id);
create policy "Users update own checkins"
  on beginner_checkins for update using (auth.uid() = user_id);
