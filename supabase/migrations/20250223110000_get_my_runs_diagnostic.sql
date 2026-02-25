-- Diagnostic RPC: returns auth_uid and run_count for the current request (for debugging "0 runs").
-- Run in Supabase SQL Editor if you need to add this after the fact.
create or replace function public.get_my_run_diagnostic()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'auth_uid', auth.uid(),
    'run_count', (select count(*)::int from runs where user_id = auth.uid() and deleted_at is null)
  );
$$;
grant execute on function public.get_my_run_diagnostic() to authenticated;
grant execute on function public.get_my_run_diagnostic() to anon;
