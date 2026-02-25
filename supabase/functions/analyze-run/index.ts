// Post-run analysis pipeline: generates AI summary, updates athlete state,
// checks for PRs, updates predictions, triggers downstream coaching loop.
// POST /functions/v1/analyze-run
// Body: { run_id: string }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { callGroq } from "../_shared/groq.ts";
import { getSupabaseAdmin, authenticateUser } from "../_shared/supabase_admin.ts";

function formatPace(totalSec: number): string {
  if (totalSec <= 0) return "—";
  const min = Math.floor(totalSec / 60);
  const sec = Math.round(totalSec % 60);
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.round(totalSec % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

const PR_DISTANCES: Record<string, { min: number; max: number }> = {
  "5k": { min: 4500, max: 5500 },
  "10k": { min: 9500, max: 10500 },
  "half": { min: 20500, max: 22000 },
  "marathon": { min: 41000, max: 43500 },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const auth = await authenticateUser(req);
    if ("error" in auth) return jsonResponse({ error: auth.error }, 401);

    const body = await req.json().catch(() => ({}));
    const runId = body.run_id as string;
    if (!runId) return jsonResponse({ error: "run_id required" }, 400);

    const sb = getSupabaseAdmin();

    // ── Fetch run data ────────────────────────────────────────────────────
    const { data: run, error: runErr } = await sb
      .from("runs")
      .select("*")
      .eq("id", runId)
      .single();

    if (runErr || !run) return jsonResponse({ error: "Run not found" }, 404);
    const userId = run.user_id;

    const distM = Number(run.distance_meters) || 0;
    const durS = Number(run.duration_seconds) || 0;
    if (distM < 500 || durS < 120) {
      return jsonResponse({ ok: true, skipped: true, reason: "Run too short" });
    }

    const paceSecPerKm = durS / (distM / 1000);
    const avgHR = run.avg_hr;

    // ── PR check ──────────────────────────────────────────────────────────
    let isPR = false;
    let prType: string | null = null;

    for (const [dist, range] of Object.entries(PR_DISTANCES)) {
      if (distM >= range.min && distM <= range.max) {
        const { data: bestRun } = await sb
          .from("runs")
          .select("duration_seconds")
          .eq("user_id", userId)
          .gte("distance_meters", range.min)
          .lte("distance_meters", range.max)
          .neq("id", runId)
          .order("duration_seconds", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (!bestRun || durS < (Number(bestRun.duration_seconds) || Infinity)) {
          isPR = true;
          prType = dist;
        }
        break;
      }
    }

    // ── Fetch context for AI summary ──────────────────────────────────────
    const [stateRes, sessionRes, bottleneckRes] = await Promise.all([
      sb.from("athlete_state").select("*").eq("user_id", userId).maybeSingle(),
      sb.from("sessions").select("*").eq("user_id", userId)
        .eq("date", run.started_at?.slice(0, 10)).maybeSingle(),
      sb.from("bottleneck_analyses").select("primary_bottleneck, primary_coaching_note")
        .eq("user_id", userId).order("analyzed_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const state = stateRes.data;
    const plannedSession = sessionRes.data;
    const bottleneck = bottleneckRes.data;

    // ── Generate AI summary ───────────────────────────────────────────────
    let aiSummary = "";
    try {
      const summaryResult = await callGroq({
        systemPrompt: "You are an elite running coach giving post-run feedback. Be specific, reference numbers, and connect to the bigger picture. 3-5 sentences. Return JSON: { \"summary\": \"string\" }",
        userPrompt: `Run completed:
- Distance: ${(distM / 1000).toFixed(2)}km
- Duration: ${formatDuration(durS)}
- Pace: ${formatPace(paceSecPerKm)}/km
- Avg HR: ${avgHR ?? "—"}bpm
${isPR ? `- NEW PR: ${prType}!` : ""}
- Planned session: ${plannedSession ? `${plannedSession.type} ${plannedSession.distance_km}km at ${plannedSession.target_pace_min}–${plannedSession.target_pace_max}/km` : "unplanned run"}

Athlete context:
- Current bottleneck: ${bottleneck?.primary_bottleneck ?? "unknown"}
- CTL: ${state?.ctl ?? "—"}, TSB: ${state?.tsb ?? "—"}
- Threshold pace: ${state?.threshold_pace_sec_per_km ? formatPace(state.threshold_pace_sec_per_km) : "—"}/km

Give personalized feedback connecting this run to the athlete's training goals and current bottleneck.`,
        temperature: 0.4,
        maxTokens: 400,
        jsonMode: true,
      });
      aiSummary = (summaryResult.summary as string) || "";
    } catch {
      aiSummary = isPR
        ? `New ${prType} PR — ${formatDuration(durS)}! Great work.`
        : `${(distM / 1000).toFixed(1)}km at ${formatPace(paceSecPerKm)}/km completed.`;
    }

    // ── Update run with analysis ──────────────────────────────────────────
    await sb.from("runs").update({
      ai_summary: aiSummary,
      is_pr: isPR,
      pr_type: prType,
    }).eq("id", runId);

    // ── Link to planned session if exists ─────────────────────────────────
    if (plannedSession) {
      await sb.from("sessions").update({
        status: "completed",
        completed_run_id: runId,
      }).eq("id", plannedSession.id);
    }

    // ── Store AI feedback for learning ────────────────────────────────────
    const today = run.started_at?.slice(0, 10) || new Date().toISOString().slice(0, 10);
    const { data: dailyDecision } = await sb
      .from("daily_decisions")
      .select("action, modified_session_type, user_choice")
      .eq("user_id", userId)
      .eq("date", today)
      .maybeSingle();

    if (dailyDecision) {
      await sb.from("ai_feedback").upsert({
        user_id: userId,
        date: today,
        ai_recommendation: dailyDecision,
        user_choice: dailyDecision.user_choice,
        actual_run_data: {
          distance_km: distM / 1000,
          duration_sec: durS,
          pace_sec_per_km: paceSecPerKm,
          avg_hr: avgHR,
          is_pr: isPR,
        },
        outcome: null, // will be updated tomorrow with next-day HRV
      }, { onConflict: "user_id,date" });
    }

    // ── Trigger fitness metrics recalculation ─────────────────────────────
    // This would normally call calculate-fitness-metrics, but we'll let
    // the caller chain these calls. Return enough data for the caller to decide.

    return jsonResponse({
      ok: true,
      run_id: runId,
      is_pr: isPR,
      pr_type: prType,
      ai_summary: aiSummary,
      distance_km: distM / 1000,
      pace: formatPace(paceSecPerKm),
      duration: formatDuration(durS),
      session_matched: !!plannedSession,
      needs_fitness_recalc: true,
      needs_bottleneck_check: true,
    });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
