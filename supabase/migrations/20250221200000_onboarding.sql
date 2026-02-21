-- Onboarding progress: persist step and payload so user can resume
create table public.onboarding_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade unique,
  current_step text not null default 'path_selection',
  path text check (path in ('strava', 'manual')),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index onboarding_progress_user_id_idx on public.onboarding_progress (user_id);

comment on table public.onboarding_progress is 'Onboarding state: step, path (strava|manual), questionnaire/gpx/etc in payload';

alter table public.onboarding_progress enable row level security;

create policy "Users can view own onboarding"
  on public.onboarding_progress for select
  using (auth.uid() = user_id);

create policy "Users can insert own onboarding"
  on public.onboarding_progress for insert
  with check (auth.uid() = user_id);

create policy "Users can update own onboarding"
  on public.onboarding_progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger onboarding_progress_updated_at
  before update on public.onboarding_progress
  for each row execute function public.set_updated_at();
