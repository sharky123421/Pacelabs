// Bottleneck Detection Engine: determines the PRIMARY physiological limitation.
// POST /functions/v1/detect-bottleneck
// Body: { user_id?: string }
// Returns: BottleneckResult with primary + secondary signals
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { getSupabaseAdmin, authenticateUser } from "../_shared/supabase_admin.ts";

interface Signal {
  type: string;
  strength: "critical" | "strong" | "moderate" | "weak";
  strengthScore: number; // 0-100 for ranking
  evidence: string;
  coachingNote: string;
}

function detectSignals(state: Record<string, unknown>): Signal[] {
  const signals: Signal[] = [];

  // ── SIGNAL 1: AEROBIC BASE WEAKNESS ─────────────────────────────────────
  const decoupling = Number(state.aerobic_decoupling_avg) || 0;
  if (decoupling > 10) {
    signals.push({
      type: "weak_aerobic_base",
      strength: "strong",
      strengthScore: 75 + Math.min(25, (decoupling - 10) * 3),
      evidence: `Avg decoupling ${decoupling.toFixed(1)}% — aerobic system struggles to sustain pace without HR drift`,
      coachingNote: "More easy mileage at conversational pace. Limit intensity sessions to 1/week max.",
    });
  } else if (decoupling > 8) {
    signals.push({
      type: "weak_aerobic_base",
      strength: "moderate",
      strengthScore: 50 + (decoupling - 8) * 12,
      evidence: `Avg decoupling ${decoupling.toFixed(1)}% — aerobic base needs work`,
      coachingNote: "Focus on building easy volume. Polarize training — more easy, not more moderate.",
    });
  }

  const hardPct = Number(state.intensity_hard_percent) || 0;
  if (hardPct > 30) {
    const existing = signals.find((s) => s.type === "weak_aerobic_base");
    if (existing) {
      existing.strengthScore = Math.min(100, existing.strengthScore + 15);
      existing.evidence += ` | ${hardPct}% of training is hard — well above optimal 80/20`;
    } else {
      signals.push({
        type: "weak_aerobic_base",
        strength: "moderate",
        strengthScore: 55,
        evidence: `${hardPct}% of training is hard — above 80/20 optimal distribution`,
        coachingNote: "Polarize training — more easy running, less moderate effort.",
      });
    }
  }

  // ── SIGNAL 2: THRESHOLD WEAKNESS ────────────────────────────────────────
  const thresholdTrend = state.threshold_trend as string;
  const fitTrajectory = state.fitness_trajectory as string;

  if (thresholdTrend === "stable" && fitTrajectory === "plateau") {
    signals.push({
      type: "weak_lactate_threshold",
      strength: "strong",
      strengthScore: 80,
      evidence: "Threshold pace has not improved in 6+ weeks while training consistently",
      coachingNote: "Introduce structured threshold work — cruise intervals, tempo runs, progression runs.",
    });
  }

  const hardSessions14 = Number(state.hard_sessions_last_14_days) || 0;
  const weeksToRace = state.weeks_to_race as number | null;
  if (hardSessions14 < 1 && (weeksToRace == null || weeksToRace > 8)) {
    const existing = signals.find((s) => s.type === "weak_lactate_threshold");
    if (existing) {
      existing.strengthScore = Math.min(100, existing.strengthScore + 10);
    } else {
      signals.push({
        type: "weak_lactate_threshold",
        strength: "moderate",
        strengthScore: 50,
        evidence: "No quality sessions in 14 days — threshold fitness may be declining",
        coachingNote: "Schedule at least one tempo or threshold session per week.",
      });
    }
  }

  // ── SIGNAL 3: RACE SPECIFIC ENDURANCE ───────────────────────────────────
  const raceDist = state.race_distance as string;
  const longestRecent = Number(state.longest_run_recent_km) || 0;

  const raceDistMinLong: Record<string, number> = {
    marathon: 28,
    half: 18,
    ultra: 35,
    "10k": 14,
    "5k": 8,
  };

  const required = raceDistMinLong[raceDist] || 0;
  if (required > 0 && longestRecent < required) {
    const gap = required - longestRecent;
    const severity = gap > 10 ? "strong" : "moderate";
    signals.push({
      type: "poor_race_specific_endurance",
      strength: severity,
      strengthScore: severity === "strong" ? 80 : 55,
      evidence: `Longest recent run ${longestRecent.toFixed(1)}km — need ${required}km+ for ${raceDist}`,
      coachingNote: "Progressive long run build is the priority. Add race-pace segments to long runs.",
    });
  }

  // ── SIGNAL 4: OVERTRAINING RISK ─────────────────────────────────────────
  const overtrainingFlags: string[] = [];
  const tsb = Number(state.tsb) || 0;
  if (tsb < -25) overtrainingFlags.push(`TSB at ${tsb.toFixed(1)} (deep fatigue)`);

  const hrvSuppressed = Number(state.hrv_consecutive_days_suppressed) || 0;
  if (hrvSuppressed >= 3) overtrainingFlags.push(`HRV suppressed ${hrvSuppressed} consecutive days`);

  const rhrDeviation = Number(state.rhr_bpm_from_baseline) || 0;
  if (rhrDeviation > 7) overtrainingFlags.push(`RHR ${rhrDeviation}bpm above baseline`);

  const loadInc7 = Number(state.load_increase_7day_percent) || 0;
  if (loadInc7 > 15) overtrainingFlags.push(`Week load increase ${loadInc7}%`);

  const sleepPoorNights = Number(state.sleep_consecutive_poor_nights) || 0;
  if (sleepPoorNights >= 3) overtrainingFlags.push(`${sleepPoorNights} consecutive poor sleep nights`);

  const consecutiveRunDays = Number(state.consecutive_run_days) || 0;
  if (consecutiveRunDays >= 5) overtrainingFlags.push(`${consecutiveRunDays} consecutive run days`);

  if (overtrainingFlags.length >= 2) {
    const severity = overtrainingFlags.length >= 4 ? "critical" : "strong";
    signals.push({
      type: "overtraining_risk",
      strength: severity,
      strengthScore: severity === "critical" ? 100 : 85,
      evidence: overtrainingFlags.join(" | "),
      coachingNote: severity === "critical"
        ? "IMMEDIATE load reduction required. Force recovery week — 65% volume, no hard sessions."
        : "Accumulated fatigue detected. Reduce intensity this week, prioritize recovery.",
    });
  }

  // ── SIGNAL 5: PERFORMANCE PLATEAU ───────────────────────────────────────
  const adaptationRate = state.adaptation_rate as string;
  const weeklyTrend = state.weekly_km_trend as string;

  if (fitTrajectory === "plateau" && adaptationRate === "slow" && weeklyTrend === "stable") {
    signals.push({
      type: "performance_plateau",
      strength: "strong",
      strengthScore: 70,
      evidence: "CTL flat for 3+ weeks with consistent training — current stimulus is no longer driving adaptation",
      coachingNote: "Stimulus change needed — vary workout types, add hill work, fartlek, or change session composition.",
    });
  } else if (fitTrajectory === "plateau") {
    signals.push({
      type: "performance_plateau",
      strength: "moderate",
      strengthScore: 50,
      evidence: "Fitness trajectory plateauing — may need training variety",
      coachingNote: "Consider adding new workout types or adjusting intensity distribution.",
    });
  }

  // ── SIGNAL 6: INJURY RISK ──────────────────────────────────────────────
  const injuryScore = Number(state.injury_risk_score) || 0;
  if (injuryScore > 80) {
    signals.push({
      type: "injury_risk_high",
      strength: "critical",
      strengthScore: 95,
      evidence: `Injury risk score ${injuryScore}/100 — multiple risk factors elevated`,
      coachingNote: "Reduce volume 30%, eliminate all high-impact sessions, focus on recovery and mobility.",
    });
  } else if (injuryScore > 65) {
    signals.push({
      type: "injury_risk_high",
      strength: "strong",
      strengthScore: 75,
      evidence: `Injury risk score ${injuryScore}/100 — approaching danger zone`,
      coachingNote: "Cap volume at current level, ensure rest days, monitor for pain or asymmetry.",
    });
  }

  // ── SIGNAL 7: INSUFFICIENT VOLUME ───────────────────────────────────────
  const vo2max = Number(state.vo2max) || 50;
  const weeklyKm = Number(state.weekly_km_current) || 0;
  const readinessStatus = state.readiness_status as string;
  const expectedMinVolume = vo2max * 0.8;

  if (weeklyKm < expectedMinVolume && readinessStatus === "optimal" && tsb > 5) {
    signals.push({
      type: "insufficient_volume",
      strength: "moderate",
      strengthScore: 45,
      evidence: `Running ${weeklyKm.toFixed(0)}km/week but fitness level supports ${expectedMinVolume.toFixed(0)}km+ — athlete is fresh but undertrained`,
      coachingNote: "Gradually increase weekly volume by 8-10% per week to match fitness capacity.",
    });
  }

  // ── SIGNAL 8: PRE-RACE PEAK ────────────────────────────────────────────
  if (weeksToRace != null && weeksToRace <= 3 && weeksToRace > 0) {
    signals.push({
      type: "pre_race_peak",
      strength: "critical",
      strengthScore: 100,
      evidence: `${weeksToRace} weeks to race — taper window active`,
      coachingNote: `Begin ${weeksToRace <= 1 ? "final" : "progressive"} taper. Reduce volume, maintain sharpness with short race-pace strides.`,
    });
  }

  // ── DEFAULT: BALANCED ───────────────────────────────────────────────────
  if (signals.length === 0) {
    signals.push({
      type: "balanced_fitness",
      strength: "weak",
      strengthScore: 0,
      evidence: "No significant bottleneck detected — well-rounded fitness profile",
      coachingNote: "Continue current training with gradual progression. Focus on consistency.",
    });
  }

  return signals;
}

function selectPrimary(signals: Signal[]): Signal {
  // Priority override order
  const critical = signals.filter((s) => s.strength === "critical");

  const overtraining = critical.find((s) => s.type === "overtraining_risk");
  if (overtraining) return overtraining;

  const injury = critical.find((s) => s.type === "injury_risk_high");
  if (injury) return injury;

  const peak = signals.find((s) => s.type === "pre_race_peak");
  if (peak) return peak;

  // Otherwise, highest strength score wins
  signals.sort((a, b) => b.strengthScore - a.strengthScore);
  return signals[0];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const auth = await authenticateUser(req);
    if ("error" in auth) return jsonResponse({ error: auth.error }, 401);

    const body = await req.json().catch(() => ({}));
    const userId = (body.user_id as string) || auth.userId;

    const sb = getSupabaseAdmin();

    // Get current athlete state
    const { data: state, error: stateErr } = await sb
      .from("athlete_state")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (stateErr || !state) {
      return jsonResponse({
        error: "No athlete state found. Run ingest-athlete-data first.",
      }, 400);
    }

    // Get previous bottleneck for comparison
    const { data: prevAnalysis } = await sb
      .from("bottleneck_analyses")
      .select("primary_bottleneck")
      .eq("user_id", userId)
      .order("analyzed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const previousBottleneck = prevAnalysis?.primary_bottleneck ?? null;

    // Run detection
    const allSignals = detectSignals(state);
    const primary = selectPrimary(allSignals);
    const secondary = allSignals
      .filter((s) => s.type !== primary.type)
      .sort((a, b) => b.strengthScore - a.strengthScore)
      .slice(0, 2);

    const bottleneckChanged = previousBottleneck != null &&
      previousBottleneck !== primary.type;

    // Determine confidence
    const signalCount = allSignals.filter((s) => s.strengthScore > 40).length;
    const confidence: "high" | "medium" | "low" =
      primary.strengthScore >= 80 && signalCount <= 2 ? "high"
        : primary.strengthScore >= 50 ? "medium"
        : "low";

    const result = {
      primary_bottleneck: primary.type,
      primary_strength: primary.strength,
      primary_evidence: primary.evidence,
      primary_coaching_note: primary.coachingNote,
      secondary_signals: secondary.map((s) => ({
        type: s.type,
        strength: s.strength,
        evidence: s.evidence,
        coaching_note: s.coachingNote,
      })),
      all_signals: allSignals.map((s) => ({
        type: s.type,
        strength: s.strength,
        strength_score: s.strengthScore,
        evidence: s.evidence,
      })),
      confidence,
      previous_bottleneck: previousBottleneck,
      bottleneck_changed: bottleneckChanged,
    };

    // Store analysis
    await sb.from("bottleneck_analyses").insert({
      user_id: userId,
      primary_bottleneck: primary.type,
      primary_strength: primary.strength,
      primary_evidence: primary.evidence,
      primary_coaching_note: primary.coachingNote,
      secondary_signals: result.secondary_signals,
      all_signals: result.all_signals,
      confidence,
      previous_bottleneck: previousBottleneck,
      bottleneck_changed: bottleneckChanged,
      athlete_state_snapshot: state,
    });

    return jsonResponse(result);
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
