/**
 * Strava OAuth: open Strava authorization in browser; callback is handled by Edge Function strava-auth-callback.
 * Supabase URL from process.env. Strava Client ID from src/config/strava.js (edit that file to change it).
 */
import Constants from 'expo-constants';
import { STRAVA_CLIENT_ID } from '../config/strava';

const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/authorize';
const SCOPES = ['activity:read_all', 'read'].join(',');

function getSupabaseUrl() {
  const fromProcess = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (fromProcess != null && String(fromProcess).trim() !== '') return String(fromProcess).trim();
  const fromExtra = Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL;
  if (fromExtra != null && String(fromExtra).trim() !== '') return String(fromExtra).trim();
  return '';
}

/**
 * Opens Strava OAuth in browser. Redirect URI must be your Supabase Edge Function:
 * https://<project-ref>.supabase.co/functions/v1/strava-auth-callback
 * State should be the current user id so the callback can attach the connection.
 * @param {string} userId - auth user id (for state parameter)
 * @returns {Promise<void>}
 * @throws {Error} if userId missing, env not configured, or browser fails to open
 */
export async function openStravaOAuth(userId) {
  if (!userId) {
    throw new Error('You must be signed in to connect Strava.');
  }
  const supabaseUrl = getSupabaseUrl();
  const clientId = (STRAVA_CLIENT_ID || '').trim();
  if (!supabaseUrl || supabaseUrl.includes('your-project')) {
    throw new Error('Strava is not configured. Set EXPO_PUBLIC_SUPABASE_URL in .env.');
  }
  if (!clientId) {
    throw new Error('Strava Client ID missing. Edit src/config/strava.js and set STRAVA_CLIENT_ID.');
  }
  const baseUrl = supabaseUrl.replace(/\/$/, '');
  const callbackUrl = `${baseUrl}/functions/v1/strava-auth-callback`;
  const url = `${STRAVA_AUTH_URL}?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&scope=${encodeURIComponent(SCOPES)}&state=${encodeURIComponent(userId)}`;
  try {
    const WebBrowser = await import('expo-web-browser');
    await WebBrowser.openBrowserAsync(url);
  } catch (e) {
    throw new Error(e?.message ? `Could not open Strava: ${e.message}` : 'Could not open Strava. Try again.');
  }
}

export function getStravaCallbackDomain() {
  const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/$/, '');
  if (!supabaseUrl || supabaseUrl.includes('your-project')) return '';
  return supabaseUrl.replace(/^https?:\/\//, '').split('/')[0];
}
