// Weekly Adaptation Loop: runs every Monday via cron.
// Measures last week's adaptation response. Adjusts upcoming weeks.
// POST /functions/v1/run-adaptation-loop
// Body: { user_id?: string } or called via cron for all users
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { callGroq } from "../_shared/groq.ts";
import { getSupabaseAdmin, authenticateUser } from "../_shared/supabase_admin.ts";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function weekStartISO(d: string): string {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
  dt.setDate(diff);
  return dt.toISOString().slice(0, 10);
}

function dateOffset(d: string, days: number): string {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
}

async function processUser(
  sb: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
): Promise<Record<string, unknown>> {
  const today = todayISO();
  const lastWeekStart = dateOffset(weekStartISO(today), -7);
  const lastWeekEnd = dateOffset(lastWeekStart, 6);

  // ── STEP 1: Collect actual vs planned ─────────────────────────────────
  const [sessionsRes, runsRes, stateRes, prevStateRes, philosophyRes, prevAdaptRes] =
    await Promise.all([
      sb.from("sessions").select("*").eq("user_id", userId)
        .gte("date", lastWeekStart).lte("date", lastWeekEnd),
      sb.from("runs").select("id, distance_meters, duration_seconds, tss, started_at")
        .eq("user_id", userId)
        .gte("started_at", lastWeekStart + "T00:00:00")
        .lte("started_at", lastWeekEnd + "T23:59:59"),
      sb.from("athlete_state").select("*").eq("user_id", userId).maybeSingle(),
      sb.from("athlete_state").select("ctl, aerobic_decoupling_avg, threshold_pace_sec_per_km, hrv_60day_avg")
        .eq("user_id", userId).maybeSingle(),
      sb.from("philosophy_periods").select("*").eq("user_id", userId)
        .is("ended_at", null).order("started_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("adaptation_records").select("adaptation_ratio, adaptation_outcome")
        .eq("user_id", userId).order("week_start_date", { ascending: false }).limit(2),
    ]);

  const sessions = sessionsRes.data || [];
  const runs = runsRes.data || [];
  const state = stateRes.data;
  const philosophy = philosophyRes.data;
  const prevAdaptations = prevAdaptRes.data || [];

  if (!state) {
    return { userId, skipped: true, reason: "No athlete state" };
  }

  const plannedKm = sessions.reduce(
    (s, sess) => s + (Number(sess.distance_km) || 0), 0,
  );
  const actualKm = runs.reduce(
    (s, r) => s + ((Number(r.distance_meters) || 0) / 1000), 0,
  );
  const plannedSessions = sessions.filter((s) => s.type !== "rest").length;
  const completedSessions = sessions.filter((s) => s.status === "completed").length;
  const completionRate = plannedSessions > 0
    ? Math.round((completedSessions / plannedSessions) * 100) / 100
    : 0;

  // ── STEP 2: Measure adaptation signals ────────────────────────────────
  const previousCTL = Number(prevStateRes.data?.ctl) || Number(state.ctl) || 0;
  const currentCTL = Number(state.ctl) || 0;
  const ctlChangeActual = currentCTL - previousCTL;

  const progressionRate = Number(philosophy?.progression_rate_percent) || 5;
  const ctlChangeExpected = (progressionRate / 100) * previousCTL;
  const adaptationRatio = ctlChangeExpected > 0
    ? Math.round((ctlChangeActual / ctlChangeExpected) * 10000) / 10000
    : 1.0;

  const prevThreshold = Number(prevStateRes.data?.threshold_pace_sec_per_km) || 0;
  const currThreshold = Number(state.threshold_pace_sec_per_km) || 0;
  const thresholdPaceChange = prevThreshold > 0 && currThreshold > 0
    ? currThreshold - prevThreshold
    : 0;

  const prevDecoupling = Number(prevStateRes.data?.aerobic_decoupling_avg) || 0;
  const currDecoupling = Number(state.aerobic_decoupling_avg) || 0;
  const decouplingChange = prevDecoupling > 0 ? currDecoupling - prevDecoupling : 0;

  const prevHRV = Number(prevStateRes.data?.hrv_60day_avg) || 0;
  const currHRV = Number(state.hrv_60day_avg) || 0;
  const hrvResponse = prevHRV > 0 ? currHRV - prevHRV : 0;

  // ── STEP 3: Classify adaptation outcome ───────────────────────────────
  let adaptationOutcome: string;
  let actionTaken: string;
  let volumeAdjustment: number;
  let intensityAdjustment = 0;

  const prevStagnant = prevAdaptations.some((a) => a.adaptation_outcome === "stagnant");

  if (adaptationRatio > 1.15 && hrvResponse >= 0) {
    adaptationOutcome = "strong_positive";
    actionTaken = "accelerate";
    volumeAdjustment = 8;
  } else if (adaptationRatio >= 0.85 && adaptationRatio <= 1.15) {
    adaptationOutcome = "normal_positive";
    actionTaken = "continue";
    volumeAdjustment = progressionRate;
  } else if (adaptationRatio >= 0.7 || hrvResponse < -2) {
    adaptationOutcome = "weak_positive";
    actionTaken = "hold";
    volumeAdjustment = 0;
  } else if (adaptationRatio < 0.7 && prevStagnant) {
    adaptationOutcome = "stagnant";
    actionTaken = "replan";
    volumeAdjustment = 0;
  } else if (
    ctlChangeActual < 0 && hrvResponse < -3
  ) {
    adaptationOutcome = "negative";
    actionTaken = "reduce";
    volumeAdjustment = -25;
    intensityAdjustment = -50;
  } else {
    adaptationOutcome = "normal_positive";
    actionTaken = "continue";
    volumeAdjustment = progressionRate;
  }

  // ── STEP 4: Apply adjustments to upcoming sessions ────────────────────
  const thisWeekStart = weekStartISO(today);
  const nextWeekEnd = dateOffset(thisWeekStart, 13);

  if (volumeAdjustment !== 0 || intensityAdjustment !== 0) {
    const { data: upcomingSessions } = await sb
      .from("sessions")
      .select("id, distance_km, type")
      .eq("user_id", userId)
      .gte("date", thisWeekStart)
      .lte("date", nextWeekEnd)
      .eq("status", "planned");

    if (upcomingSessions && upcomingSessions.length > 0) {
      for (const session of upcomingSessions) {
        const currentDist = Number(session.distance_km) || 0;
        const newDist = Math.max(
          2,
          Math.round(currentDist * (1 + volumeAdjustment / 100) * 10) / 10,
        );

        const updates: Record<string, unknown> = { distance_km: newDist };

        if (intensityAdjustment < 0 && ["intervals", "tempo", "threshold"].includes(session.type)) {
          updates.type = "easy";
          updates.modification_reason = `Adaptation loop: ${adaptationOutcome} — converted to easy`;
        }

        await sb.from("sessions").update(updates).eq("id", session.id);
      }
    }
  }

  // ── STEP 5: Generate coach explanation via Groq ───────────────────────
  let aiExplanation = "";
  try {
    const groqResult = await callGroq({
      systemPrompt: "You are an elite running coach giving a brief weekly update. Write 2-3 sentences in warm coach voice. Sign off with '— Coach'.",
      userPrompt: `Last week results:
- Planned: ${plannedKm.toFixed(0)}km in ${plannedSessions} sessions
- Actual: ${actualKm.toFixed(0)}km, ${completedSessions} sessions completed (${Math.round(completionRate * 100)}%)
- CTL change: ${ctlChangeActual.toFixed(1)} (expected ${ctlChangeExpected.toFixed(1)})
- Adaptation ratio: ${adaptationRatio.toFixed(2)}
- HRV response: ${hrvResponse > 0 ? "positive" : hrvResponse < -2 ? "declining" : "stable"}
- Threshold pace change: ${thresholdPaceChange > 0 ? "slower" : thresholdPaceChange < 0 ? "faster" : "unchanged"} by ${Math.abs(thresholdPaceChange)}sec/km
- Outcome: ${adaptationOutcome}
- Action: ${actionTaken}, volume adjustment ${volumeAdjustment > 0 ? "+" : ""}${volumeAdjustment}%

Generate a 2-3 sentence coach explanation for the athlete about their week and what's changing. Be specific with numbers. Return JSON: { "explanation": "string" }`,
      temperature: 0.4,
      maxTokens: 300,
      jsonMode: true,
    });
    aiExplanation = (groqResult.explanation as string) || "";
  } catch {
    aiExplanation = `${adaptationOutcome === "strong_positive"
      ? "Excellent week"
      : adaptationOutcome === "negative"
      ? "Tough week — taking it easier"
      : "Solid week"
    }. ${actionTaken === "accelerate"
      ? `Bumping volume +${volumeAdjustment}% next week.`
      : actionTaken === "reduce"
      ? "Reducing load to aid recovery."
      : `Continuing at current progression.`
    } — Coach`;
  }

  // ── Store adaptation record ─────────────────────────────────────────────
  const record = {
    user_id: userId,
    week_start_date: lastWeekStart,
    planned_km: Math.round(plannedKm * 100) / 100,
    actual_km: Math.round(actualKm * 100) / 100,
    planned_sessions: plannedSessions,
    completed_sessions: completedSessions,
    completion_rate: completionRate,
    ctl_change_actual: Math.round(ctlChangeActual * 100) / 100,
    ctl_change_expected: Math.round(ctlChangeExpected * 100) / 100,
    adaptation_ratio: adaptationRatio,
    threshold_pace_change: thresholdPaceChange,
    decoupling_change: Math.round(decouplingChange * 100) / 100,
    hrv_response: Math.round(hrvResponse * 100) / 100,
    adaptation_outcome: adaptationOutcome,
    action_taken: actionTaken,
    volume_adjustment_percent: volumeAdjustment,
    intensity_adjustment_percent: intensityAdjustment,
    ai_explanation: aiExplanation,
    bottleneck_resolved: false,
    philosophy_changed: actionTaken === "replan",
    new_philosophy: actionTaken === "replan" ? "needs_replan" : null,
  };

  await sb.from("adaptation_records").upsert(record, {
    onConflict: "user_id,week_start_date",
  });

  return {
    userId,
    adaptation_outcome: adaptationOutcome,
    action_taken: actionTaken,
    volume_adjustment: volumeAdjustment,
    adaptation_ratio: adaptationRatio,
    ai_explanation: aiExplanation,
    planned_km: plannedKm,
    actual_km: actualKm,
    completion_rate: completionRate,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const sb = getSupabaseAdmin();
    const body = await req.json().catch(() => ({}));

    // If specific user_id provided, process just that user
    if (body.user_id) {
      const auth = await authenticateUser(req);
      if ("error" in auth) return jsonResponse({ error: auth.error }, 401);
      const result = await processUser(sb, body.user_id);
      return jsonResponse(result);
    }

    // Cron mode: check for service role key in auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);

    // For cron: process all users with active plans
    const { data: users } = await sb
      .from("training_plans")
      .select("user_id")
      .eq("is_active", true);

    if (!users || users.length === 0) {
      return jsonResponse({ ok: true, processed: 0 });
    }

    const uniqueUserIds = [...new Set(users.map((u) => u.user_id))];
    const results: Record<string, unknown>[] = [];

    for (const uid of uniqueUserIds) {
      try {
        const result = await processUser(sb, uid);
        results.push(result);
      } catch (e) {
        results.push({ userId: uid, error: String(e) });
      }
    }

    return jsonResponse({
      ok: true,
      processed: results.length,
      results,
    });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
