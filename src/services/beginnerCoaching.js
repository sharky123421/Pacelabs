/**
 * Beginner Coaching Engine: simplified 3-state system.
 * Replaces complex bottleneck detection for beginner runners.
 */
import { supabase } from '../lib/supabase';

export const BEGINNER_STATES = {
  BUILDING_HABIT: 'building_habit',
  BUILDING_BASE: 'building_base',
  FIRST_MILESTONE: 'first_milestone',
};

export function getBeginnerState(weeksActive, completionRate) {
  if (weeksActive <= 4) return BEGINNER_STATES.BUILDING_HABIT;
  if (weeksActive <= 12 && completionRate < 0.8) return BEGINNER_STATES.BUILDING_BASE;
  return BEGINNER_STATES.FIRST_MILESTONE;
}

export function getBeginnerStateConfig(state) {
  switch (state) {
    case BEGINNER_STATES.BUILDING_HABIT:
      return {
        label: 'Building your habit',
        philosophy: 'Show up consistently, finish every session',
        aiFocus: 'motivation and consistency',
        emoji: '\ud83c\udf31',
      };
    case BEGINNER_STATES.BUILDING_BASE:
      return {
        label: 'Building your base',
        philosophy: 'Run/walk to continuous running transition',
        aiFocus: 'making running feel easier',
        emoji: '\ud83d\udcaa',
      };
    case BEGINNER_STATES.FIRST_MILESTONE:
      return {
        label: 'Ready for your first goal',
        philosophy: 'First continuous 5K',
        aiFocus: 'goal achievement',
        emoji: '\ud83c\udfc6',
      };
    default:
      return {
        label: 'Getting started',
        philosophy: 'Building the running habit',
        aiFocus: 'encouragement',
        emoji: '\ud83c\udfc3',
      };
  }
}

export function buildBeginnerCoachSystemPrompt(userData) {
  return `You are Coach BigBenjamin, a warm, patient, encouraging running coach for a complete beginner inside the Pacelab app.

YOUR PERSONALITY:
- Like a supportive friend who happens to know about running
- Never technical or jargon-heavy
- Always positive — even when they miss sessions
- Focus on habit and mindset, not performance
- Short responses — 2-3 sentences maximum
- Use simple everyday language

ATHLETE INFO:
Name: ${userData.name}
Days running: ${userData.daysRunning || 'just started'}
Total runs completed: ${userData.totalRuns || 0}
Current week: ${userData.currentWeek || 1} of 8
Goal: ${userData.beginnerGoal || 'Build a running habit'}
How they feel today: ${userData.todayFeeling || 'unknown'}
Last session: ${userData.lastSessionStatus || 'none yet'}

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
Simplify completely. Instead of "your aerobic threshold" say "the effort level where you can still talk comfortably"

TONE EXAMPLES:
"You showed up — that's literally all that matters today."
"Feeling tired is normal, feeling pain is not. Big difference!"
"Your only job is to finish. Pace doesn't matter at all."
"Every runner you admire was once exactly where you are."

IMPORTANT:
- Never say "I don't have access to your data" — you do
- Always sign off as "Coach BigBenjamin"
- Keep it warm and brief
`;
}

export function buildBeginnerDailyPrompt({ yesterdayStatus, yesterdayFeeling, todayFeeling }) {
  return `Given this beginner runner's status:
- Yesterday's session: ${yesterdayStatus || 'no session'}
- How they felt after: ${yesterdayFeeling || 'unknown'}
- How they feel today: ${todayFeeling || 'unknown'}

Respond with JSON only:
{
  "encouragement": "1-2 sentence encouragement",
  "today_session_go_ahead": true/false,
  "today_message": "simple friendly message about today",
  "adjustment": "none" | "easier" | "rest"
}

Rules:
- If missed yesterday: extra encouragement, no guilt
- If feeling tired today: suggest rest or shorter session
- If feeling great: go ahead as planned
- Always be warm and positive`;
}

export async function saveBeginnerCheckin(userId, data) {
  const date = new Date().toISOString().slice(0, 10);
  await supabase
    .from('beginner_checkins')
    .upsert({ user_id: userId, date, ...data }, { onConflict: 'user_id,date' });
}

export async function getBeginnerCheckin(userId) {
  const date = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from('beginner_checkins')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();
  return data;
}

export const BEGINNER_PLAN_PROMPT = `You are Coach BigBenjamin, a warm, encouraging running coach working with a complete beginner.
Your goal is to build the habit of running first, fitness second.

BEGINNER PLAN PHILOSOPHY:
- Start with run/walk intervals — never force continuous running
- Build confidence before building fitness
- Celebrate every session completed
- Never let them feel like they failed
- Progress is showing up, not pace or distance
- Week 1 should feel almost too easy — that's intentional
- No jargon: no "threshold", no "zones", no "TSS"
- Simple language: "run easy", "walk to recover", "catch your breath"

PROGRESSION MODEL (8-week Couch to 5K style):

Week 1-2: Run/Walk Foundation
  Walk 2 min → Run 1 min → repeat 6-8x. Total: 20-25 min.
  
Week 3-4: Building Run Segments
  Walk 2 min → Run 2 min → repeat 6x. Total: 25-30 min.
  
Week 5-6: Running Takes Over
  Walk 1 min → Run 3 min → repeat 5x. Total: 25-30 min.
  
Week 7: First continuous runs
  Run 10 min → Walk 2 min → Run 10 min.
  
Week 8: First 5K attempt
  Easy continuous 30 min OR first 5K event.

Each session includes:
- Simple instruction like "Run until slightly out of breath, then walk until you feel normal. Repeat."
- Effort: "You should be able to talk in short sentences"
- Pace: NEVER give a pace target — "run by feel only"
- Time-based not distance-based
- Encouraging coach note specific to that week

Generate 3 sessions per week. Output JSON array of sessions with:
{ week_number, day_of_week (1=Mon), title, description, duration_target_min, run_walk_intervals: [{type: "run"|"walk", duration_min}], coach_note }`;

export async function unlockMilestone(userId, milestoneKey) {
  await supabase
    .from('beginner_milestones')
    .upsert({ user_id: userId, milestone_key: milestoneKey }, { onConflict: 'user_id,milestone_key' })
    .catch(() => {});
}
