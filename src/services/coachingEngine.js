/**
 * Coaching Engine: orchestrates the AI coaching pipeline from the client.
 * Calls edge functions in the correct order and provides unified access
 * to coaching state (athlete state, bottleneck, philosophy, adaptation).
 */
import { supabase } from '../lib/supabase';

// ── Edge Function Callers ─────────────────────────────────────────────────────

async function invokeEdgeFunction(name, body = {}) {
  const { data, error } = await supabase.functions.invoke(name, {
    method: 'POST',
    body,
  });
  if (error) {
    let msg = error.message || String(error);
    if (error.context) {
      try {
        const ctx = await error.context.json();
        if (ctx?.error) msg = typeof ctx.error === 'string' ? ctx.error : JSON.stringify(ctx.error);
      } catch (_) {}
    }
    throw new Error(`[${name}] ${msg}`);
  }
  if (data?.error) {
    throw new Error(`[${name}] ${typeof data.error === 'string' ? data.error : data.error.message || JSON.stringify(data.error)}`);
  }
  return data;
}

/**
 * Run the full coaching pipeline: ingest → metrics → bottleneck → philosophy.
 * Called after onboarding completion and after major data syncs.
 */
export async function runFullCoachingPipeline(userId) {
  const errors = [];

  let metrics = null;
  try {
    metrics = await invokeEdgeFunction('calculate-fitness-metrics', { user_id: userId });
  } catch (e) { errors.push(e.message); }

  let ingested = null;
  try {
    ingested = await invokeEdgeFunction('ingest-athlete-data', { user_id: userId });
  } catch (e) { errors.push(e.message); }

  let bottleneck = null;
  try {
    bottleneck = await invokeEdgeFunction('detect-bottleneck', { user_id: userId });
  } catch (e) { errors.push(e.message); }

  let philosophy = null;
  try {
    philosophy = await invokeEdgeFunction('select-philosophy', { user_id: userId });
  } catch (e) { errors.push(e.message); }

  if (errors.length === 4) {
    throw new Error('All pipeline steps failed:\n' + errors.join('\n'));
  }

  return { metrics, ingested, bottleneck, philosophy, errors };
}

/**
 * Generate a new training plan using the full coaching pipeline.
 * The plan is built with bottleneck diagnosis and philosophy as context.
 */
export async function generateCoachingPlan(userId, userPreferences = {}) {
  return invokeEdgeFunction('generate-training-plan', {
    user_id: userId,
    user_preferences: userPreferences,
  });
}

/**
 * Post-run analysis pipeline: analyze run → recalculate metrics → check bottleneck.
 * Called after every new run is synced.
 */
export async function analyzeCompletedRun(runId) {
  const analysis = await invokeEdgeFunction('analyze-run', { run_id: runId });

  if (analysis.needs_fitness_recalc) {
    await invokeEdgeFunction('calculate-fitness-metrics', {}).catch(() => {});
    await invokeEdgeFunction('ingest-athlete-data', {}).catch(() => {});
  }

  if (analysis.needs_bottleneck_check) {
    const bottleneck = await invokeEdgeFunction('detect-bottleneck', {}).catch(() => null);
    if (bottleneck?.bottleneck_changed) {
      await invokeEdgeFunction('select-philosophy', { bottleneck }).catch(() => {});
    }
  }

  return analysis;
}

/**
 * Get today's optimized session decision.
 * Uses the new optimize-daily-session endpoint with full coaching context.
 */
export async function getOptimizedSession({ forceRefresh = false } = {}) {
  return invokeEdgeFunction('optimize-daily-session', {
    force_refresh: forceRefresh,
  });
}

/**
 * Run the weekly adaptation loop for the current user.
 */
export async function runWeeklyAdaptation(userId) {
  return invokeEdgeFunction('run-adaptation-loop', { user_id: userId });
}

// ── Data Fetchers ─────────────────────────────────────────────────────────────

/**
 * Get the current athlete state snapshot.
 */
export async function getAthleteState() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('athlete_state')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return null;
  return data;
}

/**
 * Get the latest bottleneck analysis.
 */
export async function getLatestBottleneck() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('bottleneck_analyses')
    .select('*')
    .eq('user_id', user.id)
    .order('analyzed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

/**
 * Get the current active philosophy period.
 */
export async function getActivePhilosophy() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('philosophy_periods')
    .select('*')
    .eq('user_id', user.id)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

/**
 * Get recent bottleneck history (last N analyses).
 */
export async function getBottleneckHistory(limit = 5) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('bottleneck_analyses')
    .select('primary_bottleneck, primary_strength, primary_evidence, confidence, analyzed_at, bottleneck_changed')
    .eq('user_id', user.id)
    .order('analyzed_at', { ascending: false })
    .limit(limit);

  return data || [];
}

/**
 * Get the latest adaptation record (from last Monday).
 */
export async function getLatestAdaptation() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('adaptation_records')
    .select('*')
    .eq('user_id', user.id)
    .order('week_start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

/**
 * Get adaptation history (last N weeks).
 */
export async function getAdaptationHistory(limit = 8) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('adaptation_records')
    .select('*')
    .eq('user_id', user.id)
    .order('week_start_date', { ascending: false })
    .limit(limit);

  return data || [];
}

/**
 * Get today's daily decision.
 */
export async function getTodayDecision() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from('daily_decisions')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', today)
    .maybeSingle();

  return data;
}

/**
 * Save user's choice for today's daily decision.
 */
export async function saveDailyChoice(choice) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const today = new Date().toISOString().slice(0, 10);
  await supabase
    .from('daily_decisions')
    .update({ user_choice: choice })
    .eq('user_id', user.id)
    .eq('date', today);

  await supabase
    .from('daily_recovery')
    .update({ user_choice: choice })
    .eq('user_id', user.id)
    .eq('date', today);
}

/**
 * Get a coaching summary for display in the app.
 * Combines bottleneck, philosophy, and adaptation into a single view.
 */
export async function getCoachingSummary() {
  const [bottleneck, philosophy, adaptation, athleteState] = await Promise.all([
    getLatestBottleneck(),
    getActivePhilosophy(),
    getLatestAdaptation(),
    getAthleteState(),
  ]);

  const BOTTLENECK_LABELS = {
    weak_aerobic_base: 'Aerobic base development',
    weak_lactate_threshold: 'Threshold development',
    poor_race_specific_endurance: 'Race-specific endurance',
    overtraining_risk: 'Recovery priority',
    performance_plateau: 'Stimulus change needed',
    injury_risk_high: 'Injury prevention',
    insufficient_volume: 'Volume building',
    pre_race_peak: 'Race preparation',
    balanced_fitness: 'Balanced training',
    post_race_recovery: 'Post-race recovery',
  };

  return {
    bottleneck: bottleneck ? {
      type: bottleneck.primary_bottleneck,
      label: BOTTLENECK_LABELS[bottleneck.primary_bottleneck] || bottleneck.primary_bottleneck,
      evidence: bottleneck.primary_evidence,
      coachingNote: bottleneck.primary_coaching_note,
      confidence: bottleneck.confidence,
      changedRecently: bottleneck.bottleneck_changed,
      analyzedAt: bottleneck.analyzed_at,
    } : null,
    philosophy: philosophy ? {
      mode: philosophy.mode,
      volumeTarget: philosophy.volume_target_km,
      successMetric: philosophy.success_metric,
      durationWeeks: philosophy.typical_duration_weeks,
      startedAt: philosophy.started_at,
    } : null,
    adaptation: adaptation ? {
      outcome: adaptation.adaptation_outcome,
      action: adaptation.action_taken,
      volumeAdjustment: adaptation.volume_adjustment_percent,
      adaptationRatio: adaptation.adaptation_ratio,
      completionRate: adaptation.completion_rate,
      plannedKm: adaptation.planned_km,
      actualKm: adaptation.actual_km,
      explanation: adaptation.ai_explanation,
      weekStart: adaptation.week_start_date,
    } : null,
    athleteState: athleteState ? {
      ctl: athleteState.ctl,
      atl: athleteState.atl,
      tsb: athleteState.tsb,
      vo2max: athleteState.vo2max,
      fitnessTrajectory: athleteState.fitness_trajectory,
      readinessScore: athleteState.readiness_score,
      readinessStatus: athleteState.readiness_status,
      injuryRiskScore: athleteState.injury_risk_score,
      consistencyScore: athleteState.consistency_score,
    } : null,
  };
}
