/**
 * Apple HealthKit integration for Pacelab (iOS only).
 * Uses react-native-health. In Expo Go / Android / simulator: HealthKit is unavailable, use mock or export flow.
 */

import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { isExpoGo } from '../lib/expoGo';
import { supabase } from '../lib/supabase';

const isIOS = Platform.OS === 'ios';

/**
 * Get AppleHealthKit only on iOS in a development/standalone build (never in Expo Go – native module not available).
 */
function getHealthKit() {
  if (!isIOS || isExpoGo) return null;
  try {
    return require('react-native-health').default;
  } catch (e) {
    return null;
  }
}

/**
 * Check if HealthKit is available (iOS device with capability).
 */
export function isHealthKitAvailable() {
  const AppleHealthKit = getHealthKit();
  if (!AppleHealthKit) return false;
  return new Promise((resolve) => {
    AppleHealthKit.isAvailable((err, available) => resolve(!err && available));
  });
}

/**
 * Initialize HealthKit and request permissions. Shows system permission sheet.
 * Returns { granted: string[], denied?: string } or { error: string }.
 */
export async function requestPermissions() {
  const AppleHealthKit = getHealthKit();
  if (!AppleHealthKit) {
    if (!isIOS) {
      return { error: 'Apple Health is only available on iPhone.' };
    }
    if (isExpoGo) {
      return {
        error: 'Apple Health requires a development build. In Expo Go: export from the Health app (Profile > Export All Health Data) and use "Import data" in the Profile tab.',
      };
    }
    return { error: 'HealthKit is not available on this device.' };
  }

  const Permissions = AppleHealthKit.Constants?.Permissions || {};
  const read = [
    Permissions.HeartRateVariability,
    Permissions.RestingHeartRate,
    Permissions.HeartRate,
    Permissions.SleepAnalysis,
    Permissions.Vo2Max,
    Permissions.StepCount,
    Permissions.ActiveEnergyBurned,
    Permissions.DistanceWalkingRunning,
    Permissions.Weight,
    Permissions.Workout,
  ].filter(Boolean);
  const write = [Permissions.Workout].filter(Boolean);

  const permissions = {
    permissions: { read, write },
  };

  return new Promise((resolve) => {
    AppleHealthKit.initHealthKit(permissions, (error) => {
      if (error) {
        const msg = (error && String(error)) || 'Permission denied';
        const isNotAvailable = /not available|unavailable|not supported/i.test(msg);
        if (isNotAvailable && isIOS && !Device.isDevice) {
          resolve({ granted: ['mock'], simulator: true });
          return;
        }
        if (isNotAvailable) {
          resolve({
            error: 'Apple Health requires a development build. In Expo Go: export from the Health app (Profile > Export All Health Data) and use "Import data" in the Profile tab.',
          });
          return;
        }
        resolve({ error: msg });
        return;
      }
      resolve({ granted: ['HeartRateVariability', 'RestingHeartRate', 'HeartRate', 'SleepAnalysis', 'Vo2Max', 'StepCount', 'ActiveEnergyBurned', 'DistanceWalkingRunning', 'Weight', 'Workout'] });
    });
  });
}

/**
 * Fetch HRV samples (SDNN). Options: startDate, endDate, limit.
 * Values are in seconds in HealthKit; we return ms.
 */
export function getHeartRateVariabilitySamples(options) {
  const AppleHealthKit = getHealthKit();
  if (!AppleHealthKit) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    AppleHealthKit.getHeartRateVariabilitySamples(
      { unit: 'second', ...options },
      (err, results) => {
        if (err) return reject(new Error(err));
        const inMs = (results || []).map((s) => ({ ...s, value: (s.value ?? 0) * 1000 }));
        resolve(inMs);
      }
    );
  });
}

/**
 * Fetch resting heart rate samples. Options: startDate, endDate, limit.
 */
export function getRestingHeartRateSamples(options) {
  const AppleHealthKit = getHealthKit();
  if (!AppleHealthKit) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    AppleHealthKit.getRestingHeartRateSamples(options, (err, results) => {
      if (err) return reject(new Error(err));
      resolve(results || []);
    });
  });
}

/**
 * Fetch sleep samples. Values: INBED | ASLEEP | DEEP | CORE | REM (or similar).
 */
export function getSleepSamples(options) {
  const AppleHealthKit = getHealthKit();
  if (!AppleHealthKit) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    AppleHealthKit.getSleepSamples(options, (err, results) => {
      if (err) return reject(new Error(err));
      resolve(results || []);
    });
  });
}

/**
 * Fetch VO2 max samples. Unit default ml/(kg*min).
 */
export function getVo2MaxSamples(options) {
  const AppleHealthKit = getHealthKit();
  if (!AppleHealthKit) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    AppleHealthKit.getVo2MaxSamples(options, (err, results) => {
      if (err) return reject(new Error(err));
      resolve(results || []);
    });
  });
}

/**
 * Fetch active energy burned (Move calories) for a day.
 */
export function getActiveEnergyBurned(options) {
  const AppleHealthKit = getHealthKit();
  if (!AppleHealthKit) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    AppleHealthKit.getActiveEnergyBurned(options, (err, results) => {
      if (err) return reject(new Error(err));
      resolve(results || []);
    });
  });
}

/**
 * Fetch Apple stand time (stand hours).
 */
export function getAppleStandTime(options) {
  const AppleHealthKit = getHealthKit();
  if (!AppleHealthKit) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    AppleHealthKit.getAppleStandTime(options, (err, results) => {
      if (err) return reject(new Error(err));
      resolve(results || []);
    });
  });
}

/**
 * Fetch workout samples. type: 'Running' | 'Workout' etc. Distance in miles.
 */
export function getWorkoutSamples(options) {
  const AppleHealthKit = getHealthKit();
  if (!AppleHealthKit) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    AppleHealthKit.getSamples(
      { type: options.type || 'Running', ...options },
      (err, results) => {
        if (err) return reject(new Error(err));
        resolve(results || []);
      }
    );
  });
}

/**
 * Fetch heart rate samples in a time range (for workout HR).
 */
export function getHeartRateSamples(options) {
  const AppleHealthKit = getHealthKit();
  if (!AppleHealthKit) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    AppleHealthKit.getHeartRateSamples(options, (err, results) => {
      if (err) return reject(new Error(err));
      resolve(results || []);
    });
  });
}

/**
 * Fetch workout route by workout UUID (if available from anchored workouts).
 */
export function getWorkoutRouteSamples(workoutId) {
  const AppleHealthKit = getHealthKit();
  if (!AppleHealthKit) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    AppleHealthKit.getWorkoutRouteSamples({ id: workoutId }, (err, results) => {
      if (err) return reject(new Error(err));
      resolve(results?.data?.locations ? results.data.locations : null);
    });
  });
}

// --- Date helpers ---
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function endOfNow() {
  return new Date().toISOString();
}
function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function dateString(d) {
  const x = typeof d === 'string' ? new Date(d) : d;
  return x.toISOString().slice(0, 10);
}

// --- HRV status from last night vs 60-day average ---
function deriveHrvStatus(hrvLastNightMs, rollingAvgMs) {
  if (hrvLastNightMs == null || rollingAvgMs == null || rollingAvgMs === 0) return null;
  const pct = (hrvLastNightMs / rollingAvgMs) * 100;
  if (pct >= 100) return 'BALANCED';
  if (pct >= 95) return 'BALANCED';
  if (pct >= 85) return 'LOW';
  return 'POOR';
}

// --- Sleep score 0–100 from duration and stages ---
function calculateSleepScore(durationSeconds, deepSeconds = 0, remSeconds = 0) {
  if (durationSeconds == null || durationSeconds <= 0) return null;
  const hours = durationSeconds / 3600;
  if (hours >= 7 && hours <= 9) return 100;
  if (hours >= 6 && hours < 7) return 80;
  if (hours >= 5 && hours < 6) return 60;
  if (hours < 5) return 30;
  if (hours > 9) return 85;
  return 70;
}

// --- Apple Readiness (same logic as Garmin) ---
export function calculateAppleReadiness(wellnessData, userBaselines = {}) {
  const { hrv_status, sleep_score, resting_heart_rate } = wellnessData;
  const restingHrBaseline = userBaselines.resting_heart_rate ?? 60;

  let hrvScore = 50;
  if (hrv_status === 'BALANCED') hrvScore = 100;
  else if (hrv_status === 'LOW') hrvScore = 60;
  else if (hrv_status === 'POOR') hrvScore = 25;

  let sleepScore = sleep_score != null ? sleep_score : 50;

  let rhrScore = 50;
  if (resting_heart_rate != null && restingHrBaseline != null) {
    const diff = resting_heart_rate - restingHrBaseline;
    if (Math.abs(diff) <= 3) rhrScore = 100;
    else if (diff <= 6) rhrScore = 75;
    else if (diff <= 10) rhrScore = 50;
    else rhrScore = 25;
  }

  const readiness = Math.round(hrvScore * 0.4 + sleepScore * 0.35 + rhrScore * 0.25);
  const score = Math.max(0, Math.min(100, readiness));
  let verdict = 'YELLOW';
  if (score >= 75) verdict = 'GREEN';
  else if (score < 45) verdict = 'RED';
  return { readiness_score: score, readiness_verdict: verdict };
}

/**
 * Sync wellness data from HealthKit and upsert into apple_wellness.
 * When HealthKit is unavailable (Expo Go / simulator), returns existing DB data
 * from prior imports instead of overwriting with mock data.
 */
export async function syncWellness(userId) {
  const today = dateString(new Date());
  let row = {
    user_id: userId,
    date: today,
    hrv_last_night: null,
    hrv_status: null,
    resting_heart_rate: null,
    sleep_score: null,
    sleep_duration_seconds: null,
    sleep_deep_seconds: null,
    sleep_rem_seconds: null,
    sleep_core_seconds: null,
    sleep_awake_seconds: null,
    apple_vo2_max: null,
    move_calories: null,
    move_goal: null,
    exercise_minutes: null,
    exercise_goal: null,
    stand_hours: null,
    stand_goal: null,
    readiness_score: null,
    readiness_verdict: null,
    synced_at: new Date().toISOString(),
  };
  const useMock = !isIOS || !getHealthKit();
  if (useMock) {
    const { data } = await supabase
      .from('apple_wellness')
      .select('*')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle();
    return data || null;
  } else {
    try {
      const yesterdayStart = new Date();
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      yesterdayStart.setHours(0, 0, 0, 0);
      const todayNoon = new Date();
      todayNoon.setHours(12, 0, 0, 0);

      const [hrvSamples, rhrSamples, sleepSamples, vo2Samples, activeEnergy, standTime] = await Promise.all([
        getHeartRateVariabilitySamples({
          startDate: yesterdayStart.toISOString(),
          endDate: todayNoon.toISOString(),
          limit: 20,
        }),
        getRestingHeartRateSamples({ startDate: startOfToday(), endDate: endOfNow(), limit: 5 }),
        getSleepSamples({
          startDate: new Date(Date.now() - 18 * 3600 * 1000).toISOString(),
          endDate: todayNoon.toISOString(),
        }),
        getVo2MaxSamples({ startDate: daysAgo(30), endDate: endOfNow(), limit: 1 }),
        getActiveEnergyBurned({ startDate: startOfToday(), endDate: endOfNow() }),
        getAppleStandTime({ startDate: startOfToday(), endDate: endOfNow() }),
      ]);

      const hrvValues = hrvSamples.map((s) => s.value).filter((v) => v != null && v > 0);
      row.hrv_last_night = hrvValues.length ? Math.round(hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length) : null;
      row.hrv_status = deriveHrvStatus(row.hrv_last_night, row.hrv_last_night); // Use same as baseline for now; real 60d avg would need history
      const rhrValues = rhrSamples.map((s) => s.value).filter((v) => v != null);
      row.resting_heart_rate = rhrValues.length ? Math.round(rhrValues.reduce((a, b) => a + b, 0) / rhrValues.length) : null;

      let sleepTotal = 0;
      let deep = 0;
      let rem = 0;
      let core = 0;
      let awake = 0;
      for (const s of sleepSamples) {
        const start = new Date(s.startDate).getTime();
        const end = new Date(s.endDate).getTime();
        const dur = (end - start) / 1000;
        sleepTotal += dur;
        const v = (s.value || '').toUpperCase();
        if (v === 'DEEP') deep += dur;
        else if (v === 'REM') rem += dur;
        else if (v === 'CORE' || v === 'ASLEEP') core += dur;
        else if (v === 'AWAKE') awake += dur;
      }
      row.sleep_duration_seconds = Math.round(sleepTotal);
      row.sleep_deep_seconds = Math.round(deep);
      row.sleep_rem_seconds = Math.round(rem);
      row.sleep_core_seconds = Math.round(core);
      row.sleep_awake_seconds = Math.round(awake);
      row.sleep_score = calculateSleepScore(row.sleep_duration_seconds, row.sleep_deep_seconds, row.sleep_rem_seconds);

      if (vo2Samples.length) row.apple_vo2_max = vo2Samples[0].value;

      const moveKcal = activeEnergy.reduce((sum, s) => sum + (s.value ?? 0), 0);
      row.move_calories = Math.round(moveKcal);
      row.move_goal = row.move_goal ?? 0;
      row.exercise_minutes = 0;
      row.exercise_goal = 30;
      const standMins = standTime.reduce((sum, s) => sum + (s.value ?? 0), 0);
      row.stand_hours = Math.round(standMins / 60);
      row.stand_goal = 12;

      const { readiness_score, readiness_verdict } = calculateAppleReadiness(
        { hrv_status: row.hrv_status, sleep_score: row.sleep_score, resting_heart_rate: row.resting_heart_rate },
        { resting_heart_rate: row.resting_heart_rate }
      );
      row.readiness_score = readiness_score;
      row.readiness_verdict = readiness_verdict;
    } catch (e) {
      console.warn('Apple Health wellness sync error:', e);
      const { data } = await supabase
        .from('apple_wellness')
        .select('*')
        .eq('user_id', userId)
        .eq('date', today)
        .maybeSingle();
      return data || null;
    }
  }

  const { error } = await supabase.from('apple_wellness').upsert(row, {
    onConflict: 'user_id,date',
    ignoreDuplicates: false,
  });
  if (error) throw error;
  return row;
}

/**
 * Sync Apple Watch runs from HealthKit into public.runs (source = apple_watch).
 * Deduplicates against existing runs (same date within 60 min, distance ±0.5 km).
 */
export async function syncWorkouts(userId, lastSyncedAt = null) {
  const useMock = !isIOS || !getHealthKit();
  const startDate = lastSyncedAt ? new Date(lastSyncedAt).toISOString() : daysAgo(365 * 5);
  const endDate = endOfNow();

  let workouts = [];
  if (useMock) {
    return { synced: 0, workouts: 0 };
  } else {
    try {
      const samples = await getWorkoutSamples({ type: 'Running', startDate, endDate });
      workouts = (samples || []).map((w) => ({
        start: w.start,
        end: w.end,
        distance: (w.distance ?? 0) * 1.60934,
        calories: w.calories ?? 0,
        sourceName: w.sourceName || 'Apple Watch',
        duration: w.duration ?? (new Date(w.end) - new Date(w.start)) / 1000,
      }));
    } catch (e) {
      console.warn('Apple Health workouts sync error:', e);
      return { synced: 0, workouts: 0 };
    }
  }

  const { data: existingRuns } = await supabase
    .from('runs')
    .select('id, started_at, distance_meters, source')
    .eq('user_id', userId)
    .in('source', ['strava', 'apple_watch']);

  const inserted = [];
  for (const w of workouts) {
    const start = new Date(w.start);
    const end = new Date(w.end);
    const durationSeconds = Math.round((end - start) / 1000);
    const distanceMeters = (w.distance ?? 0) * 1000;
    const externalId = `apple_${start.toISOString()}_${distanceMeters}`;

    const isDuplicate = (existingRuns || []).some((r) => {
      const rStart = new Date(r.started_at);
      const diffMin = Math.abs(rStart - start) / (60 * 1000);
      const distKm = (r.distance_meters || 0) / 1000;
      const distDiff = Math.abs(distKm - (distanceMeters / 1000));
      return diffMin <= 60 && distDiff <= 0.5 && r.source === 'strava';
    });
    if (isDuplicate) continue;

    const { data: existing } = await supabase
      .from('runs')
      .select('id')
      .eq('user_id', userId)
      .eq('external_id', externalId)
      .maybeSingle();
    if (existing) continue;

    const runRow = {
      user_id: userId,
      source: 'apple_watch',
      source_app: w.sourceName || 'Apple Watch',
      external_id: externalId,
      started_at: start.toISOString(),
      ended_at: end.toISOString(),
      distance_meters: Math.round(distanceMeters),
      duration_seconds: durationSeconds,
      calories: w.calories ? Math.round(w.calories) : null,
      title: `Run · ${(distanceMeters / 1000).toFixed(1)} km`,
    };
    const { data: insertedRun, error } = await supabase.from('runs').insert(runRow).select('id').single();
    if (!error && insertedRun) inserted.push(insertedRun.id);
  }

  return { synced: inserted.length, workouts: workouts.length };
}

/**
 * Get current Apple Health connection for user from Supabase.
 */
export async function getAppleHealthConnection(userId) {
  const { data, error } = await supabase
    .from('apple_health_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Save connection after successful permission grant.
 */
export async function saveAppleHealthConnection(userId, permissionsGranted = []) {
  const { data, error } = await supabase
    .from('apple_health_connections')
    .upsert(
      {
        user_id: userId,
        connected_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
        permissions_granted: permissionsGranted,
        is_active: true,
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Disconnect: set is_active = false. Historical data kept.
 */
export async function disconnectAppleHealth(userId) {
  const { error } = await supabase
    .from('apple_health_connections')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) throw error;
}

/**
 * Update last_synced_at after a sync.
 */
export async function updateLastSyncedAt(userId) {
  const { error } = await supabase
    .from('apple_health_connections')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('is_active', true);
  if (error) throw error;
}

/**
 * Mock data for simulator / Android: wellness + 10 sample runs with routes.
 */
export function mockAppleHealthData() {
  const wellness = {
    hrv_last_night: 42,
    hrv_status: 'BALANCED',
    resting_heart_rate: 52,
    sleep_score: 85,
    sleep_duration_seconds: 7 * 3600 + 30 * 60,
    sleep_deep_seconds: 3600,
    sleep_rem_seconds: 5400,
    sleep_core_seconds: 5 * 3600,
    sleep_awake_seconds: 600,
    apple_vo2_max: 48.5,
    move_calories: 420,
    move_goal: 450,
    exercise_minutes: 35,
    exercise_goal: 30,
    stand_hours: 10,
    stand_goal: 12,
  };
  const { readiness_score, readiness_verdict } = calculateAppleReadiness(
    { hrv_status: wellness.hrv_status, sleep_score: wellness.sleep_score, resting_heart_rate: wellness.resting_heart_rate },
    { resting_heart_rate: 52 }
  );
  const today = new Date();
  const workouts = Array.from({ length: 10 }, (_, i) => {
    const start = new Date(today);
    start.setDate(start.getDate() - i);
    start.setHours(7, 30, 0, 0);
    const end = new Date(start.getTime() + (45 + i * 5) * 60 * 1000);
    const distKm = 5 + i * 0.5;
    return {
      start: start.toISOString(),
      end: end.toISOString(),
      distance: distKm,
      calories: 300 + i * 30,
      sourceName: 'Apple Watch',
      duration: (end - start) / 1000,
    };
  });
  return {
    wellness,
    readiness_score,
    readiness_verdict,
    workouts,
  };
}

/**
 * Full sync: wellness + workouts. Call on app open (if last sync > 30 min) and on manual refresh.
 */
export async function fullSync(userId) {
  const conn = await getAppleHealthConnection(userId);
  if (!conn) return { wellness: null, workouts: { synced: 0 } };

  const wellness = await syncWellness(userId);
  const workoutResult = await syncWorkouts(userId, conn.last_synced_at);
  await updateLastSyncedAt(userId);

  if (workoutResult.synced > 0) {
    triggerPostRunAnalysis(userId).catch(() => {});
  }

  return { wellness, workouts: workoutResult };
}

async function triggerPostRunAnalysis(userId) {
  try {
    const { analyzeCompletedRun } = await import('./coachingEngine');
    const { data: recentRuns } = await supabase
      .from('runs')
      .select('id')
      .eq('user_id', userId)
      .is('ai_summary', null)
      .order('started_at', { ascending: false })
      .limit(5);
    for (const run of recentRuns || []) {
      await analyzeCompletedRun(run.id).catch(() => {});
    }
  } catch (_) {}
}
