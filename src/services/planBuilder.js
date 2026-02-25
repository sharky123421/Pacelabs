/**
 * Plan Builder: Groq (Llama 3.3 70B) for conversational plan creation and full plan generation.
 * Same free API key as Coach. Fetches run history + health data, Q&A flow, then week-by-week plan.
 */
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

function getGroqApiKey() {
  const fromExtra = Constants.expoConfig?.extra ?? {};
  return (process.env.EXPO_PUBLIC_GROQ_API_KEY ?? fromExtra.EXPO_PUBLIC_GROQ_API_KEY ?? '').trim();
}

export function isPlanBuilderConfigured() {
  return getGroqApiKey().length > 0;
}

function formatPace(distanceMeters, durationSeconds) {
  if (!distanceMeters || !durationSeconds || durationSeconds <= 0) return '—';
  const km = distanceMeters / 1000;
  const secPerKm = durationSeconds / km;
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, '0')}`;
}

/**
 * Build 12-week run history summary for Groq context.
 */
function buildRunHistorySummary(runs) {
  const twelveWeeksAgo = new Date();
  twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 12 * 7);
  const recent = runs.filter((r) => new Date(r.started_at) >= twelveWeeksAgo);
  if (recent.length === 0) return 'No runs in the last 12 weeks.';

  const byWeek = {};
  recent.forEach((r) => {
    const d = new Date(r.started_at);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const key = weekStart.toISOString().slice(0, 10);
    if (!byWeek[key]) byWeek[key] = { km: 0, runs: 0, longRunKm: 0, sessions: [] };
    const km = (Number(r.distance_meters) || 0) / 1000;
    byWeek[key].km += km;
    byWeek[key].runs += 1;
    if (km > (byWeek[key].longRunKm || 0)) byWeek[key].longRunKm = km;
    byWeek[key].sessions.push({
      km: km.toFixed(1),
      pace: formatPace(r.distance_meters, r.duration_seconds),
      type: r.type || 'run',
    });
  });

  const weeks = Object.entries(byWeek)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, data]) => `Week ${weekStart}: ${data.km.toFixed(0)} km, ${data.runs} runs, long run ${data.longRunKm.toFixed(1)} km`);
  return weeks.join('\n');
}

/**
 * Full user data for plan builder: run history summary, fitness, health, injury.
 */
export async function fetchPlanBuilderUserData(userId) {
  if (!userId) return getDefaultPlanBuilderUserData();

  const [
    profileRes,
    runsRes,
    wellnessRes,
    onboardingRes,
  ] = await Promise.all([
    supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle(),
    supabase.rpc('get_my_runs').then(({ data }) => ({ data: data || [] })).catch(() => ({ data: [] })),
    supabase.from('apple_wellness').select('*').eq('user_id', userId).order('date', { ascending: false }).limit(30),
    supabase.from('onboarding_progress').select('payload').eq('user_id', userId).maybeSingle(),
  ]);

  const runs = Array.isArray(runsRes.data) ? runsRes.data : [];
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  const recentRuns = runs.filter((r) => new Date(r.started_at) >= fourWeeksAgo);
  const totalRecentKm = recentRuns.reduce((s, r) => s + (Number(r.distance_meters) || 0) / 1000, 0);
  const avgWeekly = recentRuns.length > 0 ? totalRecentKm / 4 : 0;
  const allTimeLongest = runs.length
    ? Math.max(...runs.map((r) => (Number(r.distance_meters) || 0) / 1000))
    : 0;

  const payload = onboardingRes.data?.payload || {};
  const injuryHistory = payload.injury_history || payload.injuries || 'None reported';

  const wellnessRows = wellnessRes.data || [];
  const avgHRV = wellnessRows.length
    ? (wellnessRows.reduce((s, r) => s + (Number(r.hrv_last_night) || 0), 0) / wellnessRows.filter((r) => r.hrv_last_night != null).length) || null
    : null;
  const avgSleep = wellnessRows.length
    ? (wellnessRows.reduce((s, r) => s + (Number(r.sleep_score) || 0), 0) / wellnessRows.filter((r) => r.sleep_score != null).length) || null
    : null;
  const avgRHR = wellnessRows.length
    ? (wellnessRows.reduce((s, r) => s + (Number(r.resting_heart_rate) || 0), 0) / wellnessRows.filter((r) => r.resting_heart_rate != null).length) || null
    : null;
  const avgReadiness = wellnessRows.length
    ? wellnessRows.filter((r) => r.readiness_verdict).length
      ? (wellnessRows.filter((r) => r.readiness_verdict === 'GREEN').length / wellnessRows.length) * 100
      : null
    : null;

  const name = profileRes.data?.display_name || 'there';
  const runHistorySummary = buildRunHistorySummary(runs);

  return {
    name,
    runnerLevel: payload.runner_level || 'Intermediate',
    vo2max: wellnessRows[0]?.apple_vo2_max ?? payload.vo2max ?? 50,
    thresholdPace: payload.threshold_pace || '4:52',
    aetPace: payload.aet_pace || '5:20',
    easyMin: payload.easy_pace_min || '5:45',
    easyMax: payload.easy_pace_max || '6:20',
    recoveryPace: payload.recovery_pace || '6:30',
    weeklyVolume: Math.round(avgWeekly) || 50,
    longestRun: allTimeLongest.toFixed(1),
    ctl: 52,
    atl: 48,
    tsb: 4,
    injuryRisk: 'Low',
    injuryHistory: String(injuryHistory),
    runHistorySummary,
    totalRuns: runs.length,
    avgHRV: avgHRV != null ? Math.round(avgHRV) : null,
    avgSleepScore: avgSleep != null ? Math.round(avgSleep) : null,
    avgRestingHR: avgRHR != null ? Math.round(avgRHR) : null,
    avgReadiness: avgReadiness != null ? `${Math.round(avgReadiness)}%` : null,
  };
}

function getDefaultPlanBuilderUserData() {
  return {
    name: 'there',
    runnerLevel: 'Intermediate',
    vo2max: 50,
    thresholdPace: '4:52',
    aetPace: '5:20',
    easyMin: '5:45',
    easyMax: '6:20',
    recoveryPace: '6:30',
    weeklyVolume: 50,
    longestRun: '0',
    ctl: 52,
    atl: 48,
    tsb: 4,
    injuryRisk: 'Low',
    injuryHistory: 'None reported',
    runHistorySummary: 'No runs yet.',
    totalRuns: 0,
    avgHRV: null,
    avgSleepScore: null,
    avgRestingHR: null,
    avgReadiness: null,
  };
}

/**
 * Call Groq for plan-builder conversation. Returns opening message + chips or next question.
 * Response must be JSON: { message: string, chips?: string[], showDatePicker?: boolean, phase: 'question'|'summary'|'done', userAnswers?: object }
 */
async function callGroqPlanBuilder(prompt, jsonMode = false) {
  const apiKey = getGroqApiKey();
  if (!apiKey) throw new Error('Groq API key is missing. Add EXPO_PUBLIC_GROQ_API_KEY to .env and restart Expo.');

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2048,
      temperature: 0.5,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    let msg = errText || `Groq error ${res.status}`;
    try {
      const json = JSON.parse(errText);
      if (json.error?.message) msg = json.error.message;
    } catch (_) {}
    throw new Error(msg);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty response from Groq');

  if (jsonMode) {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (_) {}
    }
    try {
      return JSON.parse(text);
    } catch (_) {}
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (_) {}
  }
  return { message: text, phase: 'question', chips: [] };
}

/**
 * Build a coaching analysis context block for Groq prompts.
 * Returns empty string if no analysis data is available.
 */
function buildCoachingAnalysisBlock(coachingAnalysis) {
  if (!coachingAnalysis) return '';

  const parts = ['COACHING ENGINE ANALYSIS (already computed from athlete data):'];
  const { bottleneck, philosophy, athleteState } = coachingAnalysis;

  if (bottleneck) {
    const bn = bottleneck.primary_bottleneck || 'unknown';
    parts.push(`Primary bottleneck: ${bn.replace(/_/g, ' ')}`);
    if (bottleneck.primary_evidence) parts.push(`Evidence: ${bottleneck.primary_evidence}`);
    if (bottleneck.primary_coaching_note) parts.push(`Coaching directive: ${bottleneck.primary_coaching_note}`);
    if (bottleneck.primary_strength) parts.push(`Severity: ${bottleneck.primary_strength}`);
    if (bottleneck.secondary_signals?.length) {
      const secondary = bottleneck.secondary_signals
        .map((s) => (typeof s === 'string' ? s : s.bottleneck || s.type || JSON.stringify(s)))
        .join(', ');
      parts.push(`Secondary signals: ${secondary}`);
    }
  }

  if (philosophy) {
    parts.push(`\nTraining philosophy recommended: ${(philosophy.mode || 'unknown').replace(/_/g, ' ')}`);
    if (philosophy.volume_target_km) parts.push(`Volume target: ${philosophy.volume_target_km} km/week`);
    if (philosophy.intensity_easy_percent != null)
      parts.push(`Intensity split: ${philosophy.intensity_easy_percent}% easy, ${philosophy.intensity_moderate_percent || 0}% moderate, ${philosophy.intensity_hard_percent || 0}% hard`);
    if (philosophy.key_workout_types?.length) parts.push(`Key workouts: ${philosophy.key_workout_types.join(', ')}`);
    if (philosophy.forbidden_workout_types?.length) parts.push(`Forbidden this phase: ${philosophy.forbidden_workout_types.join(', ')}`);
    if (philosophy.success_metric) parts.push(`Success metric: ${philosophy.success_metric}`);
  }

  if (athleteState) {
    const s = athleteState;
    parts.push('\nATHLETE FITNESS STATE:');
    if (s.ctl != null) parts.push(`CTL (chronic load): ${s.ctl}`);
    if (s.atl != null) parts.push(`ATL (acute load): ${s.atl}`);
    if (s.tsb != null) parts.push(`TSB (form): ${s.tsb}`);
    if (s.vo2max != null) parts.push(`VO2max: ${s.vo2max} (trend: ${s.vo2max_trend || '—'})`);
    if (s.threshold_pace_sec_per_km != null) {
      const min = Math.floor(s.threshold_pace_sec_per_km / 60);
      const sec = s.threshold_pace_sec_per_km % 60;
      parts.push(`Threshold pace: ${min}:${String(sec).padStart(2, '0')} /km`);
    }
    if (s.aerobic_decoupling_avg != null) parts.push(`Aerobic decoupling avg: ${s.aerobic_decoupling_avg}%`);
    if (s.weekly_km_current != null) parts.push(`Current weekly volume: ${s.weekly_km_current} km`);
    if (s.weekly_km_4week_avg != null) parts.push(`4-week avg volume: ${s.weekly_km_4week_avg} km`);
    if (s.injury_risk_score != null) parts.push(`Injury risk score: ${s.injury_risk_score}/100`);
    if (s.hrv_today != null) parts.push(`HRV today: ${s.hrv_today} (baseline: ${s.hrv_60day_avg || '—'})`);
    if (s.readiness_status) parts.push(`Readiness: ${s.readiness_status}`);
    if (s.fitness_trajectory) parts.push(`Fitness trajectory: ${s.fitness_trajectory.replace(/_/g, ' ')}`);
    if (s.adaptation_rate) parts.push(`Adaptation rate: ${s.adaptation_rate}`);
    if (s.runner_level) parts.push(`Runner level: ${s.runner_level}`);
  }

  return parts.join('\n');
}

/**
 * Get personalized opening message and first chips from Groq.
 */
export async function getPlanBuilderOpening(userData, coachingAnalysis = null) {
  const analysisBlock = buildCoachingAnalysisBlock(coachingAnalysis);
  const hasAnalysis = analysisBlock.length > 0;

  const prompt = `You are an elite running coach inside the Pacelab app. You are starting a short conversation to build a personalized training plan.${hasAnalysis ? ' You have just completed a full physiological analysis of this athlete.' : ' You have already analyzed this athlete\'s data.'}

ATHLETE DATA:
- Name: ${userData.name}
- Total runs in history: ${userData.totalRuns}
- Current weekly volume (4-week avg): ${userData.weeklyVolume} km
- Threshold pace: ${userData.thresholdPace} /km
- VO2 max estimate: ${userData.vo2max}
${hasAnalysis ? `\n${analysisBlock}\n` : ''}
Your task:${hasAnalysis
  ? ` Start by briefly explaining what you found in their data (1-2 sentences about their primary bottleneck and what it means). Then recommend a training approach based on the analysis. Then ask: "What's your main goal right now?"`
  : ` Write ONE short, warm opening message (2-4 sentences) that references their run count and weekly volume, then ask: "What's your main goal right now?"`}

Then provide suggestion chips as a JSON array. Return ONLY a valid JSON object in this exact format (no markdown, no code block):
{
  "message": "Your opening message here...",
  "chips": ["Run a 5K", "Run a 10K", "Half Marathon", "Marathon", "Ultra", "Get faster", "Run more consistently"],
  "phase": "question"
}`;

  return callGroqPlanBuilder(prompt, true);
}

/**
 * Send user reply and get next AI message (next question or summary).
 * conversationHistory: array of { role: 'user'|'assistant', content: string }
 * userData: from fetchPlanBuilderUserData
 */
export async function sendPlanBuilderReply(conversationHistory, userMessage, userData, coachingAnalysis = null) {
  const historyText = conversationHistory
    .map((m) => (m.role === 'assistant' ? `Coach: ${m.content}` : `User: ${m.content}`))
    .join('\n');

  const analysisBlock = buildCoachingAnalysisBlock(coachingAnalysis);
  const hasAnalysis = analysisBlock.length > 0;

  const prompt = `You are an elite running coach building a training plan in the Pacelab app. You ask one question at a time. You have this athlete's data:

ATHLETE: ${userData.name}, ${userData.weeklyVolume} km/week avg, threshold ${userData.thresholdPace}/km, VO2 ${userData.vo2max}. ${userData.totalRuns} runs in history.
${hasAnalysis ? `\n${analysisBlock}\n` : ''}
CONVERSATION SO FAR:
${historyText}

User just said: "${userMessage}"

Rules:
1. Ask exactly ONE follow-up question per turn, or if you have enough information, output the final summary (phase: "summary") and include userAnswers.${hasAnalysis ? '\n1b. Your recommendations MUST be informed by the coaching analysis above. Reference bottlenecks and training philosophy when relevant.' : ''}
2. For "Which days" question: set "showDatePicker": false and provide chips like ["Mon","Tue",...,"Sun"] so they can multi-select.
3. For race date: if they want a specific date, set "showDatePicker": true.
4. When you have: goal, (optional) race date, goal time, days per week, which days, long run day, morning/evening, volume preference, injuries, session preferences, track access — then output phase "summary" with a friendly recap and set "userAnswers" to an object with keys: goal, raceDate, goalTime, daysPerWeek, trainingDays (array of day names), longRunDay, timeOfDay, volumePreference, injuries, sessionPreferences (array), trackAccess.
5. Return ONLY valid JSON: { "message": "...", "chips": [], "showDatePicker": false, "phase": "question"|"summary", "userAnswers": {} when phase is summary }
6. For summary message, format the recap clearly and end with "Shall I generate your plan?"
7. If user says they have a specific race date, ask for the date and set showDatePicker: true in the next response.`;

  return callGroqPlanBuilder(prompt, true);
}

/**
 * Generate full training plan JSON via Groq.
 */
export async function generatePlan(userAnswers, userData) {
  const answers = { ...userAnswers };
  if (answers.raceDate && answers.weeksToRace == null) {
    answers.weeksToRace = Math.max(
      0,
      Math.ceil((new Date(answers.raceDate) - new Date()) / (7 * 24 * 60 * 60 * 1000))
    );
  }

  const prompt = `You are an elite running coach creating a highly personalized training plan. You have complete data on this athlete.

ATHLETE DATA:
Name: ${userData.name}
Runner level: ${userData.runnerLevel}
VO2 max estimate: ${userData.vo2max}
Lactate threshold pace: ${userData.thresholdPace} /km
Aerobic threshold pace: ${userData.aetPace} /km
Easy pace zone: ${userData.easyMin}–${userData.easyMax} /km
Current weekly volume (4-week avg): ${userData.weeklyVolume} km
Longest run ever: ${userData.longestRun} km
Current CTL (fitness): ${userData.ctl}
Current ATL (fatigue): ${userData.atl}
Current TSB (form): ${userData.tsb}
Injury risk score: ${userData.injuryRisk}

FULL RUN HISTORY SUMMARY (last 12 weeks):
${userData.runHistorySummary}

HEALTH DATA (last 30 days):
Average HRV: ${userData.avgHRV ?? '—'} ms
Average sleep score: ${userData.avgSleepScore ?? '—'}
Average resting HR: ${userData.avgRestingHR ?? '—'} bpm
Average readiness: ${userData.avgReadiness ?? '—'}

INJURY HISTORY:
${userData.injuryHistory}

USER PREFERENCES (from conversation):
Goal: ${answers.goal ?? '—'}
Race date: ${answers.raceDate ?? '—'}
Weeks until race: ${answers.weeksToRace ?? '—'}
Goal time: ${answers.goalTime ?? '—'}
Training days per week: ${answers.daysPerWeek ?? '—'}
Training days: ${(answers.trainingDays || []).join(', ')}
Long run day: ${answers.longRunDay ?? '—'}
Preferred time: ${answers.timeOfDay ?? '—'}
Volume preference: ${answers.volumePreference ?? '—'}
Current issues: ${answers.injuries ?? '—'}
Preferred session types: ${(answers.sessionPreferences || []).join(', ')}
Track/treadmill access: ${answers.trackAccess ?? '—'}

PLAN REQUIREMENTS:
1. Create a complete week-by-week training plan (totalWeeks from race date or 12–16 if no race).
2. Respect the 10% rule for volume increases.
3. Every 4th week = recovery week (reduce volume 25–30%).
4. Include proper taper (2–3 weeks before race if race date set).
5. 75–80% easy/aerobic, 20–25% quality sessions.
6. Long run max = 38% of weekly volume.
7. Injury consideration: ${answers.injuries ?? 'None'}.
8. Only schedule runs on: ${(answers.trainingDays || []).join(', ') || 'flexible'}.
9. Long run always on: ${answers.longRunDay ?? 'Sunday'}.

SESSION TYPES: easy, recovery, tempo, intervals, long, progression, race_pace, hills, rest.
Pace zones: easy ${userData.easyMin}–${userData.easyMax} /km, threshold ${userData.thresholdPace} /km, recovery ${userData.recoveryPace} /km.

RESPOND WITH A JSON OBJECT in this exact structure (no other text):
{
  "planName": "string",
  "goal": "string",
  "raceDate": "string or null",
  "goalTime": "string",
  "totalWeeks": number,
  "phases": [
    { "name": "Base|Build|Peak|Taper", "startWeek": number, "endWeek": number, "description": "string", "focus": "string" }
  ],
  "weeks": [
    {
      "weekNumber": number,
      "phase": "string",
      "totalKm": number,
      "isRecoveryWeek": boolean,
      "weekNotes": "string",
      "sessions": [
        {
          "dayOfWeek": "Monday|Tuesday|...|Sunday",
          "type": "easy|tempo|intervals|long|recovery|progression|race_pace|hills|rest",
          "distanceKm": number,
          "targetPaceMin": "string",
          "targetPaceMax": "string",
          "targetHRZone": "1|2|3|4|5",
          "structure": "string",
          "coachNotes": "string",
          "estimatedDurationMin": number,
          "estimatedTSS": number
        }
      ]
    }
  ],
  "keyWorkouts": [ { "weekNumber": number, "description": "string", "purpose": "string" } ],
  "coachSummary": "string (3–4 sentences, personalized)"
}

Be specific and personalized. Every coachNotes should feel written for THIS athlete.`;

  const apiKey = getGroqApiKey();
  if (!apiKey) throw new Error('Groq API key is missing. Add EXPO_PUBLIC_GROQ_API_KEY to .env and restart Expo.');

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 8192,
      temperature: 0.4,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `Groq error ${res.status}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Empty plan from Groq');
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }
  return JSON.parse(text);
}

/**
 * Save generated plan to Supabase: training_plans + sessions.
 */
export async function savePlanToSupabase(userId, planJson, userAnswers = {}) {
  const raceDate = planJson.raceDate ? new Date(planJson.raceDate).toISOString().slice(0, 10) : null;

  const { data: planRow, error: planError } = await supabase
    .from('training_plans')
    .insert({
      user_id: userId,
      plan_name: planJson.planName || 'My Training Plan',
      goal: planJson.goal || userAnswers.goal,
      race_date: raceDate,
      goal_time: planJson.goalTime || userAnswers.goalTime,
      total_weeks: planJson.totalWeeks || 12,
      current_week: 1,
      phase: planJson.phases?.[0]?.name || 'Base',
      generated_by: 'groq-llama-3.3-70b',
      coach_summary: planJson.coachSummary,
      gemini_raw_json: planJson,
      is_active: true,
    })
    .select('id')
    .single();

  if (planError) throw new Error(planError.message);
  const planId = planRow.id;

  // Deactivate previous active plan
  await supabase
    .from('training_plans')
    .update({ is_active: false, archived_at: new Date().toISOString() })
    .eq('user_id', userId)
    .neq('id', planId);

  const sessionRows = [];
  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const today = new Date();
  const startOfPlan = new Date(today);
  startOfPlan.setDate(today.getDate() - today.getDay()); // week start

  for (const week of planJson.weeks || []) {
    const weekStart = new Date(startOfPlan);
    weekStart.setDate(startOfPlan.getDate() + (week.weekNumber - 1) * 7);
    for (const s of week.sessions || []) {
      const dayIndex = dayOrder.indexOf(s.dayOfWeek);
      if (dayIndex === -1) continue;
      const sessionDate = new Date(weekStart);
      sessionDate.setDate(weekStart.getDate() + dayIndex);

      sessionRows.push({
        plan_id: planId,
        user_id: userId,
        week_number: week.weekNumber,
        phase: week.phase,
        day_of_week: s.dayOfWeek,
        date: sessionDate.toISOString().slice(0, 10),
        type: s.type || 'easy',
        distance_km: s.distanceKm,
        target_pace_min: s.targetPaceMin,
        target_pace_max: s.targetPaceMax,
        target_hr_zone: s.targetHRZone,
        structure: s.structure,
        coach_notes: s.coachNotes,
        estimated_duration_min: s.estimatedDurationMin,
        estimated_tss: s.estimatedTSS,
        status: 'planned',
      });
    }
  }

  if (sessionRows.length > 0) {
    const { error: sessionsError } = await supabase.from('sessions').insert(sessionRows);
    if (sessionsError) throw new Error(sessionsError.message);
  }

  return planId;
}

/**
 * Get active training plan for user (with sessions for current week if needed).
 */
export async function getActivePlan(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('training_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

/**
 * Get sessions for a plan (optionally by week).
 */
export async function getPlanSessions(planId, weekNumber = null) {
  let q = supabase.from('sessions').select('*').eq('plan_id', planId).order('date', { ascending: true });
  if (weekNumber != null) q = q.eq('week_number', weekNumber);
  const { data, error } = await q;
  if (error) return [];
  return data || [];
}

/**
 * Save plan conversation (messages + user_answers) for history.
 */
export async function savePlanConversation(userId, planId, messages, userAnswers) {
  await supabase.from('plan_conversations').insert({
    user_id: userId,
    plan_id: planId,
    messages: messages || [],
    user_answers: userAnswers || {},
  });
}

/**
 * Plan adaptation (weekly): compare last week's planned vs actual, optionally call Groq
 * for suggested adjustments. Call from background task or on app open (e.g. Monday).
 * When adaptation is applied, client can show "Your plan has been updated" banner.
 */
export async function checkPlanAdaptation(userId) {
  const plan = await getActivePlan(userId);
  if (!plan?.id) return null;
  // TODO: fetch last week's sessions, fetch completed runs, compute completion rate,
  // optionally call Groq for adjustments, return { adjusted: true, message } or null
  return null;
}
