// Calculate fitness metrics: CTL/ATL/TSB, VO2max, thresholds, aerobic decoupling.
// POST /functions/v1/calculate-fitness-metrics
// Body: { user_id?: string, run_id?: string }
// Called after every new run sync + weekly on schedule.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { getSupabaseAdmin, authenticateUser } from "../_shared/supabase_admin.ts";

// ── VDOT lookup (Jack Daniels) ────────────────────────────────────────────────
const VDOT_TABLE: Array<{ vdot: number; velocity_ml: number }> = [
  { vdot: 30, velocity_ml: 167 }, { vdot: 35, velocity_ml: 195 },
  { vdot: 40, velocity_ml: 223 }, { vdot: 45, velocity_ml: 251 },
  { vdot: 50, velocity_ml: 279 }, { vdot: 55, velocity_ml: 307 },
  { vdot: 60, velocity_ml: 335 }, { vdot: 65, velocity_ml: 363 },
  { vdot: 70, velocity_ml: 391 }, { vdot: 75, velocity_ml: 419 },
  { vdot: 80, velocity_ml: 447 }, { vdot: 85, velocity_ml: 475 },
];

function estimateVDOT(paceSecPerKm: number, durationMin: number): number | null {
  if (paceSecPerKm <= 0 || durationMin < 12) return null;
  const velocityMPerMin = 1000 / (paceSecPerKm / 60);
  const percentVO2 = 0.8 + 0.1894393 * Math.exp(-0.012778 * durationMin)
    + 0.2989558 * Math.exp(-0.1932605 * durationMin);
  const vo2 = -4.60 + 0.182258 * velocityMPerMin
    + 0.000104 * velocityMPerMin * velocityMPerMin;
  const vdot = vo2 / percentVO2;
  return Math.max(20, Math.min(85, Math.round(vdot * 10) / 10));
}

// ── TSS calculation ───────────────────────────────────────────────────────────
function calculateTSS(
  durationSec: number,
  normalizedPaceSec: number,
  thresholdPaceSec: number,
): { tss: number; intensityFactor: number } {
  if (!durationSec || !normalizedPaceSec || !thresholdPaceSec) {
    return { tss: 0, intensityFactor: 0 };
  }
  const intensityFactor = thresholdPaceSec / normalizedPaceSec;
  const durationHours = durationSec / 3600;
  const tss = durationHours * intensityFactor * intensityFactor * 100;
  return {
    tss: Math.round(tss * 100) / 100,
    intensityFactor: Math.round(intensityFactor * 10000) / 10000,
  };
}

// ── Aerobic decoupling ────────────────────────────────────────────────────────
function calculateDecoupling(
  distanceMeters: number,
  durationSeconds: number,
  avgHR: number,
): number | null {
  if (!distanceMeters || !durationSeconds || !avgHR || durationSeconds < 1200) {
    return null;
  }
  const paceEff = (distanceMeters / 1000) / (durationSeconds / 60);
  const firstHalfEff = paceEff / avgHR;
  const estimatedSecondHalfEff = paceEff * 0.97 / (avgHR * 1.02);
  const decoupling = ((firstHalfEff - estimatedSecondHalfEff) / firstHalfEff) * 100;
  return Math.round(decoupling * 100) / 100;
}

// ── Exponential weighted moving average ───────────────────────────────────────
function ewma(dailyValues: number[], timeconstant: number): number {
  if (dailyValues.length === 0) return 0;
  const alpha = 2 / (timeconstant + 1);
  let result = dailyValues[0];
  for (let i = 1; i < dailyValues.length; i++) {
    result = alpha * dailyValues[i] + (1 - alpha) * result;
  }
  return Math.round(result * 100) / 100;
}

// ── Threshold detection via pace-HR regression ────────────────────────────────
function detectThreshold(
  runs: Array<{ pace_sec: number; avg_hr: number }>,
): { thresholdPaceSec: number; thresholdHR: number } | null {
  const valid = runs.filter((r) => r.pace_sec > 0 && r.avg_hr > 0);
  if (valid.length < 5) return null;

  valid.sort((a, b) => b.pace_sec - a.pace_sec);

  let maxDiff = 0;
  let inflectionIdx = Math.floor(valid.length / 2);

  for (let i = 1; i < valid.length - 1; i++) {
    const prevSlope = (valid[i].avg_hr - valid[i - 1].avg_hr) /
      (valid[i].pace_sec - valid[i - 1].pace_sec || 1);
    const nextSlope = (valid[i + 1].avg_hr - valid[i].avg_hr) /
      (valid[i + 1].pace_sec - valid[i].pace_sec || 1);
    const diff = Math.abs(nextSlope - prevSlope);
    if (diff > maxDiff) {
      maxDiff = diff;
      inflectionIdx = i;
    }
  }

  return {
    thresholdPaceSec: Math.round(valid[inflectionIdx].pace_sec),
    thresholdHR: Math.round(valid[inflectionIdx].avg_hr),
  };
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateOffset(d: string, days: number): string {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();

  try {
    const auth = await authenticateUser(req);
    if ("error" in auth) return jsonResponse({ error: auth.error }, 401);

    const body = await req.json().catch(() => ({}));
    const userId = (body.user_id as string) || auth.userId;
    const runId = body.run_id as string | undefined;

    const sb = getSupabaseAdmin();
    const today = todayISO();

    // Fetch all runs for the last 90 days (enough for 42-day CTL)
    const ninetyDaysAgo = dateOffset(today, -90);
    const { data: runs } = await sb
      .from("runs")
      .select("id, started_at, distance_meters, duration_seconds, avg_hr, tss, intensity_factor, normalized_pace_sec, aerobic_decoupling, max_hr")
      .eq("user_id", userId)
      .gte("started_at", ninetyDaysAgo)
      .order("started_at", { ascending: true });

    if (!runs || runs.length === 0) {
      return jsonResponse({ ok: false, message: "No runs to analyze" });
    }

    // Get onboarding data for threshold estimate
    const { data: onboarding } = await sb
      .from("onboarding_progress")
      .select("payload")
      .eq("user_id", userId)
      .maybeSingle();
    const payload = (onboarding?.payload as Record<string, unknown>) || {};

    // Get existing athlete state
    const { data: existingState } = await sb
      .from("athlete_state")
      .select("threshold_pace_sec_per_km, vo2max")
      .eq("user_id", userId)
      .maybeSingle();

    // Parse threshold pace from onboarding (e.g., "4:52")
    function parsePaceToSec(pace: string | undefined): number | null {
      if (!pace) return null;
      const parts = pace.split(":");
      if (parts.length !== 2) return null;
      return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }

    let thresholdPaceSec = existingState?.threshold_pace_sec_per_km
      ?? parsePaceToSec(payload.threshold_pace as string)
      ?? 292;

    // ── Per-run metrics ───────────────────────────────────────────────────
    const updatedRuns: Array<{
      id: string;
      tss: number;
      intensityFactor: number;
      normalizedPace: number;
      decoupling: number | null;
      vdot: number | null;
      date: string;
      paceSecPerKm: number;
      avgHR: number;
    }> = [];

    for (const run of runs) {
      const distM = Number(run.distance_meters) || 0;
      const durS = Number(run.duration_seconds) || 0;
      if (distM < 500 || durS < 300) continue;

      const paceSecPerKm = (durS / (distM / 1000));
      const normalizedPace = paceSecPerKm * 0.98; // simplified graded pace
      const { tss, intensityFactor } = calculateTSS(durS, normalizedPace, thresholdPaceSec);
      const decoupling = calculateDecoupling(distM, durS, run.avg_hr ?? 0);
      const durationMin = durS / 60;
      const vdot = estimateVDOT(paceSecPerKm, durationMin);

      updatedRuns.push({
        id: run.id,
        tss,
        intensityFactor,
        normalizedPace,
        decoupling,
        vdot,
        date: run.started_at?.slice(0, 10) || today,
        paceSecPerKm,
        avgHR: run.avg_hr ?? 0,
      });

      if (!run.tss || !run.intensity_factor) {
        await sb.from("runs").update({
          tss,
          intensity_factor: intensityFactor,
          normalized_pace_sec: normalizedPace,
          aerobic_decoupling: decoupling,
        }).eq("id", run.id);
      }
    }

    // ── Build daily TSS array for CTL/ATL ─────────────────────────────────
    const dailyTSS: Map<string, number> = new Map();
    for (const r of updatedRuns) {
      const existing = dailyTSS.get(r.date) || 0;
      dailyTSS.set(r.date, existing + r.tss);
    }

    const allDays: number[] = [];
    const startDate = new Date(ninetyDaysAgo);
    const endDate = new Date(today);
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      allDays.push(dailyTSS.get(key) || 0);
    }

    const ctl = ewma(allDays, 42);
    const atl = ewma(allDays, 7);
    const tsb = Math.round((ctl - atl) * 100) / 100;

    // ── VO2max estimation (weighted recent) ───────────────────────────────
    const vdotValues = updatedRuns
      .filter((r) => r.vdot != null)
      .map((r, i, arr) => ({
        vdot: r.vdot!,
        weight: (i + 1) / arr.length,
      }));

    let vo2max: number | null = null;
    let vo2maxConfidence: "high" | "medium" | "low" = "low";
    if (vdotValues.length > 0) {
      const totalWeight = vdotValues.reduce((s, v) => s + v.weight, 0);
      vo2max = Math.round(
        (vdotValues.reduce((s, v) => s + v.vdot * v.weight, 0) / totalWeight) * 10,
      ) / 10;
      vo2maxConfidence = vdotValues.length >= 10 ? "high" : vdotValues.length >= 5 ? "medium" : "low";
    }

    // ── Threshold detection ───────────────────────────────────────────────
    const paceHRPairs = updatedRuns
      .filter((r) => r.avgHR > 0)
      .map((r) => ({ pace_sec: r.paceSecPerKm, avg_hr: r.avgHR }));

    const thresholdResult = detectThreshold(paceHRPairs);
    if (thresholdResult) {
      thresholdPaceSec = thresholdResult.thresholdPaceSec;
    }

    // ── Decoupling average (last 4 weeks) ─────────────────────────────────
    const fourWeeksAgo = dateOffset(today, -28);
    const recentDecouplings = updatedRuns
      .filter((r) => r.date >= fourWeeksAgo && r.decoupling != null)
      .map((r) => r.decoupling!);
    const avgDecoupling = recentDecouplings.length > 0
      ? Math.round(
          (recentDecouplings.reduce((s, d) => s + d, 0) / recentDecouplings.length) * 100,
        ) / 100
      : null;

    // ── Weekly volumes ────────────────────────────────────────────────────
    function weeklyKm(startDay: string, endDay: string): number {
      return updatedRuns
        .filter((r) => r.date >= startDay && r.date <= endDay)
        .reduce((s, r) => {
          const run = runs?.find((x) => x.id === r.id);
          return s + ((Number(run?.distance_meters) || 0) / 1000);
        }, 0);
    }

    const weekStart = dateOffset(today, -((new Date(today).getDay() + 6) % 7));
    const currentWeekKm = weeklyKm(weekStart, today);

    const weekAvgs: number[] = [];
    for (let w = 1; w <= 8; w++) {
      const ws = dateOffset(weekStart, -7 * w);
      const we = dateOffset(ws, 6);
      weekAvgs.push(weeklyKm(ws, we));
    }
    const avg4week = weekAvgs.slice(0, 4).reduce((s, v) => s + v, 0) / 4;
    const avg8week = weekAvgs.reduce((s, v) => s + v, 0) / 8;

    // ── TSS sums ──────────────────────────────────────────────────────────
    const sevenDaysAgo = dateOffset(today, -7);
    const twentyEightDaysAgo = dateOffset(today, -28);
    const tss7 = updatedRuns
      .filter((r) => r.date >= sevenDaysAgo)
      .reduce((s, r) => s + r.tss, 0);
    const tss28runs = updatedRuns.filter((r) => r.date >= twentyEightDaysAgo);
    const tss28avg = tss28runs.length > 0
      ? tss28runs.reduce((s, r) => s + r.tss, 0) / 4
      : 0;

    // ── Longest runs ──────────────────────────────────────────────────────
    const longestRecent = Math.max(
      ...updatedRuns
        .filter((r) => r.date >= fourWeeksAgo)
        .map((r) => {
          const run = runs?.find((x) => x.id === r.id);
          return (Number(run?.distance_meters) || 0) / 1000;
        }),
      0,
    );
    const longestEver = Math.max(
      ...updatedRuns.map((r) => {
        const run = runs?.find((x) => x.id === r.id);
        return (Number(run?.distance_meters) || 0) / 1000;
      }),
      0,
    );

    // ── Intensity distribution (7 day) ────────────────────────────────────
    const recentRuns7 = updatedRuns.filter((r) => r.date >= sevenDaysAgo);
    const totalDur7 = recentRuns7.reduce((s, r) => {
      const run = runs?.find((x) => x.id === r.id);
      return s + (Number(run?.duration_seconds) || 0);
    }, 0);

    let easyPct = 80, moderatePct = 10, hardPct = 10;
    if (totalDur7 > 0) {
      let easyDur = 0, modDur = 0, hardDur = 0;
      for (const r of recentRuns7) {
        const run = runs?.find((x) => x.id === r.id);
        const dur = Number(run?.duration_seconds) || 0;
        if (r.intensityFactor < 0.75) easyDur += dur;
        else if (r.intensityFactor < 0.88) modDur += dur;
        else hardDur += dur;
      }
      easyPct = Math.round((easyDur / totalDur7) * 100);
      moderatePct = Math.round((modDur / totalDur7) * 100);
      hardPct = 100 - easyPct - moderatePct;
    }

    // ── Determine trends ──────────────────────────────────────────────────
    const prevVO2 = existingState?.vo2max;
    let vo2maxTrend: "improving" | "stable" | "declining" = "stable";
    if (vo2max != null && prevVO2 != null) {
      const diff = vo2max - Number(prevVO2);
      if (diff > 0.5) vo2maxTrend = "improving";
      else if (diff < -0.5) vo2maxTrend = "declining";
    }

    const weeklyKmTrend: "building" | "stable" | "declining" =
      avg4week > avg8week * 1.05 ? "building"
        : avg4week < avg8week * 0.95 ? "declining"
        : "stable";

    // ── Load increases ────────────────────────────────────────────────────
    const lastWeekKm = weekAvgs[0] || 0;
    const loadIncrease7 = lastWeekKm > 0
      ? Math.round(((currentWeekKm - lastWeekKm) / lastWeekKm) * 100)
      : 0;
    const fourWeekAgoKm = weekAvgs[3] || 0;
    const loadIncrease28 = fourWeekAgoKm > 0
      ? Math.round(((avg4week - fourWeekAgoKm) / fourWeekAgoKm) * 100)
      : 0;

    // ── Upsert into athlete_state ─────────────────────────────────────────
    const stateUpdate = {
      user_id: userId,
      vo2max,
      vo2max_confidence: vo2maxConfidence,
      vo2max_trend: vo2maxTrend,
      threshold_pace_sec_per_km: thresholdPaceSec,
      threshold_hr: thresholdResult?.thresholdHR ?? null,
      aerobic_threshold_hr: thresholdResult
        ? Math.round(thresholdResult.thresholdHR * 0.77)
        : null,
      aerobic_threshold_pace_sec: thresholdPaceSec
        ? Math.round(thresholdPaceSec * 1.15)
        : null,
      easy_pace_min_sec: thresholdPaceSec
        ? Math.round(thresholdPaceSec * 1.2)
        : null,
      easy_pace_max_sec: thresholdPaceSec
        ? Math.round(thresholdPaceSec * 1.35)
        : null,
      recovery_pace_sec: thresholdPaceSec
        ? Math.round(thresholdPaceSec * 1.4)
        : null,
      aerobic_decoupling_avg: avgDecoupling,
      ctl,
      atl,
      tsb,
      weekly_km_current: Math.round(currentWeekKm * 100) / 100,
      weekly_km_4week_avg: Math.round(avg4week * 100) / 100,
      weekly_km_8week_avg: Math.round(avg8week * 100) / 100,
      weekly_km_trend: weeklyKmTrend,
      load_increase_7day_percent: loadIncrease7,
      load_increase_28day_percent: loadIncrease28,
      intensity_easy_percent: easyPct,
      intensity_moderate_percent: moderatePct,
      intensity_hard_percent: hardPct,
      tss_7day: Math.round(tss7 * 100) / 100,
      tss_28day_avg: Math.round(tss28avg * 100) / 100,
      longest_run_recent_km: Math.round(longestRecent * 10) / 10,
      longest_run_ever_km: Math.round(longestEver * 10) / 10,
      updated_at: new Date().toISOString(),
    };

    await sb.from("athlete_state").upsert(stateUpdate, { onConflict: "user_id" });

    return jsonResponse({
      ok: true,
      ctl,
      atl,
      tsb,
      vo2max,
      vo2max_confidence: vo2maxConfidence,
      threshold_pace_sec: thresholdPaceSec,
      aerobic_decoupling_avg: avgDecoupling,
      weekly_km_current: currentWeekKm,
      weekly_km_4week_avg: avg4week,
      intensity_distribution: { easy: easyPct, moderate: moderatePct, hard: hardPct },
      runs_analyzed: updatedRuns.length,
    });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
