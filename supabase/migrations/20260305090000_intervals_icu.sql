-- Intervals.icu connection table.
-- Stores per-user API key and athlete id for importing activities into Pacelab.

create table public.intervals_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade unique,
  athlete_id bigint not null,
  api_key text not null,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index intervals_connections_user_id_idx on public.intervals_connections (user_id);
create index intervals_connections_athlete_id_idx on public.intervals_connections (athlete_id);

comment on table public.intervals_connections is 'Intervals.icu API key and athlete id per user';

alter table public.intervals_connections enable row level security;

create policy "Users can view own intervals_connections"
  on public.intervals_connections for select
  using (auth.uid() = user_id);

create policy "Users can insert own intervals_connections"
  on public.intervals_connections for insert
  with check (auth.uid() = user_id);

create policy "Users can update own intervals_connections"
  on public.intervals_connections for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own intervals_connections"
  on public.intervals_connections for delete
  using (auth.uid() = user_id);

create trigger intervals_connections_updated_at
  before update on public.intervals_connections
  for each row execute function public.set_updated_at();

