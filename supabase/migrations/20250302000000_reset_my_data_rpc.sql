-- RPC: reset_my_data — deletes all data for the calling user.
-- Runs as SECURITY DEFINER so it can delete from tables without user-facing delete policies.
-- The function still checks auth.uid() so only the logged-in user's data is removed.

create or replace function public.reset_my_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  deleted_runs int := 0;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Count runs before deleting (for confirmation message)
  select count(*) into deleted_runs from runs where user_id = uid;

  -- Child tables that reference runs (cascade handles run_points, run_datapoints, run_splits)
  delete from runs where user_id = uid;

  -- Wellness & connections
  delete from apple_wellness where user_id = uid;
  delete from apple_health_connections where user_id = uid;
  delete from strava_connections where user_id = uid;

  -- Training
  delete from sessions where user_id = uid;
  delete from training_plans where user_id = uid;
  delete from plan_conversations where user_id = uid;

  -- Chat
  delete from chat_messages where user_id = uid;

  -- Coaching engine
  delete from daily_decisions where user_id = uid;
  delete from daily_recovery where user_id = uid;
  delete from session_modifications where user_id = uid;
  delete from ai_feedback where user_id = uid;
  delete from adaptation_records where user_id = uid;
  delete from philosophy_periods where user_id = uid;
  delete from bottleneck_analyses where user_id = uid;
  delete from athlete_state where user_id = uid;
  delete from user_baselines where user_id = uid;

  -- Beginner mode
  delete from beginner_milestones where user_id = uid;
  delete from beginner_checkins where user_id = uid;

  -- Onboarding
  delete from onboarding_progress where user_id = uid;

  -- Reset profile fields (keep account)
  update profiles set
    runner_mode = 'advanced',
    beginner_started_at = null,
    beginner_completed_at = null,
    mode_switch_history = '[]'::jsonb,
    expo_push_token = null
  where id = uid;

  return jsonb_build_object('ok', true, 'deleted_runs', deleted_runs);
end;
$$;
