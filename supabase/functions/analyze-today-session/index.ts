// Analyze today's session: collect health + training + weather, call Groq, store decision.
// POST /functions/v1/analyze-today-session
// Body (optional): { manual_wellness?: { sleep_quality, energy, soreness }, force_refresh?: boolean }
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

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(d1: string, d2: string): number {
  const a = new Date(d1);
  const b = new Date(d2);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function calcTrend(values: (number | null)[]): "up" | "down" | "stable" {
  const v = values.filter((x): x is number => x != null);
  if (v.length < 2) return "stable";
  const first = v.slice(0, Math.ceil(v.length / 2)).reduce((a, b) => a + b, 0) / (v.length / 2);
  const last = v.slice(-Math.ceil(v.length / 2)).reduce((a, b) => a + b, 0) / (v.length / 2);
  const pct = ((last - first) / first) * 100;
  if (pct > 2) return "up";
  if (pct < -2) return "down";
  return "stable";
}

function countDaysBelowBaseline(values: (number | null)[], baseline: number | null): number {
  if (baseline == null) return 0;
  return values.filter((v) => v != null && v < baseline).length;
}

function countDaysElevated(values: (number | null)[], baseline: number | null): number {
  if (baseline == null) return 0;
  return values.filter((v) => v != null && v > baseline).length;
}

function pctDeviation(current: number | null, baseline: number | null): number | null {
  if (current == null || baseline == null || baseline === 0) return null;
  return Math.round(((current - baseline) / baseline) * 100);
}

function pctOf(part: number | null, total: number | null): number | null {
  if (part == null || total == null || total === 0) return null;
  return Math.round((part / total) * 100);
}

function sumTSS(runs: { tss?: number | null }[]): number {
  return runs.reduce((s, r) => s + (Number(r.tss) || 0), 0);
}

function avgTSS(runs: { tss?: number | null }[]): number {
  if (runs.length === 0) return 0;
  return sumTSS(runs) / runs.length;
}

const HARD_TYPES = new Set(["tempo", "intervals", "threshold", "long", "progression"]);

function countHardSessions(runs: { type?: string | null }[], days: number): number {
  return runs.filter((r) => HARD_TYPES.has((r.type || "").toLowerCase())).length;
}

function daysSinceLastHard(runs: { date?: string | null; type?: string | null }[]): number | null {
  for (let i = 0; i < runs.length; i++) {
    if (HARD_TYPES.has((runs[i].type || "").toLowerCase())) return runs[i].date ? daysBetween(runs[i].date, todayISO()) : i;
  }
  return null;
}

function daysSinceLastRest(runs: { date?: string | null }[], today: string): number | null {
  let lastRunDate: string | null = null;
  for (const r of runs) {
    if (r.date) lastRunDate = r.date;
  }
  if (!lastRunDate) return null;
  return daysBetween(lastRunDate, today);
}

function countConsecutiveRunDays(runs: { date?: string | null }[]): number {
  if (runs.length === 0) return 0;
  const sorted = [...runs].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  let count = 0;
  let expect = todayISO();
  for (const r of sorted) {
    const d = r.date?.slice(0, 10);
    if (d === expect) {
      count++;
      const next = new Date(expect);
      next.setDate(next.getDate() - 1);
      expect = next.toISOString().slice(0, 10);
    } else break;
  }
  return count;
}

function countConsecutivePoorSleep(
  sleepScores: (number | null)[],
  baseline: number | null
): number {
  if (baseline == null) return 0;
  const threshold = baseline * 0.85;
  let count = 0;
  for (const s of sleepScores) {
    if (s != null && s < threshold) count++;
    else break;
  }
  return count;
}

function loadIncreasePercent(thisWeek: number, lastWeek: number): number | null {
  if (lastWeek <= 0) return null;
  return Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
}

async function fetchWeather(lat?: number | null, lon?: number | null): Promise<Record<string, unknown> | null> {
  const key = Deno.env.get("OPENWEATHER_API_KEY");
  if (!key) return null;
  const lat1 = lat ?? 52.52;
  const lon1 = lon ?? 13.405;
  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat1}&lon=${lon1}&units=metric&appid=${key}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const wind = data.wind || {};
    return {
      temp: data.main?.temp ?? null,
      feels_like: data.main?.feels_like ?? null,
      humidity: data.main?.humidity ?? null,
      wind_speed_kmh: wind.speed != null ? Math.round((wind.speed * 3600) / 1000) : null,
      wind_direction: wind.deg ?? null,
      description: data.weather?.[0]?.description ?? null,
      rain_chance: null,
      aqi: null,
    };
  } catch {
    return null;
  }
}

function runningConditionsScore(weather: Record<string, unknown> | null): string {
  if (!weather) return "unknown";
  const temp = Number(weather.temp);
  const wind = Number(weather.wind_speed_kmh) || 0;
  const rain = Number(weather.rain_chance) || 0;
  if (temp > 32 || temp < -15 || wind > 40 || rain > 70) return "poor";
  if (temp > 28 || temp < -5 || wind > 25 || rain > 50) return "challenging";
  if (temp > 24 || temp < 0 || wind > 15 || rain > 25) return "acceptable";
  if (temp >= 10 && temp <= 22 && wind <= 15 && rain <= 15) return "ideal";
  return "good";
}

interface ManualWellness {
  sleep_quality?: number; // 1-5
  energy?: number; // 1-5
  soreness?: number; // 1-4
}

function manualToHealth(manual: ManualWellness | null): Record<string, unknown> | null {
  if (!manual) return null;
  const sleepScore = manual.sleep_quality != null ? [20, 40, 60, 80, 100][manual.sleep_quality - 1] ?? 60 : 60;
  const sleepHours = manual.sleep_quality != null ? [4.5, 5.5, 6.5, 7.5, 8.5][manual.sleep_quality - 1] ?? 6.5 : 6.5;
  const hrv = manual.energy != null ? [35, 42, 50, 58, 65][manual.energy - 1] ?? 50 : 50;
  const rhr = manual.energy != null ? [58, 55, 52, 50, 48][manual.energy - 1] ?? 52 : 52;
  return {
    hrv_last_night: hrv,
    resting_heart_rate: rhr,
    sleep_score: sleepScore,
    sleep_duration_hours: sleepHours,
    sleep_duration_seconds: Math.round(sleepHours * 3600),
    manual_input: true,
  };
}

async function buildTodayContext(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  manualWellness: ManualWellness | null
): Promise<Record<string, unknown>> {
  const today = todayISO();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);

  const [
    wellnessRes,
    baselinesRes,
    runsRes,
    sessionsRes,
    planRes,
    profileRes,
    onboardingRes,
    nextSevenSessionsRes,
  ] = await Promise.all([
    supabase.from("apple_wellness").select("*").eq("user_id", userId).eq("date", today).maybeSingle(),
    supabase.from("user_baselines").select("*").eq("user_id", userId).maybeSingle(),
    supabase
      .from("runs")
      .select("id, started_at, distance_meters, duration_seconds, avg_hr, tss, intensity_factor")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .gte("started_at", sevenDaysAgo.toISOString())
      .order("started_at", { ascending: false }),
    supabase
      .from("sessions")
      .select("id, date, type, distance_km, structure, target_pace_min, target_pace_max, target_hr_zone, estimated_tss, coach_notes, importance")
      .eq("user_id", userId)
      .eq("date", today)
      .maybeSingle(),
    supabase
      .from("training_plans")
      .select("*, sessions(*)")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
    supabase.from("onboarding_progress").select("payload").eq("user_id", userId).maybeSingle(),
    supabase
      .from("sessions")
      .select("date, day_of_week, type, distance_km, importance")
      .eq("user_id", userId)
      .gte("date", today)
      .order("date", { ascending: true })
      .limit(7),
  ]);

  const wellnessRow = wellnessRes.data;
  const baselines = baselinesRes.data;
  const runs = runsRes.data || [];
  const plannedSession = sessionsRes.data;
  const planWithSessions = planRes.data;
  const plan = planWithSessions ? { ...planWithSessions, sessions: undefined } : null;
  const profile = profileRes.data || {};
  const payload = (onboardingRes.data?.payload as Record<string, unknown>) || {};
  const nextSeven = nextSevenSessionsRes.data || [];

  const wellness = manualWellness
    ? manualToHealth(manualWellness)
    : wellnessRow
      ? {
          hrv_last_night: wellnessRow.hrv_last_night,
          resting_heart_rate: wellnessRow.resting_heart_rate,
          sleep_score: wellnessRow.sleep_score,
          sleep_duration_seconds: wellnessRow.sleep_duration_seconds,
          sleep_deep_seconds: wellnessRow.sleep_deep_seconds,
          sleep_rem_seconds: wellnessRow.sleep_rem_seconds,
          manual_input: false,
        }
      : null;

  const hrvHistory7 = (wellnessRes.data ? await supabase
    .from("apple_wellness")
    .select("hrv_last_night")
    .eq("user_id", userId)
    .gte("date", sevenDaysAgoStr)
    .lte("date", today)
    .order("date", { ascending: false })
    .limit(7)
    .then((r) => (r.data || []).map((x) => x.hrv_last_night))
    : []) as (number | null)[];
  const rhrHistory7 = wellnessRes.data ? await supabase
    .from("apple_wellness")
    .select("resting_heart_rate")
    .eq("user_id", userId)
    .gte("date", sevenDaysAgoStr)
    .lte("date", today)
    .order("date", { ascending: false })
    .limit(7)
    .then((r) => (r.data || []).map((x) => x.resting_heart_rate))
    : [];
  const sleepHistory7 = wellnessRes.data ? await supabase
    .from("apple_wellness")
    .select("sleep_score")
    .eq("user_id", userId)
    .gte("date", sevenDaysAgoStr)
    .lte("date", today)
    .order("date", { ascending: false })
    .limit(7)
    .then((r) => (r.data || []).map((x) => x.sleep_score))
    : [];

  const runDates = runs.map((r) => r.started_at?.slice(0, 10));
  const runsWithType = await (async () => {
    const out: Array<{
      date: string;
      days_ago: number;
      type: string;
      distance_km: number;
      avg_pace: string;
      avg_hr: number | null;
      tss: number;
      intensity_factor: number | null;
    }> = [];
    for (const r of runs) {
      const date = r.started_at?.slice(0, 10) || today;
      const distKm = (Number(r.distance_meters) || 0) / 1000;
      const dur = Number(r.duration_seconds) || 0;
      const paceSec = distKm > 0 && dur > 0 ? dur / distKm : 0;
      const paceStr = paceSec ? `${Math.floor(paceSec / 60)}:${String(Math.round(paceSec % 60)).padStart(2, "0")}` : "—";
      out.push({
        date,
        days_ago: daysBetween(date, today),
        type: "run",
        distance_km: Math.round(distKm * 100) / 100,
        avg_pace: paceStr,
        avg_hr: r.avg_hr ?? null,
        tss: Number(r.tss) || Math.round((dur / 3600) * 50),
        intensity_factor: r.intensity_factor ?? null,
      });
    }
    return out;
  })();

  const tss7 = sumTSS(runs);
  const kmThisWeek = runs
    .filter((r) => {
      const d = r.started_at?.slice(0, 10);
      return d && d >= getWeekStart(today);
    })
    .reduce((s, r) => s + (Number(r.distance_meters) || 0) / 1000, 0);
  const kmLastWeek = runs
    .filter((r) => {
      const d = r.started_at?.slice(0, 10);
      const lastWeekStart = getWeekStart(getDateOffset(today, -7));
      const lastWeekEnd = getDateOffset(lastWeekStart, 6);
      return d && d >= lastWeekStart && d <= lastWeekEnd;
    })
    .reduce((s, r) => s + (Number(r.distance_meters) || 0) / 1000, 0);

  function getWeekStart(d: string): string {
    const dt = new Date(d);
    const day = dt.getDay();
    const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
    dt.setDate(diff);
    return dt.toISOString().slice(0, 10);
  }
  function getDateOffset(d: string, days: number): string {
    const dt = new Date(d);
    dt.setDate(dt.getDate() + days);
    return dt.toISOString().slice(0, 10);
  }

  const weather = await fetchWeather(null, null);
  const runningConditions = runningConditionsScore(weather);

  const health = wellness
    ? {
        hrv_today: wellness.hrv_last_night ?? null,
        hrv_7day_avg: baselines?.hrv_7day_avg ?? baselines?.hrv_baseline_avg ?? null,
        hrv_30day_avg: baselines?.hrv_baseline_avg ?? null,
        hrv_trend: calcTrend(hrvHistory7),
        hrv_days_below_baseline: countDaysBelowBaseline(hrvHistory7, baselines?.hrv_baseline_avg ?? null),
        hrv_percent_from_baseline: pctDeviation(
          (wellness.hrv_last_night as number) ?? null,
          baselines?.hrv_baseline_avg ?? null
        ),
        resting_hr_today: (wellness.resting_heart_rate as number) ?? null,
        resting_hr_30day_avg: baselines?.rhr_baseline_avg ?? null,
        resting_hr_trend: calcTrend(rhrHistory7 as (number | null)[]),
        resting_hr_days_elevated: countDaysElevated(rhrHistory7 as (number | null)[], baselines?.rhr_baseline_avg ?? null),
        resting_hr_bpm_from_baseline:
          (wellness.resting_heart_rate as number) != null && baselines?.rhr_baseline_avg != null
            ? (wellness.resting_heart_rate as number) - (baselines.rhr_baseline_avg as number)
            : null,
        sleep_score_last_night: (wellness.sleep_score as number) ?? null,
        sleep_duration_hours:
          (wellness.sleep_duration_seconds as number) != null
            ? (wellness.sleep_duration_seconds as number) / 3600
            : (wellness.sleep_duration_hours as number) ?? null,
        sleep_deep_percent: wellnessRow?.sleep_deep_seconds != null && wellnessRow?.sleep_duration_seconds != null
          ? pctOf(wellnessRow.sleep_deep_seconds, wellnessRow.sleep_duration_seconds)
          : null,
        sleep_rem_percent: wellnessRow?.sleep_rem_seconds != null && wellnessRow?.sleep_duration_seconds != null
          ? pctOf(wellnessRow.sleep_rem_seconds, wellnessRow.sleep_duration_seconds)
          : null,
        sleep_30day_avg: baselines?.sleep_baseline_avg ?? null,
        sleep_percent_from_baseline: pctDeviation(
          (wellness.sleep_score as number) ?? null,
          baselines?.sleep_baseline_avg ?? null
        ),
        sleep_consecutive_poor_nights: countConsecutivePoorSleep(sleepHistory7, baselines?.sleep_baseline_avg ?? null),
        body_battery_current: null,
        body_battery_morning: null,
        stress_yesterday_avg: null,
        data_source: (wellness as Record<string, unknown>).manual_input ? "manual" : "wearable",
      }
    : null;

  const training_load = {
    ctl: null,
    atl: null,
    tsb: null,
    tsb_trend: "stable" as const,
    tss_yesterday: runs[0] ? (Number(runs[0].tss) || 0) : 0,
    tss_7day_total: tss7,
    tss_7day_avg: avgTSS(runs),
    tss_4week_avg: null,
    km_this_week: Math.round(kmThisWeek * 100) / 100,
    km_planned_this_week: null,
    km_last_week: Math.round(kmLastWeek * 100) / 100,
    km_4week_avg: null,
    hard_sessions_last_7_days: countHardSessions(runsWithType, 7),
    hard_sessions_last_14_days: countHardSessions(runsWithType, 14),
    last_hard_session_days_ago: daysSinceLastHard(runsWithType),
    last_rest_day_days_ago: daysSinceLastRest(runsWithType, today),
    consecutive_run_days: countConsecutiveRunDays(runsWithType),
    injury_risk_score: null,
    injury_risk_trend: null,
    week_load_increase_percent: loadIncreasePercent(kmThisWeek, kmLastWeek),
  };

  const session = plannedSession
    ? {
        type: plannedSession.type,
        distance_km: plannedSession.distance_km,
        structure: plannedSession.structure,
        target_pace_min: plannedSession.target_pace_min,
        target_pace_max: plannedSession.target_pace_max,
        target_hr_zone: plannedSession.target_hr_zone,
        estimated_tss: plannedSession.estimated_tss,
        phase: plan?.phase ?? null,
        week_number: plan?.current_week ?? null,
        total_weeks: plan?.total_weeks ?? null,
        importance: plannedSession.importance ?? "normal",
        coach_original_notes: plannedSession.coach_notes,
      }
    : null;

  const profileData = {
    runner_level: payload.runner_level ?? null,
    vo2max: wellnessRow?.apple_vo2_max ?? (payload.vo2max as number) ?? null,
    threshold_pace: (payload.threshold_pace as string) ?? null,
    easy_pace_min: (payload.easy_pace_min as string) ?? null,
    easy_pace_max: (payload.easy_pace_max as string) ?? null,
    recovery_pace: (payload.recovery_pace as string) ?? null,
    aerobic_threshold_hr: (payload.aet_hr as number) ?? null,
    lactate_threshold_hr: (payload.lt_hr as number) ?? null,
    weekly_volume_baseline: (payload.weekly_volume as number) ?? null,
    goal: plan?.goal ?? (payload.goal as string) ?? null,
    race_date: plan?.race_date ?? (payload.race_date as string) ?? null,
    weeks_to_race: plan?.race_date ? Math.ceil((new Date(plan.race_date as string).getTime() - Date.now()) / 604800000) : null,
    current_plan_phase: plan?.phase ?? null,
    injury_history: (payload.injury_history as string) ?? null,
    known_weaknesses: (payload.weaknesses as string) ?? null,
  };

  return {
    health,
    training_load,
    recent_runs: runsWithType,
    profile: profileData,
    planned_session: session,
    upcoming_sessions: nextSeven.map((s) => ({
      day: s.day_of_week,
      type: s.type,
      distance_km: s.distance_km,
      importance: s.importance ?? "normal",
    })),
    weather: weather
      ? {
          ...weather,
          running_conditions_score: runningConditions,
        }
      : null,
    insufficient_baseline_data:
      !baselines || (baselines.calculated_at && daysBetween((baselines.calculated_at as string).slice(0, 10), today) > 14),
    days_of_data: baselines ? 14 : 0,
  };
}

const SYSTEM_PROMPT = `You are an elite AI running coach inside the Pacelab app.
You have complete access to an athlete's health, recovery, training load, and performance data.

Your job: analyze ALL available data and decide the OPTIMAL training session for today. You replace all hardcoded rules —
you think holistically like a world-class coach would.

COACHING PHILOSOPHY:
- Long term development always beats short term gains
- Consistency over intensity — protect the athlete's ability to train tomorrow
- HRV is the most important single recovery signal
- TSB (form) tells you if the athlete is fresh or fatigued
- 3+ consecutive days below HRV baseline = accumulated fatigue
- Elevated resting HR = body under stress (training OR illness)
- Poor sleep quality (especially deep sleep) severely impacts adaptation
- Injury risk rises exponentially when load spikes >10% week over week
- Key sessions (tempo, intervals, long run) should only happen when recovered
- Easy runs can happen in almost any recovery state
- When in doubt: do less, recover more

RESPONSE FORMAT:
You must respond with a valid JSON object only. No other text.`;

function buildUserPrompt(context: Record<string, unknown>): string {
  return `Here is today's complete athlete data:

${JSON.stringify(context, null, 2)}

Analyze ALL of this data and return your decision as JSON:

{
  "recovery_assessment": {
    "overall_score": 0-100,
    "status": "OPTIMAL" | "SUBOPTIMAL" | "POOR" | "VERY_POOR",
    "primary_concern": "string (main limiting factor today)",
    "secondary_concerns": ["string", "string"],
    "pattern_detected": boolean,
    "pattern_description": "string or null"
  },

  "decision": {
    "action": "proceed" | "modify" | "replace" | "rest",
    "confidence": "high" | "medium" | "low",

    "recommended_session": {
      "type": "easy" | "tempo" | "intervals" | "long" | "recovery" | "progression" | "rest",
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
      "intensity_change": "same" | "reduced" | "significantly_reduced" | "replaced",
      "volume_change_percent": number,
      "reason_short": "string (one line for UI badge)"
    }
  },

  "reasoning": {
    "summary": "string (2-3 sentences, coach voice, shown to user)",
    "health_analysis": "string (what the health data tells you)",
    "load_analysis": "string (what the training load tells you)",
    "key_factors": ["string", "string", "string"],
    "what_would_happen_if_trained_hard": "string",
    "tomorrow_consideration": "string"
  },

  "coach_message": {
    "title": "string (short, shown on session card)",
    "body": "string (2-3 sentences, warm coach tone, shown to user)",
    "tone": "encouraging" | "cautionary" | "firm" | "neutral"
  },

  "warning_ui": {
    "show_warning": boolean,
    "warning_level": "none" | "amber" | "orange" | "red",
    "warning_headline": "string",
    "warning_subline": "string"
  }
}`;
}

async function getAISessionDecision(context: Record<string, unknown>): Promise<Record<string, unknown>> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) {
    throw new Error("GROQ_API_KEY not set");
  }
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(context) },
      ],
      max_tokens: 1500,
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API error: ${res.status} ${err}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty Groq response");
  return JSON.parse(content);
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

    if (!anonKey) return jsonResponse({ error: "Server misconfiguration" }, 500);

    const authClient = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: userError } = await authClient.auth.getUser(jwt);
    if (userError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const manualWellness = (body.manual_wellness as ManualWellness) ?? null;
    const forceRefresh = !!body.force_refresh;
    const today = todayISO();

    const supabaseService = createClient(supabaseUrl, serviceKey);

    if (!forceRefresh) {
      const { data: existing } = await supabaseService
        .from("daily_recovery")
        .select("ai_decision, ai_reasoning, recovery_score, recovery_status")
        .eq("user_id", user.id)
        .eq("date", today)
        .maybeSingle();
      if (existing?.ai_decision) {
    const storedDecision = existing.ai_decision as Record<string, unknown> | null;
    return jsonResponse({
      decision: existing.ai_decision,
      planned_session: storedDecision?.planned_session ?? null,
      reasoning: existing.ai_reasoning ? { summary: existing.ai_reasoning } : null,
      recovery_score: existing.recovery_score,
      recovery_status: existing.recovery_status,
      cached: true,
    });
      }
    }

    const context = await buildTodayContext(supabaseService, user.id, manualWellness);
    const decision = await getAISessionDecision(context);

    const recoveryAssessment = (decision.recovery_assessment as Record<string, unknown>) || {};
    const health = (context.health as Record<string, unknown>) || {};

    const dailyRecoveryRow = {
      user_id: user.id,
      date: today,
      hrv_today: health.hrv_today ?? null,
      hrv_7day_avg: health.hrv_7day_avg ?? null,
      hrv_30day_avg: health.hrv_30day_avg ?? null,
      hrv_trend: health.hrv_trend ?? null,
      hrv_days_below_baseline: health.hrv_days_below_baseline ?? null,
      rhr_today: health.resting_hr_today ?? null,
      rhr_30day_avg: health.resting_hr_30day_avg ?? null,
      rhr_trend: health.resting_hr_trend ?? null,
      rhr_days_elevated: health.resting_hr_days_elevated ?? null,
      sleep_score: health.sleep_score_last_night ?? null,
      sleep_duration_hours: health.sleep_duration_hours ?? null,
      sleep_deep_percent: health.sleep_deep_percent ?? null,
      sleep_rem_percent: health.sleep_rem_percent ?? null,
      sleep_30day_avg: health.sleep_30day_avg ?? null,
      sleep_consecutive_poor: health.sleep_consecutive_poor_nights ?? null,
      body_battery_current: null,
      stress_yesterday: null,
      recovery_score: (recoveryAssessment.overall_score as number) ?? null,
      recovery_status: (recoveryAssessment.status as string) ?? null,
      ai_decision: decision,
      ai_reasoning: (decision.reasoning as Record<string, unknown>)?.summary ?? null,
    };

    const plannedSession = (context.planned_session as Record<string, unknown>) ?? null;
    dailyRecoveryRow.ai_decision = { ...decision, planned_session: plannedSession } as Record<string, unknown>;
    await supabaseService.from("daily_recovery").upsert(dailyRecoveryRow, {
      onConflict: "user_id,date",
    });

    return jsonResponse({
      decision,
      planned_session: plannedSession,
      reasoning: decision.reasoning,
      recovery_score: recoveryAssessment.overall_score,
      recovery_status: recoveryAssessment.status,
      cached: false,
    });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
