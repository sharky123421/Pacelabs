// Apple Health wellness sync: app sends wellness payload after reading from HealthKit.
// Invoke with: POST /functions/v1/apple-health-sync-wellness
// Body: { wellness: { date, hrv_last_night, hrv_status, resting_heart_rate, sleep_score, ... } }
import "jsr:@supabase/functions-js/edge_runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { wellness } = await req.json();
    if (!wellness || !wellness.date) {
      return new Response(JSON.stringify({ error: "Missing wellness.date" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const row = {
      user_id: user.id,
      date: wellness.date,
      hrv_last_night: wellness.hrv_last_night ?? null,
      hrv_status: wellness.hrv_status ?? null,
      resting_heart_rate: wellness.resting_heart_rate ?? null,
      sleep_score: wellness.sleep_score ?? null,
      sleep_duration_seconds: wellness.sleep_duration_seconds ?? null,
      sleep_deep_seconds: wellness.sleep_deep_seconds ?? null,
      sleep_rem_seconds: wellness.sleep_rem_seconds ?? null,
      sleep_core_seconds: wellness.sleep_core_seconds ?? null,
      sleep_awake_seconds: wellness.sleep_awake_seconds ?? null,
      apple_vo2_max: wellness.apple_vo2_max ?? null,
      move_calories: wellness.move_calories ?? null,
      move_goal: wellness.move_goal ?? null,
      exercise_minutes: wellness.exercise_minutes ?? null,
      exercise_goal: wellness.exercise_goal ?? null,
      stand_hours: wellness.stand_hours ?? null,
      stand_goal: wellness.stand_goal ?? null,
      readiness_score: wellness.readiness_score ?? null,
      readiness_verdict: wellness.readiness_verdict ?? null,
      synced_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("apple_wellness").upsert(row, { onConflict: "user_id,date" });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
