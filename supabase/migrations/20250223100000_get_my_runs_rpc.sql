-- RPCs so the app always uses auth.uid() for runs (avoids user_id mismatch).
-- Run in Supabase SQL Editor or: supabase db push

-- Stats for Profile: total runs, total distance km, total duration seconds
create or replace function public.get_my_run_stats()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'total_runs', count(*)::int,
    'total_distance_km', coalesce(sum(distance_meters), 0) / 1000.0,
    'total_duration_seconds', coalesce(sum(duration_seconds), 0)::bigint
  )
  from runs
  where user_id = auth.uid() and deleted_at is null;
$$;

-- List of runs for current user (for Runs tab)
create or replace function public.get_my_runs()
returns setof runs
language sql
stable
security definer
set search_path = public
as $$
  select *
  from runs
  where user_id = auth.uid() and deleted_at is null
  order by started_at desc;
$$;

grant execute on function public.get_my_run_stats() to authenticated;
grant execute on function public.get_my_run_stats() to anon;
grant execute on function public.get_my_runs() to authenticated;
grant execute on function public.get_my_runs() to anon;

comment on function public.get_my_run_stats() is 'Returns run stats for current auth.uid()';
comment on function public.get_my_runs() is 'Returns runs for current auth.uid()';
