import { Alert } from 'react-native';
import { supabase, getSupabaseFunctionsUrl } from '../lib/supabase';

/**
 * Upserts the Intervals.icu connection for the current user.
 * The user needs to provide their Intervals.icu athlete id and API key (from Developer Settings).
 */
export async function saveIntervalsConnection({ athleteId, apiKey }) {
  if (!athleteId || !apiKey) {
    throw new Error('Athlete ID and API key are required.');
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error(authError?.message || 'You must be signed in.');
  }

  const userId = user.id;

  const { error } = await supabase
    .from('intervals_connections')
    .upsert(
      {
        user_id: userId,
        athlete_id: athleteId.trim(),
        api_key: apiKey.trim(),
        is_active: true,
      },
      { onConflict: 'user_id' },
    );

  if (error) {
    throw new Error(error.message || 'Could not save Intervals.icu connection.');
  }
}

export async function getIntervalsConnection() {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error(authError?.message || 'You must be signed in.');
  }

  const { data, error } = await supabase
    .from('intervals_connections')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) throw new Error(error.message || 'Could not load Intervals.icu connection.');
  return data;
}

export async function disconnectIntervals() {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error(authError?.message || 'You must be signed in.');
  }

  const { error } = await supabase
    .from('intervals_connections')
    .update({ is_active: false })
    .eq('user_id', user.id);

  if (error) throw new Error(error.message || 'Could not disconnect Intervals.icu.');
}

export async function syncIntervalsNow() {
  const functionsUrl = getSupabaseFunctionsUrl();
  if (!functionsUrl) {
    throw new Error('Supabase Functions URL is not configured.');
  }

  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    throw new Error(refreshError.message || 'Session expired. Please sign in again.');
  }

  const {
    data: { session },
    error: authError,
  } = await supabase.auth.getSession();
  if (authError || !session || !session.access_token) {
    throw new Error(authError?.message || 'You must be signed in.');
  }

  const res = await fetch(`${functionsUrl}/intervals-sync-manual`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    // ignore
  }

  if (!res.ok) {
    const msg = payload?.error || `Intervals.icu sync failed (${res.status})`;
    throw new Error(msg);
  }

  return payload;
}

