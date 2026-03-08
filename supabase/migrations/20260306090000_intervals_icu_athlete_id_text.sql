-- Change intervals_connections.athlete_id from bigint to text
-- to support Intervals.icu IDs like "i402892".

alter table public.intervals_connections
  alter column athlete_id type text using athlete_id::text;

drop index if exists intervals_connections_athlete_id_idx;
create index intervals_connections_athlete_id_idx on public.intervals_connections (athlete_id);

