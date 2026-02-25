// Ingest athlete data: collect and normalize ALL data sources into unified AthleteState.
// POST /functions/v1/ingest-athlete-data
// Body: { user_id?: string }
// Called after every sync from Strava/Apple Watch and at onboarding completion.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { getSupabaseAdmin, authenticateUser } from "../_shared/supabase_admin.ts";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateOffset(d: string, days: number): string {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
}

function mean(arr: (number | null)[]): number | null {
  const v = arr.filter((x): x is number => x != null);
  if (v.length === 0) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function trend(values: (number | null)[]): "improving" | "stable" | "declining" {
  const v = values.filter((x): x is number => x != null);
  if (v.length < 3) return "stable";
  const firstHalf = v.slice(0, Math.ceil(v.length / 2));
  const secondHalf = v.slice(-Math.ceil(v.length / 2));
  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  const pct = ((avgSecond - avgFirst) / Math.abs(avgFirst || 1)) * 100;
  if (pct > 3) return "improving";
  if (pct < -3) return "declining";
  return "stable";
}

function hrvTrend(
  values: (number | null)[],
): "improving" | "stable" | "declining" | "volatile" {
  const v = values.filter((x): x is number => x != null);
  if (v.length < 5) return "stable";
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  const std = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length);
  const cv = std / (m || 1);
  if (cv > 0.25) return "volatile";
  return trend(values) as "improving" | "stable" | "declining";
}

function consecutiveBelowBaseline(
  values: (number | null)[],
  baseline: number | null,
): number {
  if (baseline == null) return 0;
  let count = 0;
  for (const v of values) {
    if (v != null && v < baseline * 0.9) count++;
    else break;
  }
  return count;
}

function consecutivePoorSleep(
  scores: (number | null)[],
  baseline: number | null,
): number {
  if (baseline == null) return 0;
  const threshold = baseline * 0.8;
  let count = 0;
  for (const s of scores) {
    if (s != null && s < threshold) count++;
    else break;
  }
  return count;
}

function classifyReadiness(
  hrvPctFromBaseline: number | null,
  rhrDeviation: number | null,
  sleepScore: number | null,
  sleepBaseline: number | null,
): { score: number; status: "optimal" | "suboptimal" | "poor" | "very_poor" } {
  let score = 75;

  if (hrvPctFromBaseline != null) {
    if (hrvPctFromBaseline > 10) score += 15;
    else if (hrvPctFromBaseline > 0) score += 8;
    else if (hrvPctFromBaseline > -10) score -= 5;
    else if (hrvPctFromBaseline > -20) score -= 15;
    else score -= 25;
  }

  if (rhrDeviation != null) {
    if (rhrDeviation <= 0) score += 5;
    else if (rhrDeviation <= 3) score -= 3;
    else if (rhrDeviation <= 7) score -= 10;
    else score -= 20;
  }

  if (sleepScore != null && sleepBaseline != null) {
    const sleepPct = ((sleepScore - sleepBaseline) / (sleepBaseline || 1)) * 100;
    if (sleepPct > 5) score += 5;
    else if (sleepPct < -15) score -= 15;
    else if (sleepPct < -5) score -= 5;
  }

  score = Math.max(0, Math.min(100, score));
  const status =
    score >= 75 ? "optimal" : score >= 55 ? "suboptimal" : score >= 35 ? "poor" : "very_poor";
  return { score, status };
}

function classifyFitnessTrajectory(
  ctlValues: number[],
): "rapid_improvement" | "steady_improvement" | "plateau" | "slight_decline" | "significant_decline" {
  if (ctlValues.length < 7) return "plateau";
  const recent = ctlValues.slice(-7);
  const prior = ctlValues.slice(-14, -7);
  if (prior.length === 0) return "plateau";
  const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
  const avgPrior = prior.reduce((a, b) => a + b, 0) / prior.length;
  const pct = ((avgRecent - avgPrior) / (avgPrior || 1)) * 100;
  if (pct > 8) return "rapid_improvement";
  if (pct > 3) return "steady_improvement";
  if (pct > -3) return "plateau";
  if (pct > -8) return "slight_decline";
  return "significant_decline";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const auth = await authenticateUser(req);
    if ("error" in auth) return jsonResponse({ error: auth.error }, 401);

    const body = await req.json().catch(() => ({}));
    const userId = (body.user_id as string) || auth.userId;

    const sb = getSupabaseAdmin();
    const today = todayISO();

    // ── Parallel data fetches ─────────────────────────────────────────────
    const [
      stateRes,
      wellnessRes,
      wellness60Res,
      baselinesRes,
      planRes,
      onboardingRes,
      runsRes,
    ] = await Promise.all([
      sb.from("athlete_state").select("*").eq("user_id", userId).maybeSingle(),
      sb.from("apple_wellness").select("*").eq("user_id", userId)
        .order("date", { ascending: false }).limit(7),
      sb.from("apple_wellness").select("hrv_last_night, resting_heart_rate, sleep_score, date")
        .eq("user_id", userId).order("date", { ascending: false }).limit(60),
      sb.from("user_baselines").select("*").eq("user_id", userId).maybeSingle(),
      sb.from("training_plans").select("*").eq("user_id", userId).eq("is_active", true).maybeSingle(),
      sb.from("onboarding_progress").select("payload").eq("user_id", userId).maybeSingle(),
      sb.from("runs").select("id, started_at, distance_meters, duration_seconds, avg_hr, tss, aerobic_decoupling")
        .eq("user_id", userId).order("started_at", { ascending: false }).limit(200),
    ]);

    const currentState = stateRes.data || {};
    const wellness7 = wellnessRes.data || [];
    const wellness60 = wellness60Res.data || [];
    const baselines = baselinesRes.data || {};
    const plan = planRes.data;
    const payload = (onboardingRes.data?.payload as Record<string, unknown>) || {};
    const allRuns = runsRes.data || [];

    // ── Recovery signals ──────────────────────────────────────────────────
    const todayWellness = wellness7.find((w) => w.date === today);
    const hrvValues = wellness7.map((w) => w.hrv_last_night);
    const rhrValues = wellness7.map((w) => w.resting_heart_rate);
    const sleepScores = wellness7.map((w) => w.sleep_score);
    const hrv60Values = wellness60.map((w) => w.hrv_last_night);

    const hrvToday = todayWellness?.hrv_last_night ?? null;
    const hrv7Avg = mean(hrvValues);
    const hrv60Avg = mean(hrv60Values) ?? (baselines.hrv_baseline_avg as number) ?? null;
    const hrvPctFromBaseline = hrvToday != null && hrv60Avg != null
      ? Math.round(((hrvToday - hrv60Avg) / hrv60Avg) * 100)
      : null;
    const hrvSuppressed = consecutiveBelowBaseline(hrvValues, hrv60Avg);

    const rhrToday = todayWellness?.resting_heart_rate ?? null;
    const rhr30Avg = (baselines.rhr_baseline_avg as number) ?? mean(rhrValues);
    const rhrDeviation = rhrToday != null && rhr30Avg != null
      ? Math.round(rhrToday - rhr30Avg)
      : null;

    const sleepLast = todayWellness?.sleep_score ?? null;
    const sleepDuration = todayWellness?.sleep_duration_seconds
      ? todayWellness.sleep_duration_seconds / 3600
      : null;
    const sleepDeepPct = todayWellness?.sleep_deep_seconds && todayWellness?.sleep_duration_seconds
      ? Math.round((todayWellness.sleep_deep_seconds / todayWellness.sleep_duration_seconds) * 100)
      : null;
    const sleep30Avg = (baselines.sleep_baseline_avg as number) ?? mean(sleepScores);
    const sleepPoorNights = consecutivePoorSleep(sleepScores, sleep30Avg);

    const readiness = classifyReadiness(hrvPctFromBaseline, rhrDeviation, sleepLast, sleep30Avg);

    // ── Training load signals ─────────────────────────────────────────────
    const HARD_TYPES = new Set(["tempo", "intervals", "threshold", "long", "progression"]);
    const fourteenDaysAgo = dateOffset(today, -14);
    const recentRuns14 = allRuns.filter((r) =>
      r.started_at && r.started_at.slice(0, 10) >= fourteenDaysAgo
    );

    let consecutiveRunDays = 0;
    const sorted = [...allRuns].sort((a, b) => (b.started_at || "").localeCompare(a.started_at || ""));
    let expectDate = today;
    for (const r of sorted) {
      const d = r.started_at?.slice(0, 10);
      if (d === expectDate) {
        consecutiveRunDays++;
        const next = new Date(expectDate);
        next.setDate(next.getDate() - 1);
        expectDate = next.toISOString().slice(0, 10);
      } else break;
    }

    let daysSinceRest: number | null = null;
    for (let i = 0; i < 30; i++) {
      const checkDate = dateOffset(today, -i);
      const hasRun = allRuns.some((r) => r.started_at?.slice(0, 10) === checkDate);
      if (!hasRun) { daysSinceRest = i; break; }
    }

    let daysSinceHard: number | null = null;
    for (const r of sorted) {
      // We'd need session type — approximate from pace
      const dist = Number(r.distance_meters) || 0;
      const dur = Number(r.duration_seconds) || 0;
      if (dist > 0 && dur > 0) {
        const tss = Number(r.tss) || 0;
        if (tss > 80) {
          const d = r.started_at?.slice(0, 10);
          if (d) {
            daysSinceHard = Math.round(
              (new Date(today).getTime() - new Date(d).getTime()) / 86400000,
            );
            break;
          }
        }
      }
    }

    const hardSessions14 = recentRuns14.filter((r) => (Number(r.tss) || 0) > 80).length;

    // ── Biomechanics (from most recent run with data) ─────────────────────
    const biomechanics = {
      cadence_avg: currentState.cadence_avg ?? null,
      cadence_trend: currentState.cadence_trend ?? null,
      ground_contact_time_avg: currentState.ground_contact_time_avg ?? null,
      vertical_oscillation_avg: currentState.vertical_oscillation_avg ?? null,
      stride_length_avg: currentState.stride_length_avg ?? null,
      running_power_avg: currentState.running_power_avg ?? null,
      cadence_drops_on_long_runs: currentState.cadence_drops_on_long_runs ?? false,
      asymmetry_detected: currentState.asymmetry_detected ?? false,
      efficiency_declining_with_fatigue: currentState.efficiency_declining_with_fatigue ?? false,
    };

    // ── Injury risk ───────────────────────────────────────────────────────
    let injuryRiskScore = currentState.injury_risk_score ?? 20;
    const loadInc7 = currentState.load_increase_7day_percent ?? 0;
    if (loadInc7 > 15) injuryRiskScore += 20;
    else if (loadInc7 > 10) injuryRiskScore += 10;
    if ((currentState.atl ?? 0) > 0 && (currentState.ctl ?? 1) > 0) {
      const atlCtlRatio = (currentState.atl ?? 0) / (currentState.ctl ?? 1);
      if (atlCtlRatio > 1.5) injuryRiskScore += 15;
    }
    if ((currentState.tsb ?? 0) < -30) injuryRiskScore += 15;
    if (consecutiveRunDays > 5) injuryRiskScore += 10;
    injuryRiskScore = Math.max(0, Math.min(100, injuryRiskScore));

    // ── Goal state ────────────────────────────────────────────────────────
    const raceDate = plan?.race_date ?? (payload.race_date as string) ?? null;
    const weeksToRace = raceDate
      ? Math.max(0, Math.ceil((new Date(raceDate).getTime() - Date.now()) / 604800000))
      : null;

    const goalDistMap: Record<string, string> = {
      "5K": "5k", "10K": "10k", "Half Marathon": "half",
      "Marathon": "marathon", "Ultra": "ultra",
    };
    const goalStr = plan?.goal ?? (payload.goal as string) ?? "fitness";
    const raceDistance = goalDistMap[goalStr] ?? goalStr?.toLowerCase() ?? "fitness";

    // ── Determine plan phase ──────────────────────────────────────────────
    let planPhase: string = plan?.phase ?? "base";
    if (weeksToRace != null) {
      if (weeksToRace <= 1) planPhase = "taper";
      else if (weeksToRace <= 3) planPhase = "peak";
    }

    // ── Fitness trajectory ────────────────────────────────────────────────
    const fitnessTrajectory = classifyFitnessTrajectory(
      allRuns.slice(0, 60).reverse().map((r) => Number(r.tss) || 0),
    );

    // ── Adaptation rate ───────────────────────────────────────────────────
    const { data: recentAdaptations } = await sb
      .from("adaptation_records")
      .select("adaptation_ratio")
      .eq("user_id", userId)
      .order("week_start_date", { ascending: false })
      .limit(4);
    const avgAdaptation = mean(
      (recentAdaptations || []).map((a) => Number(a.adaptation_ratio)),
    );
    const adaptationRate: "fast" | "normal" | "slow" =
      avgAdaptation != null && avgAdaptation > 1.1 ? "fast"
        : avgAdaptation != null && avgAdaptation < 0.8 ? "slow"
        : "normal";

    // ── Consistency score ─────────────────────────────────────────────────
    const { data: recentSessions } = await sb
      .from("sessions")
      .select("status")
      .eq("user_id", userId)
      .in("status", ["completed", "planned", "missed"])
      .order("date", { ascending: false })
      .limit(28);
    const completed = (recentSessions || []).filter((s) => s.status === "completed").length;
    const total = (recentSessions || []).length;
    const consistencyScore = total > 0 ? Math.round((completed / total) * 100) : 0;

    // ── Compute plan week ─────────────────────────────────────────────────
    let planWeek = 1;
    let planTotalWeeks = plan?.total_weeks ?? 12;
    if (plan?.generated_at) {
      const elapsed = Math.floor(
        (Date.now() - new Date(plan.generated_at).getTime()) / 604800000,
      );
      planWeek = Math.min(planTotalWeeks, 1 + Math.max(0, elapsed));
    }

    // ── Build full athlete state ──────────────────────────────────────────
    const athleteState = {
      user_id: userId,
      runner_level: (payload.runner_level as string)?.toLowerCase() ?? currentState.runner_level ?? "intermediate",
      experience_years: (payload.experience_years as number) ?? currentState.experience_years ?? null,

      // Fitness (from calculate-fitness-metrics, just update recovery + injury)
      vo2max: currentState.vo2max,
      vo2max_confidence: currentState.vo2max_confidence,
      vo2max_trend: currentState.vo2max_trend,
      threshold_pace_sec_per_km: currentState.threshold_pace_sec_per_km,
      threshold_hr: currentState.threshold_hr,
      aerobic_threshold_hr: currentState.aerobic_threshold_hr,
      aerobic_threshold_pace_sec: currentState.aerobic_threshold_pace_sec,
      easy_pace_min_sec: currentState.easy_pace_min_sec,
      easy_pace_max_sec: currentState.easy_pace_max_sec,
      recovery_pace_sec: currentState.recovery_pace_sec,
      running_economy_index: currentState.running_economy_index,
      aerobic_decoupling_avg: currentState.aerobic_decoupling_avg,

      // Load (from calculate-fitness-metrics)
      ctl: currentState.ctl,
      atl: currentState.atl,
      tsb: currentState.tsb,
      weekly_km_current: currentState.weekly_km_current,
      weekly_km_4week_avg: currentState.weekly_km_4week_avg,
      weekly_km_8week_avg: currentState.weekly_km_8week_avg,
      weekly_km_trend: currentState.weekly_km_trend,
      load_increase_7day_percent: currentState.load_increase_7day_percent,
      load_increase_28day_percent: currentState.load_increase_28day_percent,
      intensity_easy_percent: currentState.intensity_easy_percent,
      intensity_moderate_percent: currentState.intensity_moderate_percent,
      intensity_hard_percent: currentState.intensity_hard_percent,
      tss_7day: currentState.tss_7day,
      tss_28day_avg: currentState.tss_28day_avg,
      longest_run_recent_km: currentState.longest_run_recent_km,
      longest_run_ever_km: currentState.longest_run_ever_km,
      consecutive_run_days: consecutiveRunDays,
      days_since_rest: daysSinceRest,
      days_since_hard_session: daysSinceHard,
      hard_sessions_last_14_days: hardSessions14,

      // Recovery
      hrv_today: hrvToday,
      hrv_7day_avg: hrv7Avg != null ? Math.round(hrv7Avg * 100) / 100 : null,
      hrv_60day_avg: hrv60Avg != null ? Math.round(hrv60Avg * 100) / 100 : null,
      hrv_trend: hrvTrend(hrv60Values),
      hrv_percent_from_baseline: hrvPctFromBaseline,
      hrv_consecutive_days_suppressed: hrvSuppressed,
      rhr_today: rhrToday,
      rhr_30day_avg: rhr30Avg != null ? Math.round(rhr30Avg * 100) / 100 : null,
      rhr_bpm_from_baseline: rhrDeviation,
      rhr_trend: trend(rhrValues),
      sleep_score_last: sleepLast,
      sleep_duration_hours_last: sleepDuration != null ? Math.round(sleepDuration * 100) / 100 : null,
      sleep_deep_percent_last: sleepDeepPct,
      sleep_30day_avg: sleep30Avg != null ? Math.round(sleep30Avg * 100) / 100 : null,
      sleep_consecutive_poor_nights: sleepPoorNights,
      readiness_score: readiness.score,
      readiness_status: readiness.status,

      // Biomechanics
      ...biomechanics,

      // Injury
      injury_risk_score: injuryRiskScore,
      injury_risk_trend: currentState.injury_risk_trend ?? "stable",
      injury_history: currentState.injury_history ?? (payload.injury_history ? [payload.injury_history] : []),
      current_issue: (payload.current_issue as string) ?? currentState.current_issue ?? null,
      vulnerable_areas: currentState.vulnerable_areas ?? [],

      // Goal
      race_distance: raceDistance,
      race_date: raceDate,
      weeks_to_race: weeksToRace,
      goal_time_seconds: (payload.goal_time_seconds as number) ?? currentState.goal_time_seconds ?? null,
      current_predicted_time: currentState.current_predicted_time ?? null,
      plan_phase: planPhase,
      plan_week: planWeek,
      plan_total_weeks: planTotalWeeks,

      // Trends
      fitness_trajectory: fitnessTrajectory,
      consistency_score: consistencyScore,
      adaptation_rate: adaptationRate,

      updated_at: new Date().toISOString(),
    };

    await sb.from("athlete_state").upsert(athleteState, { onConflict: "user_id" });

    return jsonResponse({
      ok: true,
      readiness_score: readiness.score,
      readiness_status: readiness.status,
      injury_risk_score: injuryRiskScore,
      fitness_trajectory: fitnessTrajectory,
      adaptation_rate: adaptationRate,
      consistency_score: consistencyScore,
    });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
