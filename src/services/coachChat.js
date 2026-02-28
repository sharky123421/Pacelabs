/**
 * AI Coach chat: system prompt, user context, Groq API with streaming.
 * Uses Llama 3.3 70B for fast, data-driven coaching.
 */
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';
const MAX_TOKENS = 500;
const TEMPERATURE = 0.7;
const CONTEXT_MESSAGES_LIMIT = 50;

function getGroqApiKey() {
  const fromExtra = Constants.expoConfig?.extra ?? {};
  return (process.env.EXPO_PUBLIC_GROQ_API_KEY ?? fromExtra.EXPO_PUBLIC_GROQ_API_KEY ?? '').trim();
}

/** Call this to check if Groq is configured (e.g. show hint in UI). */
export function isGroqConfigured() {
  return getGroqApiKey().length > 0;
}

function formatPace(distanceMeters, durationSeconds) {
  if (!distanceMeters || !durationSeconds || durationSeconds <= 0) return '—';
  const km = distanceMeters / 1000;
  const secPerKm = durationSeconds / km;
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, '0')} /km`;
}

/**
 * Fetch all data needed to build the coach system prompt for the current user.
 */
export async function fetchCoachUserData(userId, { runnerMode } = {}) {
  if (!userId) return getDefaultUserData();

  const [
    profileRes,
    runsRes,
    wellnessRes,
    onboardingRes,
  ] = await Promise.all([
    supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle(),
    supabase.rpc('get_my_runs').then(({ data }) => ({ data: data || [] })).catch(() => ({ data: [] })),
    supabase.from('apple_wellness').select('*').eq('user_id', userId).eq('date', new Date().toISOString().slice(0, 10)).maybeSingle(),
    supabase.from('onboarding_progress').select('payload').eq('user_id', userId).maybeSingle(),
  ]);

  const runs = Array.isArray(runsRes.data) ? runsRes.data : [];
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  const recentRuns = runs.filter((r) => new Date(r.started_at) >= fourWeeksAgo);
  const totalRecentKm = recentRuns.reduce((s, r) => s + (Number(r.distance_meters) || 0) / 1000, 0);
  const avgWeekly = recentRuns.length > 0 ? totalRecentKm / 4 : 0;
  const longestRun = recentRuns.length
    ? Math.max(...recentRuns.map((r) => (Number(r.distance_meters) || 0) / 1000))
    : 0;

  const lastRun = runs[0];
  const payload = onboardingRes.data?.payload || {};
  const goal = payload.goal || 'General fitness';
  const raceDate = payload.race_date || '—';
  const weeksToRace = payload.race_date
    ? Math.max(0, Math.ceil((new Date(payload.race_date) - new Date()) / (7 * 24 * 60 * 60 * 1000)))
    : '—';

  const name = profileRes.data?.display_name || 'there';
  const appleWellness = wellnessRes.data || null;

  return {
    name,
    runnerLevel: 'Intermediate',
    vo2max: appleWellness?.apple_vo2_max ?? 50,
    thresholdPace: '4:52',
    easyPaceMin: '5:45',
    easyPaceMax: '6:20',
    aetHR: 145,
    ltHR: 165,
    weeklyVolume: Math.round(avgWeekly) || 50,
    goal,
    raceDate,
    weeksToRace,
    recentRuns: recentRuns.length,
    recentDistance: totalRecentKm.toFixed(1),
    avgWeeklyVolume: avgWeekly.toFixed(1),
    intensityDistribution: 'Mostly easy, some tempo',
    longestRun: longestRun.toFixed(1),
    ctl: 52,
    atl: 48,
    tsb: 4,
    injuryRisk: 'Low',
    readinessVerdict: appleWellness?.readiness_verdict
      ? (appleWellness.readiness_verdict === 'GREEN' ? 'Ready to train hard' : appleWellness.readiness_verdict === 'YELLOW' ? 'Take it easy today' : 'Rest day recommended')
      : 'Unknown — no wellness data',
    hrvStatus: appleWellness?.hrv_status ?? '—',
    sleepScore: appleWellness?.sleep_score ?? '—',
    bodyBattery: '—',
    todaySession: 'Tempo 10 km · 4:48–4:55 /km',
    lastRunDate: lastRun ? new Date(lastRun.started_at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '—',
    lastRunDistance: lastRun ? ((Number(lastRun.distance_meters) || 0) / 1000).toFixed(1) : '—',
    lastRunPace: lastRun ? formatPace(lastRun.distance_meters, lastRun.duration_seconds) : '—',
    lastRunHR: lastRun?.avg_hr ?? '—',
    lastRunTSS: lastRun?.tss ?? '—',
    lastRunSummary: lastRun?.ai_summary || 'No summary',
    lastRunRaw: lastRun || null,
    todayWellnessRaw: appleWellness,
    recentRunsRaw: recentRuns.slice(0, 20),
    runnerMode: runnerMode || 'advanced',
  };
}

function getDefaultUserData() {
  return {
    name: 'there',
    runnerLevel: '—',
    vo2max: '—',
    thresholdPace: '4:52',
    easyPaceMin: '5:45',
    easyPaceMax: '6:20',
    aetHR: 145,
    ltHR: 165,
    weeklyVolume: 50,
    goal: 'General fitness',
    raceDate: '—',
    weeksToRace: '—',
    recentRuns: 0,
    recentDistance: '0',
    avgWeeklyVolume: '0',
    intensityDistribution: '—',
    longestRun: '0',
    ctl: 52,
    atl: 48,
    tsb: 4,
    injuryRisk: 'Low',
    readinessVerdict: 'Unknown',
    hrvStatus: '—',
    sleepScore: '—',
    bodyBattery: '—',
    todaySession: '—',
    lastRunDate: '—',
    lastRunDistance: '—',
    lastRunPace: '—',
    lastRunHR: '—',
    lastRunTSS: '—',
    lastRunSummary: 'No runs yet.',
    lastRunRaw: null,
    todayWellnessRaw: null,
    recentRunsRaw: [],
  };
}

/**
 * Build the system prompt for the coach from user data.
 * Supports beginner mode via userData.runnerMode.
 */
export function buildCoachSystemPrompt(userData) {
  if (userData.runnerMode === 'beginner') {
    return buildBeginnerSystemPrompt(userData);
  }
  return `You are Coach BigBenjamin, an elite running coach inside the Pacelab app.
You have complete knowledge of this athlete's running history and data.

ATHLETE PROFILE:
Name: ${userData.name}
Runner level: ${userData.runnerLevel}
Estimated VO2 max: ${userData.vo2max}
Lactate threshold pace: ${userData.thresholdPace} /km
Easy pace zone: ${userData.easyPaceMin}–${userData.easyPaceMax} /km
Aerobic threshold HR: ${userData.aetHR} bpm
Lactate threshold HR: ${userData.ltHR} bpm
Weekly volume baseline: ${userData.weeklyVolume} km
Goal: ${userData.goal}
Race date: ${userData.raceDate}
Weeks to race: ${userData.weeksToRace}

RECENT TRAINING (last 4 weeks):
Total runs: ${userData.recentRuns}
Total distance: ${userData.recentDistance} km
Avg weekly volume: ${userData.avgWeeklyVolume} km
Intensity distribution: ${userData.intensityDistribution}
Longest run: ${userData.longestRun} km

CURRENT FITNESS:
CTL (fitness): ${userData.ctl}
ATL (fatigue): ${userData.atl}
TSB (form): ${userData.tsb}
Injury risk: ${userData.injuryRisk}

TODAY'S DATA:
Readiness verdict: ${userData.readinessVerdict}
HRV status: ${userData.hrvStatus}
Sleep score: ${userData.sleepScore}
Body Battery: ${userData.bodyBattery}
Today's planned session: ${userData.todaySession}

LAST RUN:
Date: ${userData.lastRunDate}
Distance: ${userData.lastRunDistance} km
Avg pace: ${userData.lastRunPace} /km
Avg HR: ${userData.lastRunHR} bpm
TSS: ${userData.lastRunTSS}
AI summary: ${userData.lastRunSummary}

COACHING PHILOSOPHY:
- Respond like a world-class coach who knows this athlete deeply
- Be direct and specific — reference their actual data
- Never give generic advice — always personalize
- Use their real numbers (pace, HR, TSS, CTL)
- Keep responses concise — 2–4 sentences unless detail is needed
- Tone: professional, warm, encouraging but honest
- If they're overtraining, tell them directly
- If they're undertraining, push them
- You follow: Daniels Running Formula, 80/20 training,
  polarized training model, Norwegian double threshold method

IMPORTANT:
- Never say "I don't have access to your data" — you do
- Never be vague — always give specific paces, distances, times
- If asked about today's readiness, use the TODAY'S DATA above
- Always sign off responses as "Coach BigBenjamin"
`;
}

/**
 * Optionally inject extra context into the user message for certain question types.
 */
export function injectSmartContext(userMessage, userData) {
  const lower = (userMessage || '').toLowerCase();
  let extra = '';

  if (/\b(last run|yesterday)\b/.test(lower) && userData.lastRunRaw) {
    const r = userData.lastRunRaw;
    extra += `\n[Context: Last run — ${(Number(r.distance_meters) || 0) / 1000} km, ${formatPace(r.distance_meters, r.duration_seconds)}/km, HR ${r.avg_hr || '—'}, TSS ${r.tss ?? '—'}. Summary: ${r.ai_summary || '—'}]\n`;
  }
  if (/\b(training plan|this week)\b/.test(lower)) {
    extra += `\n[Context: This week's plan — ${userData.todaySession}; goal: ${userData.goal}]\n`;
  }
  if (/\b(ready|today|should i run)\b/.test(lower) && userData.todayWellnessRaw) {
    const w = userData.todayWellnessRaw;
    extra += `\n[Context: Today — readiness ${w.readiness_verdict}, HRV ${w.hrv_last_night ?? '—'} ms (${w.hrv_status ?? '—'}), sleep ${w.sleep_score ?? '—'}, RHR ${w.resting_heart_rate ?? '—'}]\n`;
  }
  if (/\b(fitness|improving|trend)\b/.test(lower)) {
    extra += `\n[Context: CTL ${userData.ctl}, ATL ${userData.atl}, TSB ${userData.tsb}]\n`;
  }
  if (/\b(race|marathon|5k|10k|half)\b/.test(lower)) {
    extra += `\n[Context: Goal ${userData.goal}, race date ${userData.raceDate}, weeks to race ${userData.weeksToRace}]\n`;
  }

  return extra ? extra + userMessage : userMessage;
}

/**
 * Load last N chat messages from Supabase for context.
 */
export async function loadChatHistory(userId, limit = 50) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('chat_messages')
    .select('role, content, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) return [];
  return (data || []).map((row) => ({
    role: row.role,
    content: row.content,
    created_at: row.created_at,
  }));
}

/**
 * Save a single message to chat_messages.
 */
export async function saveChatMessage(userId, role, content, tokensUsed = null) {
  if (!userId) return;
  await supabase.from('chat_messages').insert({
    user_id: userId,
    role,
    content,
    tokens_used: tokensUsed,
  });
}

/**
 * Delete all chat messages for the user (clear history).
 */
export async function clearChatHistory(userId) {
  if (!userId) return;
  await supabase.from('chat_messages').delete().eq('user_id', userId);
}

/**
 * Send user message to Groq and stream the assistant reply.
 * onChunk(text) is called with each streamed delta; onDone(fullText) when finished.
 * Returns full assistant content or throws.
 */
export async function sendCoachMessage(options) {
  const {
    userMessage,
    conversationHistory,
    userData,
    onChunk,
    onDone,
  } = options;

  const apiKey = getGroqApiKey();
  if (!apiKey) {
    throw new Error(
      'Groq API key is missing. Add EXPO_PUBLIC_GROQ_API_KEY to .env and restart Expo (npm run start:go:lan -- --clear).'
    );
  }

  const systemPrompt = buildCoachSystemPrompt(userData);
  const injectedContent = injectSmartContext(userMessage, userData);
  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: injectedContent },
  ];

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      stream: true,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    let msg = errText || `Groq error ${res.status}`;
    try {
      const json = JSON.parse(errText);
      if (json.error?.message) msg = json.error.message;
    } catch (_) {}
    if (res.status === 401) msg = 'Invalid Groq API key. Check your key at console.groq.com.';
    if (res.status >= 500 || res.status === 429) msg = 'Coach BigBenjamin is temporarily unavailable — try again shortly.';
    throw new Error(msg);
  }

  // React Native fetch often has no res.body.getReader(); fallback to res.text() and parse SSE
  const body = res.body;
  if (body && typeof body.getReader === 'function') {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              onChunk?.(delta);
            }
          } catch (_) {}
        }
      }
    }
    if (buffer.startsWith('data: ')) {
      try {
        const parsed = JSON.parse(buffer.slice(6));
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
          onChunk?.(delta);
        }
      } catch (_) {}
    }

    onDone?.(fullContent);
    return fullContent;
  }

  // Fallback: read full response and parse SSE (works in React Native)
  const text = await res.text();
  let fullContent = '';
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
          onChunk?.(delta);
        }
      } catch (_) {}
    }
  }
  onDone?.(fullContent);
  return fullContent;
}

function buildBeginnerSystemPrompt(userData) {
  return `You are a warm, patient, encouraging running coach for a complete beginner inside the Pacelab app.

YOUR PERSONALITY:
- Like a supportive friend who happens to know about running
- Never technical or jargon-heavy
- Always positive — even when they miss sessions
- Focus on habit and mindset, not performance
- Short responses — 2-3 sentences maximum
- Use simple everyday language

ATHLETE INFO:
Name: ${userData.name}
Total runs completed: ${userData.recentRuns || 0}
Goal: ${userData.goal || 'Build a running habit'}

TOPICS YOU HELP WITH:
- Motivation when they don't feel like running
- What to do when it feels hard
- How to breathe while running
- What to wear in different weather
- Basic injury prevention (don't overdo it)
- Celebrating small wins

TOPICS TO AVOID:
- Pace targets or pace zones
- Heart rate zones
- VO2 max, threshold, CTL, ATL, TSS
- Any metric that sounds intimidating
- Comparisons to other runners

WHEN ASKED TECHNICAL QUESTIONS:
Simplify completely. Instead of "your aerobic threshold"
say "the effort level where you can still talk comfortably"

TONE EXAMPLES:
"You showed up — that's literally all that matters today."
"Feeling tired is normal, feeling pain is not. Big difference!"
"Your only job is to finish. Pace doesn't matter at all."
"Every runner you admire was once exactly where you are."

IMPORTANT:
- Never say "I don't have access to your data" — you do
- Always sign off as "Coach BigBenjamin"
- Keep it warm, encouraging, and brief
`;
}

export { CONTEXT_MESSAGES_LIMIT };
