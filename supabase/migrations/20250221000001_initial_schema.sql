-- Pacelab initial schema
-- Apply in Supabase SQL Editor or via: supabase db push
-- Replace/extend with your full app specification when ready.

-- =============================================================================
-- PROFILES (extends auth.users)
-- =============================================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'User profiles; one per auth.users row';

-- Trigger: create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger: keep updated_at in sync
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- =============================================================================
-- RUNS (core entity for RunApp)
-- =============================================================================
create table public.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  distance_meters numeric(12, 2),
  duration_seconds integer,
  title text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index runs_user_id_idx on public.runs (user_id);
create index runs_started_at_idx on public.runs (started_at desc);

comment on table public.runs is 'Individual run sessions';

create trigger runs_updated_at
  before update on public.runs
  for each row execute function public.set_updated_at();

-- =============================================================================
-- RUN POINTS (optional: GPS track for a run)
-- =============================================================================
create table public.run_points (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id) on delete cascade,
  sequence integer not null,
  lat double precision not null,
  lng double precision not null,
  elevation_meters numeric(8, 2),
  recorded_at timestamptz not null default now(),
  unique (run_id, sequence)
);

create index run_points_run_id_idx on public.run_points (run_id);

comment on table public.run_points is 'GPS points for a run track';

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================
alter table public.profiles enable row level security;
alter table public.runs enable row level security;
alter table public.run_points enable row level security;

-- Profiles: users can read all (for social) and update only their own
create policy "Profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Runs: own data only
create policy "Users can view own runs"
  on public.runs for select
  using (auth.uid() = user_id);

create policy "Users can insert own runs"
  on public.runs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own runs"
  on public.runs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own runs"
  on public.runs for delete
  using (auth.uid() = user_id);

-- Run points: through run ownership
create policy "Users can view own run points"
  on public.run_points for select
  using (
    exists (
      select 1 from public.runs r
      where r.id = run_points.run_id and r.user_id = auth.uid()
    )
  );

create policy "Users can insert own run points"
  on public.run_points for insert
  with check (
    exists (
      select 1 from public.runs r
      where r.id = run_points.run_id and r.user_id = auth.uid()
    )
  );

create policy "Users can update own run points"
  on public.run_points for update
  using (
    exists (
      select 1 from public.runs r
      where r.id = run_points.run_id and r.user_id = auth.uid()
    )
  );

create policy "Users can delete own run points"
  on public.run_points for delete
  using (
    exists (
      select 1 from public.runs r
      where r.id = run_points.run_id and r.user_id = auth.uid()
    )
  );

-- =============================================================================
-- STORAGE (optional: profile avatars, run exports)
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "Avatar images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Users can upload own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can update own avatar"
  on storage.objects for update
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can delete own avatar"
  on storage.objects for delete
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
