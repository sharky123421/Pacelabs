// Enhanced Daily Session Optimizer: runs every morning or on app open.
// Uses full AthleteState + bottleneck context + learning data for daily decisions.
// POST /functions/v1/optimize-daily-session
// Body: { user_id?: string, force_refresh?: boolean }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { callGroq } from "../_shared/groq.ts";
import { getSupabaseAdmin, authenticateUser } from "../_shared/supabase_admin.ts";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatPace(totalSec: number | null): string {
  if (!totalSec || totalSec <= 0) return "—";
  const min = Math.floor(totalSec / 60);
  const sec = Math.round(totalSec % 60);
  return `${min}:${String(sec).padStart(2, "0")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const auth = await authenticateUser(req);
    if ("error" in auth) return jsonResponse({ error: auth.error }, 401);

    const body = await req.json().catch(() => ({}));
    const userId = (body.user_id as string) || auth.userId;
    const forceRefresh = !!body.force_refresh;

    const sb = getSupabaseAdmin();
    const today = todayISO();

    // Check for cached decision
    if (!forceRefresh) {
      const { data: existing } = await sb
        .from("daily_decisions")
        .select("*")
        .eq("user_id", userId)
        .eq("date", today)
        .maybeSingle();
      if (existing?.full_decision) {
        return jsonResponse({
          ...existing.full_decision as Record<string, unknown>,
          bottleneck: existing.bottleneck_at_time,
          philosophy: existing.philosophy_at_time,
          cached: true,
        });
      }
    }

    // ── Fetch all context ─────────────────────────────────────────────────
    const [stateRes, sessionRes, bottleneckRes, philosophyRes, feedbackRes, adaptRes] =
      await Promise.all([
        sb.from("athlete_state").select("*").eq("user_id", userId).maybeSingle(),
        sb.from("sessions").select("*").eq("user_id", userId).eq("date", today).maybeSingle(),
        sb.from("bottleneck_analyses").select("primary_bottleneck, primary_evidence, primary_coaching_note")
          .eq("user_id", userId).order("analyzed_at", { ascending: false }).limit(1).maybeSingle(),
        sb.from("philosophy_periods").select("mode, success_metric, forbidden_workout_types")
          .eq("user_id", userId).is("ended_at", null)
          .order("started_at", { ascending: false }).limit(1).maybeSingle(),
        sb.from("ai_feedback").select("ai_recommendation, user_choice, outcome")
          .eq("user_id", userId).order("date", { ascending: false }).limit(10),
        sb.from("adaptation_records").select("adaptation_outcome, ai_explanation, volume_adjustment_percent")
          .eq("user_id", userId).order("week_start_date", { ascending: false }).limit(1).maybeSingle(),
      ]);

    const state = stateRes.data;
    const plannedSession = sessionRes.data;
    const bottleneck = bottleneckRes.data;
    const philosophy = philosophyRes.data;
    const feedback = feedbackRes.data || [];
    const lastAdaptation = adaptRes.data;

    if (!state) {
      return jsonResponse({ error: "No athlete state. Complete onboarding first." }, 400);
    }

    // ── Build learning patterns from feedback ─────────────────────────────
    let learningContext = "";
    if (feedback.length >= 5) {
      const hardWhileTired = feedback.filter(
        (f) => f.user_choice === "declined" && f.outcome === "negative",
      ).length;
      const followedEasy = feedback.filter(
        (f) => f.user_choice === "accepted" && f.outcome === "positive",
      ).length;
      if (hardWhileTired > 0 || followedEasy > 0) {
        learningContext = `\nHistorical pattern for this athlete:
When recommended to take it easy and they follow advice, recovery is positive in ${followedEasy} out of ${feedback.length} cases.
When they override and train hard despite warning, outcome was negative in ${hardWhileTired} out of ${feedback.length} cases.`;
      }
    }

    // ── Build Groq prompt ─────────────────────────────────────────────────
    const systemPrompt = `You are an elite AI running coach making a single daily decision.
You have complete physiological data on this athlete.
Analyze ALL data and decide: proceed, modify, replace, or rest.
You replace all hardcoded rules — think holistically.
Respond with JSON only.

Coaching philosophy:
- Long term development beats short term gains
- Protect the athlete's ability to train tomorrow
- HRV is the most important single recovery signal
- TSB tells you if athlete is fresh or fatigued
- 3+ days below HRV baseline = accumulated fatigue
- Elevated resting HR = body under stress
- Key sessions need good recovery — easy runs are flexible
- When in doubt: do less

Current coaching context:
- Primary bottleneck: ${bottleneck?.primary_bottleneck ?? "unknown"}
- Philosophy mode: ${philosophy?.mode ?? "unknown"}
- Forbidden workouts: ${JSON.stringify(philosophy?.forbidden_workout_types ?? [])}
${learningContext}`;

    const userPrompt = `ATHLETE STATE (today):
${JSON.stringify({
      readiness_score: state.readiness_score,
      readiness_status: state.readiness_status,
      hrv_today: state.hrv_today,
      hrv_7day_avg: state.hrv_7day_avg,
      hrv_60day_avg: state.hrv_60day_avg,
      hrv_percent_from_baseline: state.hrv_percent_from_baseline,
      hrv_consecutive_days_suppressed: state.hrv_consecutive_days_suppressed,
      rhr_today: state.rhr_today,
      rhr_30day_avg: state.rhr_30day_avg,
      rhr_bpm_from_baseline: state.rhr_bpm_from_baseline,
      sleep_score_last: state.sleep_score_last,
      sleep_duration_hours_last: state.sleep_duration_hours_last,
      sleep_consecutive_poor_nights: state.sleep_consecutive_poor_nights,
      ctl: state.ctl,
      atl: state.atl,
      tsb: state.tsb,
      weekly_km_current: state.weekly_km_current,
      consecutive_run_days: state.consecutive_run_days,
      days_since_rest: state.days_since_rest,
      days_since_hard_session: state.days_since_hard_session,
      injury_risk_score: state.injury_risk_score,
      fitness_trajectory: state.fitness_trajectory,
    }, null, 2)}

PLANNED SESSION TODAY:
${plannedSession ? JSON.stringify({
      type: plannedSession.type,
      distance_km: plannedSession.distance_km,
      structure: plannedSession.structure,
      target_pace_min: plannedSession.target_pace_min,
      target_pace_max: plannedSession.target_pace_max,
      target_hr_zone: plannedSession.target_hr_zone,
      importance: plannedSession.importance,
      coach_notes: plannedSession.coach_notes,
    }, null, 2) : "No session planned"}

BOTTLENECK: ${bottleneck?.primary_bottleneck ?? "unknown"} — ${bottleneck?.primary_evidence ?? ""}

LAST ADAPTATION: ${lastAdaptation?.adaptation_outcome ?? "none"} — ${lastAdaptation?.ai_explanation ?? ""}

PACE ZONES:
Easy: ${formatPace(state.easy_pace_min_sec)}–${formatPace(state.easy_pace_max_sec)}/km
Recovery: ${formatPace(state.recovery_pace_sec)}/km
Threshold: ${formatPace(state.threshold_pace_sec_per_km)}/km

Return JSON:
{
  "recovery_assessment": {
    "overall_score": 0-100,
    "status": "OPTIMAL"|"SUBOPTIMAL"|"POOR"|"VERY_POOR",
    "primary_concern": "string",
    "secondary_concerns": ["string"],
    "pattern_detected": boolean,
    "pattern_description": "string or null"
  },
  "decision": {
    "action": "proceed"|"modify"|"replace"|"rest",
    "confidence": "high"|"medium"|"low",
    "recommended_session": {
      "type": "string",
      "distance_km": number,
      "structure": "string",
      "target_pace_min": "string",
      "target_pace_max": "string",
      "target_hr_zone": "string",
      "target_hr_max_bpm": number,
      "estimated_tss": number,
      "duration_estimate_min": number
    },
    "vs_original": {
      "changed": boolean,
      "intensity_change": "same"|"reduced"|"significantly_reduced"|"replaced",
      "volume_change_percent": number,
      "reason_short": "string"
    }
  },
  "reasoning": {
    "summary": "string",
    "health_analysis": "string",
    "load_analysis": "string",
    "key_factors": ["string"],
    "what_would_happen_if_trained_hard": "string",
    "tomorrow_consideration": "string"
  },
  "coach_message": {
    "title": "string",
    "body": "string",
    "tone": "encouraging"|"cautionary"|"firm"|"neutral"
  },
  "warning_ui": {
    "show_warning": boolean,
    "warning_level": "none"|"amber"|"orange"|"red",
    "warning_headline": "string",
    "warning_subline": "string"
  },
  "why_this_session": {
    "bottleneck_label": "string (human-readable current bottleneck)",
    "today_focus": "string (what today's session targets)",
    "why_it_matters": "string (personalized explanation)"
  }
}`;

    const decision = await callGroq({
      systemPrompt,
      userPrompt,
      temperature: 0.2,
      maxTokens: 1500,
      jsonMode: true,
    });

    // ── Store daily decision ──────────────────────────────────────────────
    const recoveryAssessment = (decision.recovery_assessment as Record<string, unknown>) || {};
    const decisionData = (decision.decision as Record<string, unknown>) || {};
    const recommended = (decisionData.recommended_session as Record<string, unknown>) || {};
    const vsOriginal = (decisionData.vs_original as Record<string, unknown>) || {};

    await sb.from("daily_decisions").upsert({
      user_id: userId,
      date: today,
      session_id: plannedSession?.id ?? null,
      recovery_score: (recoveryAssessment.overall_score as number) ?? null,
      hrv_today: state.hrv_today,
      hrv_vs_baseline_percent: state.hrv_percent_from_baseline,
      rhr_today: state.rhr_today,
      rhr_vs_baseline: state.rhr_bpm_from_baseline != null ? Math.round(state.rhr_bpm_from_baseline) : null,
      sleep_score: state.sleep_score_last,
      tsb_today: state.tsb,
      action: decisionData.action as string,
      confidence: decisionData.confidence as string,
      primary_reason: (recoveryAssessment.primary_concern as string) ?? null,
      original_session_type: plannedSession?.type ?? null,
      original_distance_km: plannedSession?.distance_km ?? null,
      modified_session_type: (recommended.type as string) ?? null,
      modified_distance_km: (recommended.distance_km as number) ?? null,
      modification_reason: (vsOriginal.reason_short as string) ?? null,
      bottleneck_at_time: bottleneck?.primary_bottleneck ?? null,
      philosophy_at_time: philosophy?.mode ?? null,
      full_decision: decision,
    }, { onConflict: "user_id,date" });

    // Also store in daily_recovery for backward compatibility
    await sb.from("daily_recovery").upsert({
      user_id: userId,
      date: today,
      hrv_today: state.hrv_today,
      hrv_7day_avg: state.hrv_7day_avg,
      rhr_today: state.rhr_today,
      sleep_score: state.sleep_score_last,
      sleep_duration_hours: state.sleep_duration_hours_last,
      recovery_score: (recoveryAssessment.overall_score as number) ?? null,
      recovery_status: (recoveryAssessment.status as string) ?? null,
      ai_decision: { ...decision, planned_session: plannedSession },
      ai_reasoning: ((decision.reasoning as Record<string, unknown>)?.summary as string) ?? null,
    }, { onConflict: "user_id,date" });

    return jsonResponse({
      ...decision,
      planned_session: plannedSession,
      bottleneck: bottleneck?.primary_bottleneck,
      philosophy: philosophy?.mode,
      cached: false,
    });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
