// Calculate user baselines from wellness history (HRV, RHR, sleep). Run weekly or after 14+ days data.
// POST /functions/v1/calculate-user-baselines
// Body (optional): { user_id?: string } — defaults to authenticated user
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: object, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function mean(arr: (number | null)[]): number | null {
  const v = arr.filter((x): x is number => x != null);
  if (v.length === 0) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function std(arr: (number | null)[]): number | null {
  const m = mean(arr);
  if (m == null) return null;
  const v = arr.filter((x): x is number => x != null);
  if (v.length < 2) return null;
  const variance = v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length;
  return Math.sqrt(variance);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);

    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const authClient = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: userError } = await authClient.auth.getUser(jwt);
    if (userError || !user) return jsonResponse({ error: "Unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    const userId = (body.user_id as string) || user?.id;
    if (!userId) return jsonResponse({ error: "user_id required" }, 400);

    const supabaseService = createClient(supabaseUrl, serviceKey);

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const sixtyStr = sixtyDaysAgo.toISOString().slice(0, 10);

    const { data: rows, error: fetchErr } = await supabaseService
      .from("apple_wellness")
      .select("date, hrv_last_night, resting_heart_rate, sleep_score, sleep_duration_seconds, sleep_deep_seconds")
      .eq("user_id", userId)
      .gte("date", sixtyStr)
      .order("date", { ascending: true });

    if (fetchErr) return jsonResponse({ error: fetchErr.message }, 400);

    const hrv = (rows || []).map((r) => r.hrv_last_night);
    const rhr = (rows || []).map((r) => r.resting_heart_rate);
    const sleepScores = (rows || []).map((r) => r.sleep_score);
    const sleepDurations = (rows || []).map((r) =>
      r.sleep_duration_seconds != null ? r.sleep_duration_seconds / 3600 : null
    );
    const sleepDeep = (rows || []).map((r) => {
      const dur = r.sleep_duration_seconds;
      const deep = r.sleep_deep_seconds;
      if (dur != null && dur > 0 && deep != null) return (deep / dur) * 100;
      return null;
    });

    const n = rows?.length ?? 0;
    if (n < 14) {
      return jsonResponse({
        ok: false,
        message: "Need at least 14 days of wellness data",
        days_available: n,
      });
    }

    const last30Hrv = hrv.slice(-30);
    const last30Rhr = rhr.slice(-30);
    const last30Sleep = sleepScores.slice(-30);
    const last7Hrv = hrv.slice(-7);
    const last7Rhr = rhr.slice(-7);

    const hrv_baseline_avg = mean(last30Hrv);
    const hrv_baseline_std = std(last30Hrv);
    const hrv_7day_avg = mean(last7Hrv);
    const rhr_baseline_avg = mean(last30Rhr);
    const rhr_baseline_std = std(last30Rhr);
    const rhr_7day_avg = mean(last7Rhr);
    const sleep_baseline_avg = mean(last30Sleep);
    const sleep_deep_percent_avg = mean(sleepDeep.filter((x): x is number => x != null));
    const sleep_duration_avg_hours = mean(sleepDurations);

    const { error: upsertErr } = await supabaseService.from("user_baselines").upsert(
      {
        user_id: userId,
        hrv_baseline_avg: hrv_baseline_avg != null ? Math.round(hrv_baseline_avg * 100) / 100 : null,
        hrv_baseline_std: hrv_baseline_std != null ? Math.round(hrv_baseline_std * 100) / 100 : null,
        hrv_7day_avg: hrv_7day_avg != null ? Math.round(hrv_7day_avg * 100) / 100 : null,
        rhr_baseline_avg: rhr_baseline_avg != null ? Math.round(rhr_baseline_avg * 100) / 100 : null,
        rhr_baseline_std: rhr_baseline_std != null ? Math.round(rhr_baseline_std * 100) / 100 : null,
        rhr_7day_avg: rhr_7day_avg != null ? Math.round(rhr_7day_avg * 100) / 100 : null,
        sleep_baseline_avg: sleep_baseline_avg != null ? Math.round(sleep_baseline_avg * 100) / 100 : null,
        sleep_deep_percent_avg: sleep_deep_percent_avg != null ? Math.round(sleep_deep_percent_avg * 100) / 100 : null,
        sleep_duration_avg_hours: sleep_duration_avg_hours != null ? Math.round(sleep_duration_avg_hours * 100) / 100 : null,
        calculated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (upsertErr) return jsonResponse({ error: upsertErr.message }, 400);

    return jsonResponse({
      ok: true,
      days_used: n,
      hrv_baseline_avg,
      rhr_baseline_avg,
      sleep_baseline_avg,
    });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
