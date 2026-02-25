// Manual "Sync now": fetch activities (full history on manual sync), process same as webhook create.
// POST /functions/v1/strava-sync-manual
// Headers: Authorization: Bearer <user JWT>
// Body (optional): { "full_sync": true } – always use to get latest runs when user presses Sync now
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getStravaAthleteActivities,
  getStravaActivity,
  getStravaStreams,
  ensureValidToken,
  type StravaConnection,
} from "../_shared/strava_client.ts";
import { processStravaRun, isRunType } from "../_shared/process_strava_run.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    let fullSync = false;
    try {
      const body = await req.clone().json().catch(() => ({}));
      fullSync = !!(body && (body as { full_sync?: boolean }).full_sync);
    } catch (_) {}

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceSupabase = createClient(supabaseUrl, serviceKey);
    const { data: conn, error: connError } = await serviceSupabase
      .from("strava_connections")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (connError || !conn) {
      return new Response(JSON.stringify({ error: "No active Strava connection" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let accessToken: string;
    try {
      accessToken = await ensureValidToken(serviceSupabase, conn as StravaConnection);
    } catch (e) {
      return new Response(JSON.stringify({ error: "Token refresh failed" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lastSynced = conn.last_synced_at ? Math.floor(new Date(conn.last_synced_at).getTime() / 1000) : 0;
    const after = fullSync ? 0 : lastSynced;
    let activities: Awaited<ReturnType<typeof getStravaAthleteActivities>>;
    try {
      activities = await getStravaAthleteActivities(accessToken, {
        after,
        per_page: 100,
      });
    } catch (e) {
      const msg = String(e?.message ?? e);
      if (msg.includes("429") || /rate limit/i.test(msg)) {
        return new Response(
          JSON.stringify({ error: "Strava rate limit – try again in about 15 minutes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw e;
    }

    const runs = activities.filter((a) => isRunType(a.type));
    let synced = 0;
    const insertErrors: string[] = [];
    for (const summary of runs) {
      const { data: existingRun } = await serviceSupabase
        .from("runs")
        .select("id")
        .eq("user_id", user.id)
        .eq("strava_activity_id", summary.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (existingRun?.id) continue;
      try {
        const activity = await getStravaActivity(accessToken, summary.id);
        if (!isRunType(activity.type)) continue;
        const streams = await getStravaStreams(accessToken, summary.id).catch(() => ({}));
        const { runRow, datapoints, splits } = processStravaRun(activity, streams);
        runRow.user_id = user.id;
        const { data: run, error: insertErr } = await serviceSupabase
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
        if (insertErr || !run) {
          if (insertErr) insertErrors.push(insertErr.message ?? String(insertErr));
          continue;
        }
        if (datapoints.length > 0) {
          await serviceSupabase.from("run_datapoints").insert(
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
          await serviceSupabase.from("run_splits").insert(
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
        synced += 1;
      } catch (e) {
        const msg = String(e?.message ?? e);
        if (msg.includes("429") || /rate limit/i.test(msg)) {
          return new Response(
            JSON.stringify({ error: "Strava rate limit – try again in about 15 minutes." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        console.error("Sync run error:", e);
      }
    }

    await serviceSupabase
      .from("strava_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", conn.id);

    return new Response(
      JSON.stringify({
        ok: true,
        synced,
        totalActivities: activities.length,
        runActivities: runs.length,
        insertErrors: insertErrors.length ? insertErrors.slice(0, 3) : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
