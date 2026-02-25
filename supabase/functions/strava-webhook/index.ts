// Strava webhook: verification (GET) and event handling (POST).
// Endpoint: POST/GET /functions/v1/strava-webhook
// Respond 200 within 2s; process create/update/delete/athlete events.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getStravaActivity,
  getStravaStreams,
  ensureValidToken,
  type StravaConnection,
} from "../_shared/strava_client.ts";
import {
  processStravaRun,
  isRunType,
  type ProcessStravaRunResult,
} from "../_shared/process_strava_run.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
};

interface WebhookEvent {
  object_type: "activity" | "athlete";
  object_id: number;
  aspect_type: "create" | "update" | "delete";
  owner_id: number;
  subscription_id: number;
  event_time: number;
  updates?: Record<string, unknown>;
}

function jsonResponse(body: object, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function validateSignature(body: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature || !secret) return true;
  const crypto = globalThis.crypto;
  if (!crypto?.subtle) return true;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256=${hex}` === signature;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceKey);

  // ----- Step 1: Webhook verification (GET) -----
  if (req.method === "GET") {
    const challenge = url.searchParams.get("hub.challenge");
    const mode = url.searchParams.get("hub.mode");
    const verifyToken = url.searchParams.get("hub.verify_token");
    const expectedToken = Deno.env.get("STRAVA_VERIFY_TOKEN");
    if (mode === "subscribe" && typeof challenge === "string") {
      if (expectedToken && verifyToken !== expectedToken) {
        return jsonResponse({ error: "Invalid verify_token" }, 400);
      }
      return jsonResponse({ "hub.challenge": challenge }, 200);
    }
    return jsonResponse({ error: "Expected hub.mode=subscribe and hub.challenge" }, 400);
  }

  // ----- Step 2: Handle POST event -----
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  const webhookSecret = Deno.env.get("STRAVA_WEBHOOK_SECRET");
  if (webhookSecret && signature) {
    const valid = await validateSignature(rawBody, signature, webhookSecret);
    if (!valid) return jsonResponse({ error: "Invalid signature" }, 401);
  }

  let event: WebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const { object_type, aspect_type, object_id, owner_id } = event;

  // Acknowledge immediately (Strava requires 200 within 2s); then process.
  // Process synchronously to avoid losing work; keep processing fast.
  if (object_type === "athlete") {
    if (aspect_type === "delete" || (event.updates as Record<string, string>)?.["authorized"] === "false") {
      const { error } = await supabase
        .from("strava_connections")
        .update({
          is_active: false,
          access_token: "",
          refresh_token: "",
        })
        .eq("strava_athlete_id", owner_id);
      if (error) console.error("Strava deauthorize update error:", error);
    }
    return jsonResponse({ ok: true }, 200);
  }

  if (object_type !== "activity") {
    return jsonResponse({ ok: true }, 200);
  }

  switch (aspect_type) {
    case "create": {
      const conn = await getConnectionByAthlete(supabase, owner_id);
      if (!conn) return jsonResponse({ ok: true }, 200);
      let accessToken: string;
      try {
        accessToken = await ensureValidToken(supabase, conn);
      } catch (e) {
        console.error("Token refresh failed:", e);
        return jsonResponse({ ok: false, error: "Token refresh failed" }, 200);
      }
      let activity;
      try {
        activity = await getStravaActivity(accessToken, object_id);
      } catch (e) {
        console.error("Fetch activity failed:", e);
        return jsonResponse({ ok: true }, 200);
      }
      if (!isRunType(activity.type)) return jsonResponse({ ok: true }, 200);
      const { data: existingRun } = await supabase
        .from("runs")
        .select("id")
        .eq("user_id", conn.user_id)
        .eq("strava_activity_id", object_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (existingRun?.id) return jsonResponse({ ok: true, duplicate: true }, 200);
      const streams = await getStravaStreams(accessToken, object_id).catch(() => ({}));
      const { runRow, datapoints, splits } = processStravaRun(activity, streams);
      runRow.user_id = conn.user_id;
      const { data: run, error: insertRunError } = await supabase
        .from("runs")
        .insert({
          user_id: runRow.user_id,
          source: runRow.source,
          source_app: runRow.source_app,
          external_id: runRow.external_id,
          strava_activity_id: runRow.strava_activity_id,
          started_at: runRow.started_at,
          ended_at: runRow.ended_at,
          distance_meters: runRow.distance_meters,
          duration_seconds: runRow.duration_seconds,
          title: runRow.title,
          notes: runRow.notes,
          avg_hr: runRow.avg_hr,
          avg_cadence: runRow.avg_cadence,
          calories: runRow.calories,
          route_coordinates: runRow.route_coordinates,
          tss: runRow.tss,
          trimp: runRow.trimp,
          intensity_factor: runRow.intensity_factor,
          efficiency_factor: runRow.efficiency_factor,
        })
        .select("id")
        .single();
      if (insertRunError || !run) {
        console.error("Insert run error:", insertRunError);
        return jsonResponse({ ok: false }, 200);
      }
      if (datapoints.length > 0) {
        await supabase.from("run_datapoints").insert(
          datapoints.map((d) => ({
            run_id: run.id,
            sequence: d.sequence,
            time_offset_seconds: d.time_offset_seconds,
            lat: d.lat,
            lng: d.lng,
            heartrate: d.heartrate,
            cadence: d.cadence,
            altitude: d.altitude,
            velocity_smooth: d.velocity_smooth,
            watts: d.watts,
          }))
        );
      }
      if (splits.length > 0) {
        await supabase.from("run_splits").insert(
          splits.map((s) => ({
            run_id: run.id,
            split_index: s.split_index,
            distance_meters: s.distance_meters,
            elapsed_seconds: s.elapsed_seconds,
            moving_seconds: s.moving_seconds,
            pace_seconds_per_km: s.pace_seconds_per_km,
            elevation_gain_meters: s.elevation_gain_meters,
          }))
        );
      }
      await supabase
        .from("strava_connections")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", conn.id);
      sendPushNotification(supabase, conn.user_id, run.id, runRow).catch((e) =>
        console.error("Push failed:", e)
      );
      return jsonResponse({ ok: true, run_id: run.id }, 200);
    }

    case "update": {
      const conn = await getConnectionByAthlete(supabase, owner_id);
      if (!conn) return jsonResponse({ ok: true }, 200);
      const { data: run } = await supabase
        .from("runs")
        .select("id")
        .eq("strava_activity_id", object_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (!run?.id) return jsonResponse({ ok: true }, 200);
      let accessToken: string;
      try {
        accessToken = await ensureValidToken(supabase, conn);
      } catch {
        return jsonResponse({ ok: true }, 200);
      }
      let activity;
      try {
        activity = await getStravaActivity(accessToken, object_id);
      } catch {
        return jsonResponse({ ok: true }, 200);
      }
      if (!isRunType(activity.type)) return jsonResponse({ ok: true }, 200);
      const streams = await getStravaStreams(accessToken, object_id).catch(() => ({}));
      const { runRow, datapoints, splits } = processStravaRun(activity, streams);
      await supabase
        .from("runs")
        .update({
          started_at: runRow.started_at,
          ended_at: runRow.ended_at,
          distance_meters: runRow.distance_meters,
          duration_seconds: runRow.duration_seconds,
          title: runRow.title,
          notes: runRow.notes,
          avg_hr: runRow.avg_hr,
          avg_cadence: runRow.avg_cadence,
          calories: runRow.calories,
          route_coordinates: runRow.route_coordinates,
          tss: runRow.tss,
          trimp: runRow.trimp,
          intensity_factor: runRow.intensity_factor,
          efficiency_factor: runRow.efficiency_factor,
        })
        .eq("id", run.id);
      await supabase.from("run_datapoints").delete().eq("run_id", run.id);
      if (datapoints.length > 0) {
        await supabase.from("run_datapoints").insert(
          datapoints.map((d) => ({
            run_id: run.id,
            sequence: d.sequence,
            time_offset_seconds: d.time_offset_seconds,
            lat: d.lat,
            lng: d.lng,
            heartrate: d.heartrate,
            cadence: d.cadence,
            altitude: d.altitude,
            velocity_smooth: d.velocity_smooth,
            watts: d.watts,
          }))
        );
      }
      await supabase.from("run_splits").delete().eq("run_id", run.id);
      if (splits.length > 0) {
        await supabase.from("run_splits").insert(
          splits.map((s) => ({
            run_id: run.id,
            split_index: s.split_index,
            distance_meters: s.distance_meters,
            elapsed_seconds: s.elapsed_seconds,
            moving_seconds: s.moving_seconds,
            pace_seconds_per_km: s.pace_seconds_per_km,
            elevation_gain_meters: s.elevation_gain_meters,
          }))
        );
      }
      return jsonResponse({ ok: true, run_id: run.id }, 200);
    }

    case "delete": {
      const { error } = await supabase
        .from("runs")
        .update({ deleted_at: new Date().toISOString() })
        .eq("strava_activity_id", object_id);
      if (error) console.error("Soft delete error:", error);
      return jsonResponse({ ok: true }, 200);
    }

    default:
      return jsonResponse({ ok: true }, 200);
  }
});

async function getConnectionByAthlete(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  stravaAthleteId: number
): Promise<StravaConnection | null> {
  const { data } = await supabase
    .from("strava_connections")
    .select("*")
    .eq("strava_athlete_id", stravaAthleteId)
    .eq("is_active", true)
    .single();
  return data;
}

async function sendPushNotification(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
  runId: string,
  runRow: ProcessStravaRunResult["runRow"]
): Promise<void> {
  const expoToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  const { data: profile } = await supabase.from("profiles").select("expo_push_token").eq("id", userId).single();
  const token = profile?.expo_push_token;
  if (!token || !expoToken) return;
  const distKm = (runRow.distance_meters / 1000).toFixed(1);
  const paceSec = runRow.duration_seconds && runRow.distance_meters
    ? runRow.duration_seconds / (runRow.distance_meters / 1000)
    : 0;
  const paceMin = Math.floor(paceSec / 60);
  const paceSecRem = Math.round(paceSec % 60);
  const paceStr = `${paceMin}:${paceSecRem.toString().padStart(2, "0")}/km`;
  const body = `${distKm}km · ${paceStr} · Analyzed by Pacelab`;
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      Authorization: `Bearer ${expoToken}`,
    },
    body: JSON.stringify({
      to: token,
      title: "Run synced ✓",
      body,
      data: { runId, screen: "RunDetail", params: { id: runId } },
    }),
  });
  if (!res.ok) throw new Error(`Expo push: ${res.status} ${await res.text()}`);
}
