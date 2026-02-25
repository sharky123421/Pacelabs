// Training Philosophy Selection: maps detected bottleneck to training mode.
// POST /functions/v1/select-philosophy
// Body: { user_id?: string, bottleneck?: BottleneckResult }
// Returns: TrainingPhilosophy configuration
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { getSupabaseAdmin, authenticateUser } from "../_shared/supabase_admin.ts";

interface PhilosophyConfig {
  mode: string;
  description: string;
  volume_multiplier: number;
  intensity_easy: number;
  intensity_moderate: number;
  intensity_hard: number;
  sessions_per_week: {
    easy: number;
    tempo: number;
    interval: number;
    long_run: number;
    recovery: number;
    progression: number;
  };
  key_workout_types: string[];
  forbidden_workout_types: string[];
  progression_rate_percent: number;
  typical_duration_weeks: number;
  success_metric: string;
}

const PHILOSOPHIES: Record<string, PhilosophyConfig> = {
  weak_aerobic_base: {
    mode: "base_building",
    description: "80/20 polarized model — build aerobic engine with high-volume easy running",
    volume_multiplier: 1.08,
    intensity_easy: 82,
    intensity_moderate: 8,
    intensity_hard: 10,
    sessions_per_week: { easy: 3, tempo: 0, interval: 1, long_run: 1, recovery: 1, progression: 0 },
    key_workout_types: ["easy_run", "long_run", "strides", "one_vo2_session"],
    forbidden_workout_types: ["threshold_intervals", "race_pace", "tempo_run"],
    progression_rate_percent: 8,
    typical_duration_weeks: 4,
    success_metric: "Aerobic decoupling decreasing toward 5%",
  },

  weak_lactate_threshold: {
    mode: "threshold_development",
    description: "Norwegian double-threshold influence — structured threshold work to push lactate clearance",
    volume_multiplier: 1.05,
    intensity_easy: 75,
    intensity_moderate: 15,
    intensity_hard: 10,
    sessions_per_week: { easy: 2, tempo: 1, interval: 1, long_run: 1, recovery: 0, progression: 1 },
    key_workout_types: ["tempo_run", "cruise_intervals", "progression_run", "long_run_with_threshold_finish"],
    forbidden_workout_types: ["short_sprints"],
    progression_rate_percent: 5,
    typical_duration_weeks: 6,
    success_metric: "Threshold pace improving 3+ sec/km per month",
  },

  poor_race_specific_endurance: {
    mode: "race_specific",
    description: "Long run priority with race pace integration — build distance-specific endurance",
    volume_multiplier: 1.1,
    intensity_easy: 70,
    intensity_moderate: 20,
    intensity_hard: 10,
    sessions_per_week: { easy: 2, tempo: 1, interval: 0, long_run: 1, recovery: 1, progression: 1 },
    key_workout_types: [
      "progressive_long_run", "long_run_with_race_pace_segments",
      "medium_long_run", "marathon_pace_run",
    ],
    forbidden_workout_types: ["short_intervals", "speed_work", "track_repeats"],
    progression_rate_percent: 10,
    typical_duration_weeks: 8,
    success_metric: "Longest run reaching 90% of race distance",
  },

  overtraining_risk: {
    mode: "recovery_mode",
    description: "Mandatory deload — preserve fitness while recovering from accumulated fatigue",
    volume_multiplier: 0.65,
    intensity_easy: 95,
    intensity_moderate: 5,
    intensity_hard: 0,
    sessions_per_week: { easy: 3, tempo: 0, interval: 0, long_run: 1, recovery: 2, progression: 0 },
    key_workout_types: ["easy_run", "recovery_run", "short_easy_long_run"],
    forbidden_workout_types: [
      "tempo_run", "intervals", "progression", "race_pace",
      "threshold_intervals", "hill_repeats", "fartlek",
    ],
    progression_rate_percent: 0,
    typical_duration_weeks: 2,
    success_metric: "HRV returning to baseline, TSB > 0",
  },

  performance_plateau: {
    mode: "mixed_stimulus",
    description: "Change training stimulus to force new adaptation — same volume, different composition",
    volume_multiplier: 1.0,
    intensity_easy: 72,
    intensity_moderate: 12,
    intensity_hard: 16,
    sessions_per_week: { easy: 2, tempo: 1, interval: 1, long_run: 1, recovery: 1, progression: 0 },
    key_workout_types: ["vo2max_intervals", "hill_repeats", "fartlek", "long_run_with_surges"],
    forbidden_workout_types: [],
    progression_rate_percent: 3,
    typical_duration_weeks: 3,
    success_metric: "CTL increasing after 3 weeks",
  },

  pre_race_peak: {
    mode: "peaking",
    description: "Classic taper — reduce volume progressively while maintaining neuromuscular sharpness",
    volume_multiplier: 0.75, // 3 weeks out; will be adjusted by weeks_to_race
    intensity_easy: 70,
    intensity_moderate: 15,
    intensity_hard: 15,
    sessions_per_week: { easy: 3, tempo: 0, interval: 1, long_run: 1, recovery: 1, progression: 0 },
    key_workout_types: ["race_pace_strides", "short_tune_up_workout", "easy_run_with_strides"],
    forbidden_workout_types: ["long_tempo", "hard_intervals", "long_run_hard", "high_volume_long_run"],
    progression_rate_percent: 0,
    typical_duration_weeks: 3,
    success_metric: "TSB reaching +10 to +20 on race day",
  },

  injury_risk_high: {
    mode: "injury_prevention",
    description: "Protect the athlete — reduce load, eliminate high-impact sessions, focus on recovery",
    volume_multiplier: 0.7,
    intensity_easy: 90,
    intensity_moderate: 10,
    intensity_hard: 0,
    sessions_per_week: { easy: 3, tempo: 0, interval: 0, long_run: 1, recovery: 2, progression: 0 },
    key_workout_types: ["easy_run", "recovery_run", "cross_training"],
    forbidden_workout_types: [
      "intervals", "hills", "tempo_run", "speed_work", "long_hard_run",
    ],
    progression_rate_percent: 0,
    typical_duration_weeks: 2,
    success_metric: "Injury risk score below 50, pain-free running",
  },

  insufficient_volume: {
    mode: "volume_building",
    description: "Gradual volume increase — athlete is fresh and undertrained for their fitness level",
    volume_multiplier: 1.1,
    intensity_easy: 80,
    intensity_moderate: 10,
    intensity_hard: 10,
    sessions_per_week: { easy: 3, tempo: 1, interval: 0, long_run: 1, recovery: 1, progression: 0 },
    key_workout_types: ["easy_run", "long_run", "steady_state", "strides"],
    forbidden_workout_types: ["hard_intervals", "race_pace"],
    progression_rate_percent: 10,
    typical_duration_weeks: 4,
    success_metric: "Weekly volume matching VO2-appropriate target",
  },

  balanced_fitness: {
    mode: "maintenance",
    description: "Well-rounded athlete — maintain with gradual progression and variety",
    volume_multiplier: 1.03,
    intensity_easy: 78,
    intensity_moderate: 12,
    intensity_hard: 10,
    sessions_per_week: { easy: 2, tempo: 1, interval: 1, long_run: 1, recovery: 1, progression: 0 },
    key_workout_types: ["tempo_run", "intervals", "long_run", "progression_run"],
    forbidden_workout_types: [],
    progression_rate_percent: 3,
    typical_duration_weeks: 4,
    success_metric: "Continued steady improvement across all metrics",
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const auth = await authenticateUser(req);
    if ("error" in auth) return jsonResponse({ error: auth.error }, 401);

    const body = await req.json().catch(() => ({}));
    const userId = (body.user_id as string) || auth.userId;

    const sb = getSupabaseAdmin();

    // Get bottleneck (from body or latest analysis)
    let bottleneck: string;
    if (body.bottleneck?.primary_bottleneck) {
      bottleneck = body.bottleneck.primary_bottleneck;
    } else {
      const { data: latest } = await sb
        .from("bottleneck_analyses")
        .select("primary_bottleneck")
        .eq("user_id", userId)
        .order("analyzed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!latest) {
        return jsonResponse({ error: "No bottleneck analysis found. Run detect-bottleneck first." }, 400);
      }
      bottleneck = latest.primary_bottleneck;
    }

    // Get athlete state for volume calculation
    const { data: state } = await sb
      .from("athlete_state")
      .select("weekly_km_4week_avg, weeks_to_race")
      .eq("user_id", userId)
      .maybeSingle();

    const baseVolume = Number(state?.weekly_km_4week_avg) || 40;
    const weeksToRace = state?.weeks_to_race as number | null;

    // Select philosophy
    const philosophy = PHILOSOPHIES[bottleneck] ?? PHILOSOPHIES.balanced_fitness;

    // Adjust taper volume based on weeks to race
    let volumeMultiplier = philosophy.volume_multiplier;
    if (bottleneck === "pre_race_peak" && weeksToRace != null) {
      if (weeksToRace <= 1) volumeMultiplier = 0.40;
      else if (weeksToRace <= 2) volumeMultiplier = 0.60;
      else volumeMultiplier = 0.75;
    }

    const volumeTargetKm = Math.round(baseVolume * volumeMultiplier * 10) / 10;

    const result = {
      mode: philosophy.mode,
      description: philosophy.description,
      bottleneck_that_triggered: bottleneck,
      volume_target_km: volumeTargetKm,
      volume_multiplier: volumeMultiplier,
      intensity_easy: philosophy.intensity_easy,
      intensity_moderate: philosophy.intensity_moderate,
      intensity_hard: philosophy.intensity_hard,
      sessions_per_week: philosophy.sessions_per_week,
      key_workout_types: philosophy.key_workout_types,
      forbidden_workout_types: philosophy.forbidden_workout_types,
      progression_rate_percent: philosophy.progression_rate_percent,
      typical_duration_weeks: philosophy.typical_duration_weeks,
      success_metric: philosophy.success_metric,
    };

    // Get active plan for linking
    const { data: activePlan } = await sb
      .from("training_plans")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    // End previous active philosophy
    await sb
      .from("philosophy_periods")
      .update({ ended_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("ended_at", null);

    // Store new philosophy period
    await sb.from("philosophy_periods").insert({
      user_id: userId,
      plan_id: activePlan?.id ?? null,
      mode: philosophy.mode,
      bottleneck_that_triggered: bottleneck,
      volume_target_km: volumeTargetKm,
      intensity_easy_percent: philosophy.intensity_easy,
      intensity_moderate_percent: philosophy.intensity_moderate,
      intensity_hard_percent: philosophy.intensity_hard,
      session_composition: philosophy.sessions_per_week,
      key_workout_types: philosophy.key_workout_types,
      forbidden_workout_types: philosophy.forbidden_workout_types,
      progression_rate_percent: philosophy.progression_rate_percent,
      success_metric: philosophy.success_metric,
      typical_duration_weeks: philosophy.typical_duration_weeks,
    });

    return jsonResponse(result);
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
