import ultraSimulationDataset from '../../assets/mock/ultra_realistic_running_simulation_dataset.json';
import { supabase } from '../lib/supabase';

// Helper to safely parse date string to YYYY-MM-DD
function toDateString(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// Map spreadsheet-style columns (e.g. from export) to camelCase used by buildWellnessRowsFromDataset / buildRunRowsFromDataset
function normalizeRow(row) {
  if (!row || typeof row !== 'object') return row;
  // Already normalized if it has camelCase 'date' (spreadsheet uses 'Date')
  if (Object.prototype.hasOwnProperty.call(row, 'date') && row.date != null) return row;

  const get = (key) => (row[key] !== undefined && row[key] !== null ? row[key] : row[key.toLowerCase?.()]);
  return {
    date: get('Date') ?? get('date'),
    sessionType: get('SessionType') ?? get('sessionType'),
    distanceKm: get('Distance_km') ?? get('distanceKm'),
    durationMin: get('Duration_min') ?? get('durationMin'),
    avgHr: get('AvgHR') ?? get('avgHr'),
    maxHr: get('MaxHR') ?? get('maxHr'),
    restingHrMorning: get('RestingHR_morning') ?? get('restingHrMorning'),
    hrvRmssd: get('HRV_RMSSD') ?? get('hrvRmssd'),
    sleepHours: get('Sleep_hours') ?? get('sleepHours'),
    sleepScore: get('Sleep_score') ?? get('sleepScore'),
    fatigueIndex: get('Fatigue_index_1_10') ?? get('fatigueIndex'),
    bodyWeightKg: get('BodyWeight_kg') ?? get('bodyWeightKg'),
    estVo2max: get('Estimated_VO2max') ?? get('estVo2max'),
    temperatureC: get('Temperature_C') ?? get('temperatureC'),
    windKmh: get('Wind_kmh') ?? get('windKmh'),
    elevationGainM: get('ElevationGain_m') ?? get('elevationGainM'),
    cadenceSpm: get('Cadence_spm') ?? get('cadenceSpm'),
  };
}

// Limit to a continuous window of up to 60 days (or less if dataset shorter)
export function getUltraSimulationWindow(maxDays = 60, sourceArray = null) {
  const raw = sourceArray ?? (Array.isArray(ultraSimulationDataset) ? ultraSimulationDataset : []);
  const rows = raw.map(normalizeRow);
  const sorted = [...rows]
    .map((r) => ({ ...r, _date: toDateString(r.date) }))
    .filter((r) => r._date)
    .sort((a, b) => (a._date < b._date ? -1 : a._date > b._date ? 1 : 0));
  return sorted.slice(0, maxDays);
}

export function buildWellnessRowsFromDataset(userId, datasetRows, calculateAppleReadiness) {
  const todayIso = new Date().toISOString();
  return datasetRows.map((row) => {
    const date = toDateString(row._date || row.date);
    const hrvMs = row.hrvRmssd != null ? Number(row.hrvRmssd) : null;
    const restingHr = row.restingHrMorning != null ? Number(row.restingHrMorning) : null;
    const sleepScore = row.sleepScore != null ? Number(row.sleepScore) : null;
    const sleepHours = row.sleepHours != null ? Number(row.sleepHours) : null;
    const sleepDurationSeconds = sleepHours != null ? Math.round(sleepHours * 3600) : null;

    const { readiness_score, readiness_verdict } = calculateAppleReadiness(
      {
        hrv_status: 'BALANCED',
        sleep_score: sleepScore,
        resting_heart_rate: restingHr,
      },
      { resting_heart_rate: restingHr }
    );

    return {
      user_id: userId,
      date,
      hrv_last_night: hrvMs,
      hrv_status: 'BALANCED',
      resting_heart_rate: restingHr,
      sleep_score: sleepScore,
      sleep_duration_seconds: sleepDurationSeconds,
      sleep_deep_seconds: sleepDurationSeconds != null ? Math.round(sleepDurationSeconds * 0.2) : null,
      sleep_rem_seconds: sleepDurationSeconds != null ? Math.round(sleepDurationSeconds * 0.25) : null,
      sleep_core_seconds: sleepDurationSeconds != null ? Math.round(sleepDurationSeconds * 0.5) : null,
      sleep_awake_seconds: sleepDurationSeconds != null ? Math.round(sleepDurationSeconds * 0.05) : null,
      apple_vo2_max: row.estVo2max != null ? Number(row.estVo2max) : null,
      move_calories: 400,
      move_goal: 450,
      exercise_minutes: row.durationMin != null ? Math.round(Number(row.durationMin)) : 30,
      exercise_goal: 30,
      stand_hours: 10,
      stand_goal: 12,
      readiness_score,
      readiness_verdict,
      synced_at: todayIso,
    };
  });
}

export function buildRunRowsFromDataset(userId, datasetRows) {
  const runRows = [];
  const externalIds = [];

  datasetRows.forEach((row, index) => {
    const sessionType = (row.sessionType || '').toLowerCase();
    if (!sessionType || sessionType === 'rest' || sessionType === 'off') {
      return;
    }

    const dateStr = toDateString(row._date || row.date);
    if (!dateStr) return;

    const distanceKm = Number(row.distanceKm || 0);
    const durationMin = Number(row.durationMin || 0);
    if (!distanceKm || !durationMin) return;

    const start = new Date(`${dateStr}T07:30:00.000Z`);
    const durationSeconds = Math.round(durationMin * 60);
    const end = new Date(start.getTime() + durationSeconds * 1000);
    const distanceMeters = Math.round(distanceKm * 1000);

    const eid = `ultra_sim_${dateStr}_${index}_${distanceMeters}`;
    externalIds.push(eid);

    runRows.push({
      user_id: userId,
      source: 'manual',
      source_app: 'Ultra simulation dataset',
      external_id: eid,
      started_at: start.toISOString(),
      ended_at: end.toISOString(),
      distance_meters: distanceMeters,
      duration_seconds: durationSeconds,
      title: `Run · ${distanceKm.toFixed(1)} km`,
      avg_hr: row.avgHr != null ? Number(row.avgHr) : null,
    });
  });

  return { runRows, externalIds };
}

export async function filterExistingRunRows(userId, runRows, externalIds) {
  if (!externalIds.length) {
    return { toInsert: [], existingSample: new Set() };
  }

  const existingSample = new Set();
  for (let i = 0; i < externalIds.length; i += 100) {
    const slice = externalIds.slice(i, i + 100);
    const { data } = await supabase
      .from('runs')
      .select('external_id')
      .eq('user_id', userId)
      .in('external_id', slice);
    if (data) data.forEach((r) => existingSample.add(r.external_id));
  }

  const toInsert = runRows.filter((r) => !existingSample.has(r.external_id));
  return { toInsert, existingSample };
}

