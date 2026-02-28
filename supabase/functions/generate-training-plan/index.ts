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

    // Goal from Plan Builder (user's chosen distance) — never default to marathon
    const goalMap: Record<string, string> = {
      "5K": "5K", "5k": "5K", "Run a 5K": "5K", "run a 5k": "5K",
      "10K": "10K", "10k": "10K", "Run a 10K": "10K", "run a 10k": "10K",
      "Half Marathon": "Half Marathon", "half marathon": "Half Marathon", "half": "Half Marathon",
      "Marathon": "Marathon", "marathon": "Marathon",
      "Ultra": "Ultra", "ultra": "Ultra",
      "General fitness": "General fitness", "fitness": "General fitness",
      "Get faster": "General fitness", "Run more consistently": "General fitness",
    };
    let prefsGoalRaw = ((prefs.goal as string) || (payload.goal as string) || state.race_distance || "fitness") as string;
    prefsGoalRaw = (prefsGoalRaw || "").trim();
    const chosenGoalLabel = goalMap[prefsGoalRaw] || goalMap[prefsGoalRaw.toLowerCase()] || prefsGoalRaw;
    const raceDistanceForState = chosenGoalLabel === "5K" ? "5k"
      : chosenGoalLabel === "10K" ? "10k"
      : chosenGoalLabel === "Half Marathon" ? "half"
      : chosenGoalLabel === "Marathon" ? "marathon"
      : chosenGoalLabel === "Ultra" ? "ultra"
      : "fitness";

    // ── Derive total weeks ────────────────────────────────────────────────
    const prefsRaceDate = prefs.raceDate as string | undefined;
    const weeksFromPrefs = prefsRaceDate
      ? Math.max(0, Math.ceil((new Date(prefsRaceDate).getTime() - Date.now()) / 604800000))
      : null;
    let totalWeeks = 12;
    const effectiveWeeksToRace = weeksFromPrefs ?? state.weeks_to_race;
    if (effectiveWeeksToRace && effectiveWeeksToRace > 0) {
      totalWeeks = Math.min(24, effectiveWeeksToRace);
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

GOAL (use this exact goal for the plan — do NOT default to marathon):
Chosen goal: ${chosenGoalLabel}
Race distance key: ${raceDistanceForState}
Weeks to race: ${state.weeks_to_race ?? "—"}
Goal time: ${(prefs.goalTime as string) || formatTime(state.goal_time_seconds)}
Current predicted time: ${formatTime(state.current_predicted_time)}
Gap to close: ${state.time_gap_seconds ? `${state.time_gap_seconds}s` : "—"}
Plan phase: ${state.plan_phase ?? "base"}
Plan week: ${state.plan_week ?? 1} of ${state.plan_total_weeks ?? totalWeeks}

DISTANCE-SPECIFIC PLAN STRUCTURE (the plan layout MUST follow the chosen distance — do not use the same layout for 5K and marathon):
- 5K: Long run cap 60–90 min (~10–12 km). 2–3 quality sessions per week. Emphasis on intervals/VO2 and 5K race-pace work. Taper 1–2 weeks. Typical total length 8–12 weeks.
- 10K: Long run build to ~90–120 min (14–18 km). Mix of threshold and VO2; 10K pace segments. Taper ~2 weeks. Typical 10–14 weeks.
- Half Marathon: Long run build to ~21 km. Threshold + some intervals; half-marathon pace work. Taper 2–3 weeks. Typical 12–16 weeks.
- Marathon: Long run build to 28–35 km; marathon-pace blocks in long runs; more aerobic volume. Taper 2–3 weeks. Typical 16–24 weeks.
- Ultra: Long runs by time/distance for target event; back-to-back long runs where appropriate; time on feet. Typical 24+ weeks if needed.
The structure of the plan (long run length, number and type of key sessions, phase lengths, taper) MUST follow the chosen distance above. Typical plan length by distance: 5K 8–12 weeks, 10K 10–14 weeks, Half 12–16 weeks, Marathon 16–24 weeks, Ultra 24+ weeks — use these unless the user's race date (weeks to race) forces a different length.

PHYSIOLOGY-BASED EMPHASIS (use ATHLETE PROFILE and PHYSIOLOGICAL DIAGNOSIS above to set emphasis within the distance structure):
- Use all provided data (VO2max, threshold pace, bottleneck, secondary signals, volume, CTL/ATL) to decide which energy system gets more focus.
- High VO2max + weak threshold (or bottleneck weak_lactate_threshold): prioritize threshold/tempo and cruise intervals; do not over-prescribe VO2max intervals.
- Weak aerobic base (weak_aerobic_base): more easy mileage and long runs; limit hard sessions.
- Race-specific endurance (poor_race_specific_endurance): progressive long run build and race-pace work appropriate to the chosen distance (5K pace vs marathon pace).
The layout is defined by the goal distance; the emphasis (which energy system gets more volume/focus) is defined by this athlete's bottleneck and physiology.

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
1. GOAL-SPECIFIC PLAN: The athlete chose "${chosenGoalLabel}". You MUST use this exact goal everywhere. planName: use a title that includes this goal (e.g. "5K Speed Plan", "10K Build", "Half Marathon Endurance", "Marathon Endurance Build", "Ultra Preparation"). goal field in JSON: set to "${chosenGoalLabel}". coachSummary: write 3-4 sentences about THIS goal only — e.g. "for the 5K" or "for your marathon", never "for the marathon" when the goal is 5K/10K/half/ultra. Long run and race-pace work must match the chosen distance. Do NOT default to marathon.
2. STRUCTURE vs EMPHASIS: The plan skeleton (long run progression, phase lengths, taper, number of key sessions) must be distance-appropriate for "${chosenGoalLabel}" as in DISTANCE-SPECIFIC PLAN STRUCTURE. Within that structure, sessions must address the detected bottleneck ${bottleneck?.primary_bottleneck ?? "balanced_fitness"} — e.g. more threshold work if threshold is the weakness, more easy/long run if aerobic base is weak. Do not follow the bottleneck in a distance-agnostic way; keep the layout defined by the goal distance and the emphasis by physiology.
3. NEVER include forbidden workout types: ${JSON.stringify(philosophy?.forbidden_workout_types ?? [])}
4. Use ONLY the pace zones defined above — never generic paces
5. Every coachNotes field must reference THIS athlete's specific data
6. Total weekly volume must be within 5% of ${philosophy?.volume_target_km ?? state.weekly_km_4week_avg ?? 40}km
7. Account for injury: ${state.current_issue ?? "none reported"}
8. Generate ${totalWeeks} weeks of training
9. Every 4th week should be a recovery week (25-30% volume reduction)
10. Only schedule sessions on: ${trainingDays.join(", ")}
11. Long run always on: ${longRunDay}

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

    const savedGoal = chosenGoalLabel !== "General fitness" ? chosenGoalLabel : ((planJson.goal as string) || chosenGoalLabel);
    const aiPlanName = (planJson.planName as string) || "";
    const goalLower = chosenGoalLabel.toLowerCase();
    const nameMatchesGoal = goalLower === "5k" ? aiPlanName.includes("5K") || aiPlanName.includes("5k")
      : goalLower === "10k" ? aiPlanName.includes("10K") || aiPlanName.includes("10k")
      : goalLower === "half marathon" ? /half|21\.1|21k/i.test(aiPlanName)
      : goalLower === "marathon" ? /marathon|42\.2|42k/i.test(aiPlanName)
      : goalLower === "ultra" ? /ultra/i.test(aiPlanName)
      : true;
    const savedPlanName = (aiPlanName.trim() && nameMatchesGoal) ? aiPlanName.trim() : `${chosenGoalLabel} Plan`;
    const { data: planRow, error: planError } = await sb
      .from("training_plans")
      .insert({
        user_id: userId,
        plan_name: savedPlanName,
        goal: savedGoal,
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

    // Update athlete_state so detect-bottleneck and coaching focus use the chosen goal (e.g. "need 8km+ for 5k" not "for marathon")
    const athleteStateUpdate: Record<string, unknown> = {
      race_distance: raceDistanceForState,
      updated_at: new Date().toISOString(),
    };
    if (prefsRaceDate) {
      athleteStateUpdate.race_date = prefsRaceDate.slice(0, 10);
      athleteStateUpdate.weeks_to_race = weeksFromPrefs;
    }
    await sb.from("athlete_state").update(athleteStateUpdate).eq("user_id", userId);

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
