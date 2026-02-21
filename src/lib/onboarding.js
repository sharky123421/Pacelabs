/**
 * Onboarding progress: persist and resume from Supabase
 */
import { supabase } from './supabase';

const STEP_PATH_SELECTION = 'path_selection';
const STEP_STRAVA_OAUTH = 'strava_oauth';
const STEP_IMPORT_PROGRESS = 'import_progress';
const STEP_QUESTIONNAIRE = 'questionnaire';
const STEP_GPX_IMPORT = 'gpx_import';
const STEP_AI_ANALYSIS = 'ai_analysis';
const STEP_PROFILE_REVEAL = 'profile_reveal';
const STEP_GOAL_SETTING = 'goal_setting';
const STEP_PLAN_GENERATION = 'plan_generation';
const STEP_COMPLETED = 'completed';

export const ONBOARDING_STEPS = {
  STEP_PATH_SELECTION,
  STEP_STRAVA_OAUTH,
  STEP_IMPORT_PROGRESS,
  STEP_QUESTIONNAIRE,
  STEP_GPX_IMPORT,
  STEP_AI_ANALYSIS,
  STEP_PROFILE_REVEAL,
  STEP_GOAL_SETTING,
  STEP_PLAN_GENERATION,
  STEP_COMPLETED,
};

export async function getOnboardingProgress(userId) {
  const { data, error } = await supabase
    .from('onboarding_progress')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertOnboardingProgress(userId, { current_step, path, payload = {} }) {
  const { data, error } = await supabase
    .from('onboarding_progress')
    .upsert(
      {
        user_id: userId,
        current_step,
        path: path ?? undefined,
        payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateOnboardingPayload(userId, payloadUpdate) {
  const existing = await getOnboardingProgress(userId);
  const payload = { ...(existing?.payload ?? {}), ...payloadUpdate };
  return upsertOnboardingProgress(userId, {
    current_step: existing?.current_step ?? STEP_PATH_SELECTION,
    path: existing?.path,
    payload,
  });
}

export async function setOnboardingStep(userId, step, { path, payload } = {}) {
  const existing = await getOnboardingProgress(userId);
  return upsertOnboardingProgress(userId, {
    current_step: step,
    path: path ?? existing?.path,
    payload: payload ?? existing?.payload ?? {},
  });
}
