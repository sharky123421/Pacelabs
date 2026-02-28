/**
 * Today session adaptation: call analyze-today-session edge function,
 * save user choice and session modifications.
 * Uses supabase.functions.invoke() so apikey + Authorization are set correctly (avoids 401).
 */
import { supabase } from '../lib/supabase';

function getTodayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Get session for the current user. Requires auth session.
 * @param {object} options
 * @param {object} [options.manual_wellness] - { sleep_quality: 1-5, energy: 1-5, soreness: 1-4 }
 * @param {boolean} [options.force_refresh] - Skip cache and re-run AI
 * @returns {Promise<{ decision: object, planned_session: object|null, reasoning: object, recovery_score: number, recovery_status: string, cached: boolean }>}
 */
const AUTH_401_MESSAGE = 'Servern godkänner inte inloggningen (401). Kontrollera att EXPO_PUBLIC_SUPABASE_URL och EXPO_PUBLIC_SUPABASE_ANON_KEY i .env matchar Supabase-projektet där Edge-funktionen är deployad. Logga sedan ut och in igen.';

export async function fetchTodaySessionDecision({ manual_wellness = null, force_refresh = false } = {}) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message || 'Kunde inte hämta session');
  if (!session?.access_token) throw new Error('Du måste vara inloggad. Logga in igen.');

  const body = {
    manual_wellness: manual_wellness || undefined,
    force_refresh: force_refresh || undefined,
  };

  let data;
  let error;
  let attempt = 0;
  const maxAttempts = 2;

  while (attempt < maxAttempts) {
    const result = await supabase.functions.invoke('analyze-today-session', {
      method: 'POST',
      body,
    });
    data = result.data;
    error = result.error;
    const status = error?.context?.status ?? error?.response?.status;
    const msg = error?.message || String(error || '');
    const is401 = status === 401 || msg.includes('401') || msg.includes('Unauthorized') || msg.includes('JWT');

    if (!error) break;
    if (is401 && attempt === 0) {
      const { error: refreshErr } = await supabase.auth.refreshSession();
      if (!refreshErr) {
        attempt++;
        continue;
      }
    }
    if (is401) throw new Error(AUTH_401_MESSAGE);
    throw new Error(msg);
  }

  if (data?.error) {
    const err = data.error;
    if (typeof err === 'string') throw new Error(err);
    throw new Error(err.message || JSON.stringify(err));
  }

  if (!data) {
    throw new Error('Inget svar från servern. Försök igen.');
  }

  return data;
}

/**
 * Save user's choice for today's session (accepted / modified / declined).
 * Upserts so the choice is stored even when no daily_recovery row exists yet.
 * @param {'accepted' | 'modified' | 'declined'} userChoice
 */
export async function saveUserChoice(userChoice) {
  const today = getTodayISO();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const row = {
    user_id: user.id,
    date: today,
    user_choice: userChoice,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('daily_recovery')
    .upsert(row, { onConflict: 'user_id,date' });

  if (error) throw new Error(error.message);
}

/**
 * Record a session modification (when user accepts AI-modified or replaced session).
 * @param {object} params
 * @param {string} [params.session_id]
 * @param {string} params.original_type
 * @param {number} [params.original_distance]
 * @param {string} [params.original_pace_target]
 * @param {string} params.modified_type
 * @param {number} [params.modified_distance]
 * @param {string} [params.modified_pace_target]
 * @param {string} [params.modification_reason]
 * @param {number} [params.recovery_score_at_modification]
 * @param {string} [params.ai_reasoning]
 */
export async function saveSessionModification({
  session_id,
  original_type,
  original_distance,
  original_pace_target,
  modified_type,
  modified_distance,
  modified_pace_target,
  modification_reason,
  recovery_score_at_modification,
  ai_reasoning,
}) {
  const today = getTodayISO();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('session_modifications').insert({
    user_id: user.id,
    session_id: session_id || null,
    date: today,
    original_type: original_type || null,
    original_distance: original_distance ?? null,
    original_pace_target: original_pace_target || null,
    modified_type: modified_type || null,
    modified_distance: modified_distance ?? null,
    modified_pace_target: modified_pace_target || null,
    modification_reason: modification_reason || null,
    recovery_score_at_modification: recovery_score_at_modification ?? null,
    ai_reasoning: ai_reasoning || null,
  });

  if (error) throw new Error(error.message);
}

/**
 * Get today's daily_recovery row (AI decision + user choice) if any.
 */
export async function getTodayRecovery() {
  const today = getTodayISO();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('daily_recovery')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', today)
    .maybeSingle();

  if (error) return null;
  return data;
}

/**
 * Get user baselines to know if we have enough data (e.g. 14+ days).
 */
export async function getBaselines() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('user_baselines')
    .select('calculated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return null;
  return data;
}
