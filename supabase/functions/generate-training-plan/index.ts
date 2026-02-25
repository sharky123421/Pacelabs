// Generate Training Plan: uses Groq with full diagnosis context to create periodized plan.
// POST /functions/v1/generate-training-plan
// Body: { user_id?: string, user_preferences?: object }
// Reads athlete_state, bottleneck, and philosophy to build a complete plan.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { callGroq } from "../_shared/groq.ts";
import { getSupabaseAdmin, authenticateUser } from "../_shared/supabase_admin.ts";

function formatPace(totalSec: number | null): string {
  if (!totalSec || totalSec <= 0) return "—";
  const min = Math.floor(totalSec / 60);
  const sec = Math.round(totalSec % 60);
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function formatTime(totalSec: number | null): string {
  if (!totalSec || totalSec <= 0) return "—";
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const auth = await authenticateUser(req);
    if ("error" in auth) return jsonResponse({ error: auth.error }, 401);

    const body = await req.json().catch(() => ({}));
    const userId = (body.user_id as string) || auth.userId;
    const prefs = (body.user_preferences as Record<string, unknown>) || {};

    const sb = getSupabaseAdmin();

    // ── Fetch all coaching context ────────────────────────────────────────
    const [stateRes, bottleneckRes, philosophyRes, onboardingRes] = await Promise.all([
      sb.from("athlete_state").select("*").eq("user_id", userId).maybeSingle(),
      sb.from("bottleneck_analyses").select("*").eq("user_id", userId)
        .order("analyzed_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("philosophy_periods").select("*").eq("user_id", userId)
        .is("ended_at", null).order("started_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("onboarding_progress").select("payload").eq("user_id", userId).maybeSingle(),
    ]);

    const state = stateRes.data;
    const bottleneck = bottleneckRes.data;
    const philosophy = philosophyRes.data;
    const payload = (onboardingRes.data?.payload as Record<string, unknown>) || {};

    if (!state) {
      return jsonResponse({ error: "No athlete state. Run coaching pipeline first." }, 400);
    }

    // ── Build user preferences ────────────────────────────────────────────
    const trainingDays = (prefs.trainingDays as string[]) || (payload.training_days as string[]) || ["Monday", "Tuesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const longRunDay = (prefs.longRunDay as string) || (payload.long_run_day as string) || "Sunday";
    const trackAccess = (prefs.trackAccess as boolean) ?? (payload.track_access as boolean) ?? true;
    const preferredSessions = (prefs.preferredSessions as string[]) || (payload.session_preferences as string[]) || [];

    // ── Derive total weeks ────────────────────────────────────────────────
    let totalWeeks = 12;
    if (state.weeks_to_race && state.weeks_to_race > 0) {
      totalWeeks = Math.min(24, state.weeks_to_race);
    }
    if (philosophy?.typical_duration_weeks) {
      totalWeeks = Math.max(totalWeeks, philosophy.typical_duration_weeks);
    }

    // ── Build the mega-prompt ─────────────────────────────────────────────
    const systemPrompt = `You are an elite running coach generating a training plan.
You have received a full physiological diagnosis from an AI analysis engine.
Translate this diagnosis into specific personalized weekly sessions.
Respond with valid JSON only matching the TrainingPlan schema.
Use ONLY metric units (km, min/km for pace).
Every session must directly connect to the diagnosed bottleneck.`;

    const userPrompt = `PHYSIOLOGICAL DIAGNOSIS:
Primary bottleneck: ${bottleneck?.primary_bottleneck ?? "balanced_fitness"}
Evidence: ${bottleneck?.primary_evidence ?? "No significant bottleneck"}
Coaching directive: ${bottleneck?.primary_coaching_note ?? "Continue progressive training"}
Secondary signals: ${JSON.stringify(bottleneck?.secondary_signals ?? [])}

TRAINING PHILOSOPHY:
Mode: ${philosophy?.mode ?? "maintenance"}
Weekly volume target: ${philosophy?.volume_target_km ?? state.weekly_km_4week_avg ?? 40}km
Intensity distribution: ${philosophy?.intensity_easy_percent ?? 78}% easy, ${philosophy?.intensity_moderate_percent ?? 12}% moderate, ${philosophy?.intensity_hard_percent ?? 10}% hard
Key workout types: ${JSON.stringify(philosophy?.key_workout_types ?? [])}
FORBIDDEN this phase: ${JSON.stringify(philosophy?.forbidden_workout_types ?? [])}

ATHLETE PROFILE:
Level: ${state.runner_level ?? "intermediate"}
VO2 max: ${state.vo2max ?? "—"}
Threshold pace: ${formatPace(state.threshold_pace_sec_per_km)}/km
Easy pace zone: ${formatPace(state.easy_pace_min_sec)}–${formatPace(state.easy_pace_max_sec)}/km
Threshold HR: ${state.threshold_hr ?? "—"} bpm
Aerobic threshold HR: ${state.aerobic_threshold_hr ?? "—"} bpm
Current weekly volume: ${state.weekly_km_current ?? "—"}km
4-week avg volume: ${state.weekly_km_4week_avg ?? "—"}km
CTL: ${state.ctl ?? "—"}
ATL: ${state.atl ?? "—"}
TSB: ${state.tsb ?? "—"}
Longest recent run: ${state.longest_run_recent_km ?? "—"}km
Longest run ever: ${state.longest_run_ever_km ?? "—"}km

GOAL:
Race distance: ${state.race_distance ?? "fitness"}
Weeks to race: ${state.weeks_to_race ?? "—"}
Goal time: ${formatTime(state.goal_time_seconds)}
Current predicted time: ${formatTime(state.current_predicted_time)}
Gap to close: ${state.time_gap_seconds ? `${state.time_gap_seconds}s` : "—"}
Plan phase: ${state.plan_phase ?? "base"}
Plan week: ${state.plan_week ?? 1} of ${state.plan_total_weeks ?? totalWeeks}

INJURY: ${state.current_issue ?? "none"}
Vulnerable areas: ${JSON.stringify(state.vulnerable_areas ?? [])}

USER PREFERENCES:
Training days: ${trainingDays.join(", ")}
Long run day: ${longRunDay}
Track access: ${trackAccess}
Session preferences: ${preferredSessions.join(", ") || "none specified"}

PACE ZONES (use ONLY these exact values):
Recovery: slower than ${formatPace(state.recovery_pace_sec)}/km
Easy: ${formatPace(state.easy_pace_min_sec)}–${formatPace(state.easy_pace_max_sec)}/km
Moderate/Tempo: ${formatPace((state.threshold_pace_sec_per_km ?? 292) + 10)}–${formatPace((state.threshold_pace_sec_per_km ?? 292) - 5)}/km
Threshold: ${formatPace(state.threshold_pace_sec_per_km)} /km ±5 seconds
Hard/VO2: ${formatPace((state.threshold_pace_sec_per_km ?? 292) - 25)}–${formatPace((state.threshold_pace_sec_per_km ?? 292) - 15)}/km

CRITICAL INSTRUCTIONS:
1. Every session MUST target the detected bottleneck: ${bottleneck?.primary_bottleneck ?? "balanced_fitness"}
2. NEVER include forbidden workout types: ${JSON.stringify(philosophy?.forbidden_workout_types ?? [])}
3. Use ONLY the pace zones defined above — never generic paces
4. Every coachNotes field must reference THIS athlete's specific data
5. Total weekly volume must be within 5% of ${philosophy?.volume_target_km ?? state.weekly_km_4week_avg ?? 40}km
6. Account for injury: ${state.current_issue ?? "none reported"}
7. Generate ${totalWeeks} weeks of training
8. Every 4th week should be a recovery week (25-30% volume reduction)
9. Only schedule sessions on: ${trainingDays.join(", ")}
10. Long run always on: ${longRunDay}

Return JSON:
{
  "planName": "string",
  "goal": "string",
  "raceDate": "string or null",
  "goalTime": "string",
  "totalWeeks": ${totalWeeks},
  "coachSummary": "string (3-4 sentences personalized)",
  "bottleneckAddressed": "${bottleneck?.primary_bottleneck ?? "balanced_fitness"}",
  "philosophyMode": "${philosophy?.mode ?? "maintenance"}",
  "phases": [
    { "name": "string", "startWeek": number, "endWeek": number, "description": "string", "focus": "string", "bottleneck_targeted": "string" }
  ],
  "weeks": [
    {
      "weekNumber": number,
      "phase": "string",
      "totalKm": number,
      "isRecoveryWeek": boolean,
      "weekNotes": "string",
      "intensityDistribution": { "easyPercent": number, "moderatePercent": number, "hardPercent": number },
      "sessions": [
        {
          "dayOfWeek": "Monday|...|Sunday",
          "type": "easy|tempo|intervals|long|recovery|progression|race_pace|hills|rest",
          "distanceKm": number,
          "structure": "string",
          "targetPaceMin": "string",
          "targetPaceMax": "string",
          "targetHRZone": "string",
          "targetHRMaxBpm": number,
          "estimatedDurationMin": number,
          "estimatedTSS": number,
          "trainingStimulus": "string",
          "energySystemTargeted": "string",
          "recoveryCost": "low|medium|high",
          "expectedAdaptation": "string",
          "coachNotes": "string",
          "importance": "key_session|normal|optional"
        }
      ]
    }
  ],
  "keyWorkouts": [
    { "weekNumber": number, "description": "string", "purpose": "string", "bottleneckConnection": "string" }
  ]
}`;

    // ── Call Groq ─────────────────────────────────────────────────────────
    const planJson = await callGroq({
      systemPrompt,
      userPrompt,
      temperature: 0.3,
      maxTokens: 8192,
      jsonMode: true,
    });

    // ── Validate plan ─────────────────────────────────────────────────────
    const weeks = (planJson.weeks as Array<Record<string, unknown>>) || [];
    const forbiddenTypes = new Set(
      (philosophy?.forbidden_workout_types as string[]) || [],
    );

    for (const week of weeks) {
      const sessions = (week.sessions as Array<Record<string, unknown>>) || [];
      for (const session of sessions) {
        if (forbiddenTypes.has(session.type as string)) {
          session.type = "easy";
          session.coachNotes = `[Auto-corrected: ${session.type} is forbidden in current phase] Easy run — build base.`;
        }
      }
    }

    // ── Save plan to database ─────────────────────────────────────────────
    const raceDate = planJson.raceDate
      ? new Date(planJson.raceDate as string).toISOString().slice(0, 10)
      : state.race_date;

    // Archive old active plans
    await sb
      .from("training_plans")
      .update({ is_active: false, archived_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("is_active", true);

    const { data: planRow, error: planError } = await sb
      .from("training_plans")
      .insert({
        user_id: userId,
        plan_name: (planJson.planName as string) || "AI Coaching Plan",
        goal: (planJson.goal as string) || state.race_distance,
        race_date: raceDate,
        goal_time: (planJson.goalTime as string) || formatTime(state.goal_time_seconds),
        total_weeks: (planJson.totalWeeks as number) || totalWeeks,
        current_week: 1,
        phase: ((planJson.phases as Array<Record<string, unknown>>)?.[0]?.name as string) || "Base",
        generated_by: "groq-llama-3.3-70b",
        coach_summary: planJson.coachSummary as string,
        gemini_raw_json: planJson,
        is_active: true,
        bottleneck_addressed: bottleneck?.primary_bottleneck,
        philosophy_mode: philosophy?.mode,
        philosophy_id: philosophy?.id,
        phases_json: planJson.phases,
        key_workouts_json: planJson.keyWorkouts,
      })
      .select("id")
      .single();

    if (planError) throw new Error(planError.message);
    const planId = planRow.id;

    // Update philosophy with plan link
    if (philosophy?.id) {
      await sb.from("philosophy_periods").update({ plan_id: planId }).eq("id", philosophy.id);
    }

    // ── Save sessions ─────────────────────────────────────────────────────
    const dayOrder = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const today = new Date();
    const startOfPlan = new Date(today);
    startOfPlan.setDate(today.getDate() - today.getDay() + 1); // Monday

    const sessionRows: Record<string, unknown>[] = [];
    for (const week of weeks) {
      const weekNum = week.weekNumber as number;
      const weekStart = new Date(startOfPlan);
      weekStart.setDate(startOfPlan.getDate() + (weekNum - 1) * 7);

      for (const s of (week.sessions as Array<Record<string, unknown>>) || []) {
        const dayIndex = dayOrder.indexOf(s.dayOfWeek as string);
        if (dayIndex === -1) continue;
        const sessionDate = new Date(weekStart);
        sessionDate.setDate(weekStart.getDate() + dayIndex);

        sessionRows.push({
          plan_id: planId,
          user_id: userId,
          week_number: weekNum,
          phase: week.phase,
          day_of_week: s.dayOfWeek,
          date: sessionDate.toISOString().slice(0, 10),
          type: s.type || "easy",
          distance_km: s.distanceKm,
          target_pace_min: s.targetPaceMin,
          target_pace_max: s.targetPaceMax,
          target_hr_zone: s.targetHRZone,
          target_hr_max_bpm: s.targetHRMaxBpm,
          structure: s.structure,
          coach_notes: s.coachNotes,
          estimated_duration_min: s.estimatedDurationMin,
          estimated_tss: s.estimatedTSS,
          training_stimulus: s.trainingStimulus,
          energy_system_targeted: s.energySystemTargeted,
          recovery_cost: s.recoveryCost,
          expected_adaptation: s.expectedAdaptation,
          importance: s.importance || "normal",
          bottleneck_connection: bottleneck?.primary_bottleneck,
          status: "planned",
        });
      }
    }

    if (sessionRows.length > 0) {
      const { error: sessErr } = await sb.from("sessions").insert(sessionRows);
      if (sessErr) throw new Error(sessErr.message);
    }

    return jsonResponse({
      ok: true,
      plan_id: planId,
      total_weeks: planJson.totalWeeks,
      total_sessions: sessionRows.length,
      bottleneck_addressed: bottleneck?.primary_bottleneck,
      philosophy_mode: philosophy?.mode,
      coach_summary: planJson.coachSummary,
    });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
