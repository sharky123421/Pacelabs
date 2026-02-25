/**
 * Supabase client for Pacelab.
 * URL and anon key from .env (via process.env or Constants.expoConfig.extra from app.config.js).
 * Anon key must be the "anon public" JWT from Supabase Dashboard → Project Settings → API (starts with eyJ).
 */
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const KEEP_LOGGED_IN_KEY = '@pacelab/keep_logged_in';

/** Default true: session is persisted. When false, session is memory-only (lost on app restart). */
async function getKeepLoggedIn() {
  try {
    const v = await AsyncStorage.getItem(KEEP_LOGGED_IN_KEY);
    return v !== 'false';
  } catch {
    return true;
  }
}

/** In-memory store for auth when "keep logged in" is off. */
const memoryAuthStore = {};

const authStorage = {
  getItem: async (key) => {
    if (!key || !key.includes('auth')) return AsyncStorage.getItem(key);
    const keep = await getKeepLoggedIn();
    if (!keep) return memoryAuthStore[key] ?? null;
    return AsyncStorage.getItem(key);
  },
  setItem: async (key, value) => {
    if (!key || !key.includes('auth')) {
      await AsyncStorage.setItem(key, value);
      return;
    }
    const keep = await getKeepLoggedIn();
    if (keep) await AsyncStorage.setItem(key, value);
    else memoryAuthStore[key] = value;
  },
  removeItem: async (key) => {
    delete memoryAuthStore[key];
    await AsyncStorage.removeItem(key);
  },
};

export async function setKeepLoggedInPreference(value) {
  await AsyncStorage.setItem(KEEP_LOGGED_IN_KEY, value ? 'true' : 'false');
}

export async function getKeepLoggedInPreference() {
  return getKeepLoggedIn();
}

function getSupabaseConfig() {
  const fromExtra = Constants.expoConfig?.extra ?? {};
  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? fromExtra.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? fromExtra.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  if (!url || !key) {
    throw new Error(
      'Missing Supabase configuration. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env and restart the app.'
    );
  }
  return { url, key };
}

const { url: supabaseUrl, key: supabaseAnonKey } = getSupabaseConfig();

/** The raw Supabase project URL (e.g. https://xyz.supabase.co). */
export function getSupabaseUrl() {
  return (supabaseUrl || '').replace(/\/$/, '');
}

/** Base URL for Supabase Edge Functions (same project as client). */
export function getSupabaseFunctionsUrl() {
  const base = getSupabaseUrl();
  return base ? `${base}/functions/v1` : '';
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
