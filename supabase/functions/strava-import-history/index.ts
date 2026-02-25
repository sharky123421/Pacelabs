// Strava history import: fetch all activities page by page, filter runs, process in batches.
// POST /functions/v1/strava-import-history
// Body: { user_id: string, full_import?: boolean, page?: number }
// Rate limit: 100/15min, 1000/day; batch of 10, pause when approaching limit.
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

const BATCH_SIZE = 10;
const PER_PAGE = 100;
const RATE_LIMIT_15MIN = 100;
const RATE_LIMIT_SAFE = 80;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const body = await req.json().catch(() => ({}));
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id ?? body.user_id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceSupabase = createClient(supabaseUrl, serviceKey);
    const { data: conn, error: connError } = await serviceSupabase
      .from("strava_connections")
      .select("*")
      .eq("user_id", userId)
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

    let requestCount = 0;
    let page = 1;
    let totalProcessed = 0;
    let totalSkipped = 0;

    while (true) {
      if (requestCount >= RATE_LIMIT_SAFE) {
        return new Response(
          JSON.stringify({
            ok: true,
            paused: true,
            message: "Import paused — resuming in next window",
            totalProcessed,
            totalSkipped,
            requestCount,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const activities = await getStravaAthleteActivities(accessToken, {
        page,
        per_page: PER_PAGE,
      });
      requestCount += 1;

      if (!activities || activities.length === 0) break;

      const runs = activities.filter((a) => isRunType(a.type));
      for (let i = 0; i < runs.length; i += BATCH_SIZE) {
        const batch = runs.slice(i, i + BATCH_SIZE);
        for (const summary of batch) {
          if (requestCount >= RATE_LIMIT_SAFE) break;
          const { data: existingRun } = await serviceSupabase
            .from("runs")
            .select("id")
            .eq("user_id", userId)
            .eq("strava_activity_id", summary.id)
            .is("deleted_at", null)
            .maybeSingle();
          if (existingRun?.id) {
            totalSkipped += 1;
            continue;
          }
          try {
            const activity = await getStravaActivity(accessToken, summary.id);
            requestCount += 1;
            if (!isRunType(activity.type)) continue;
            const streams = await getStravaStreams(accessToken, summary.id).catch(() => ({}));
            requestCount += 1;
            const { runRow, datapoints, splits } = processStravaRun(activity, streams);
            runRow.user_id = userId;
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
            if (insertErr || !run) continue;
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
            totalProcessed += 1;
          } catch (e) {
            console.error("Process run error:", e);
          }
        }
      }

      if (activities.length < PER_PAGE) break;
      page += 1;
    }

    await serviceSupabase
      .from("strava_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", conn.id);

    return new Response(
      JSON.stringify({
        ok: true,
        totalProcessed,
        totalSkipped,
        requestCount,
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
