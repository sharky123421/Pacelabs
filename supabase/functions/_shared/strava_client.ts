/**
 * Strava API client and token refresh for Edge Functions.
 * Uses SUPABASE_SERVICE_ROLE_KEY to read/update strava_connections.
 */

const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const STRAVA_API_BASE = "https://www.strava.com/api/v3";

export interface StravaConnection {
  id: string;
  user_id: string;
  strava_athlete_id: number;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
  scope: string | null;
  is_active: boolean;
}

/** Refresh token if expires within 5 minutes; returns valid access_token. */
export async function ensureValidToken(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  connection: StravaConnection
): Promise<string> {
  const expiresAt = new Date(connection.token_expires_at).getTime();
  const fiveMin = 5 * 60 * 1000;
  if (Date.now() + fiveMin < expiresAt) return connection.access_token;

  const clientId = Deno.env.get("STRAVA_CLIENT_ID");
  const clientSecret = Deno.env.get("STRAVA_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("Missing STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET");

  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: connection.refresh_token,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Strava token refresh failed: ${res.status} ${t}`);
  }
  const data = await res.json();
  const newExpires = new Date(data.expires_at * 1000).toISOString();
  await supabase
    .from("strava_connections")
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? connection.refresh_token,
      token_expires_at: newExpires,
    })
    .eq("id", connection.id);
  return data.access_token;
}

export async function stravaFetch(
  accessToken: string,
  path: string,
  opts: RequestInit = {}
): Promise<Response> {
  const url = path.startsWith("http") ? path : `${STRAVA_API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  return fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...opts.headers,
    },
  });
}

/** GET activity by id. */
export async function getStravaActivity(accessToken: string, activityId: number): Promise<StravaActivity> {
  const res = await stravaFetch(accessToken, `/activities/${activityId}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error("Activity not found");
    throw new Error(`Strava API: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/** GET activity streams. keys: latlng,time,heartrate,cadence,watts,altitude,velocity_smooth */
export async function getStravaStreams(
  accessToken: string,
  activityId: number,
  keys: string[] = ["latlng", "time", "heartrate", "cadence", "altitude", "velocity_smooth"]
): Promise<StravaStreamSet> {
  const res = await stravaFetch(accessToken, `/activities/${activityId}/streams?keys=${keys.join(",")}`);
  if (!res.ok) {
    if (res.status === 404) return {};
    return {};
  }
  const arr = await res.json();
  const out: StravaStreamSet = {};
  for (const s of Array.isArray(arr) ? arr : []) {
    if (s.type && s.data) out[s.type] = s.data;
  }
  return out;
}

/** GET athlete activities (paginated). */
export async function getStravaAthleteActivities(
  accessToken: string,
  opts: { after?: number; before?: number; page?: number; per_page?: number } = {}
): Promise<StravaActivitySummary[]> {
  const params = new URLSearchParams();
  if (opts.after != null) params.set("after", String(opts.after));
  if (opts.before != null) params.set("before", String(opts.before));
  params.set("page", String(opts.page ?? 1));
  params.set("per_page", String(opts.per_page ?? 100));
  const res = await stravaFetch(accessToken, `/athlete/activities?${params}`);
  if (!res.ok) throw new Error(`Strava API: ${res.status} ${await res.text()}`);
  return res.json();
}

// Types matching Strava API v3
export interface StravaActivitySummary {
  id: number;
  name: string;
  type: string;
  sport_type?: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain?: number;
  start_date: string;
  start_date_local?: string;
  average_speed?: number;
  max_speed?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  has_heartrate?: boolean;
  private?: boolean;
}

export interface StravaActivity extends StravaActivitySummary {
  description?: string;
  splits_metric?: Array<{ distance: number; elapsed_time: number; moving_time?: number; pace_zone?: number }>;
  splits_standard?: unknown[];
  map?: { id: string; summary_polyline?: string; polyline?: string };
  start_latlng?: [number, number];
  end_latlng?: [number, number];
  calories?: number;
  device_name?: string;
  workout_type?: number;
}

export type StravaStreamSet = Record<
  string,
  number[] | [number, number][] | number[][] // time, latlng, heartrate, etc.
>;
