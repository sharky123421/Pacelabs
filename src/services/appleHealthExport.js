/**
 * Apple Health export processing — on-device streaming.
 *
 * Reads the ZIP file into memory once, uses fflate's streaming Unzip to
 * decompress export.xml WITHOUT holding the full decompressed XML in memory,
 * and extracts health records + workouts as they stream through.
 *
 * Works in Expo Go — no native modules required.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { Unzip, UnzipInflate } from 'fflate';
import { supabase } from '../lib/supabase';
import { calculateAppleReadiness } from './appleHealth';

const HRV_TYPE = 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN';
const RHR_TYPE = 'HKQuantityTypeIdentifierRestingHeartRate';
const SLEEP_TYPE = 'HKCategoryTypeIdentifierSleepAnalysis';
const RUNNING_WORKOUT = 'HKWorkoutActivityTypeRunning';

const WELLNESS_BATCH = 200;
const RUNS_BATCH = 50;

function toDate(str) {
  if (!str) return null;
  const d = new Date(str.trim());
  return isNaN(d.getTime()) ? null : d;
}

function dateKey(d) {
  const x = typeof d === 'string' ? new Date(d) : d;
  return x.toISOString().slice(0, 10);
}

function sleepScore(durationSeconds) {
  if (durationSeconds == null || durationSeconds <= 0) return null;
  const hours = durationSeconds / 3600;
  if (hours >= 7 && hours <= 9) return 100;
  if (hours >= 6 && hours < 7) return 80;
  if (hours >= 5 && hours < 6) return 60;
  if (hours < 5) return 30;
  if (hours > 9) return 85;
  return 70;
}

function getAttr(tag, name) {
  const re = new RegExp(name + '="([^"]*)"', 'i');
  const m = tag.match(re);
  return m ? m[1] : null;
}

function findTagEnd(text, from) {
  let inQ = false;
  for (let i = from; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (inQ) { if (ch === 34) inQ = false; }
    else if (ch === 34) inQ = true;
    else if (ch === 62) return i;
  }
  return -1;
}

function extractTags(text, col) {
  let lastEnd = 0;

  const scan = (marker, handler) => {
    let pos = 0;
    for (;;) {
      const idx = text.indexOf(marker, pos);
      if (idx === -1) break;
      const end = findTagEnd(text, idx + marker.length);
      if (end === -1) break;
      handler(text.slice(idx, end + 1), col);
      if (end + 1 > lastEnd) lastEnd = end + 1;
      pos = end + 1;
    }
  };

  scan('<Record ', (tag, c) => {
    const type = getAttr(tag, 'type');
    if (!type) return;
    const start = toDate(getAttr(tag, 'startDate'));
    if (!start) return;
    const key = dateKey(start);

    if (type === HRV_TYPE) {
      let val = Number(getAttr(tag, 'value'));
      const unit = (getAttr(tag, 'unit') || '').toLowerCase();
      if ((unit.includes('s') || unit.includes('sec')) && !unit.includes('ms')) val *= 1000;
      if (!c.hrv[key]) c.hrv[key] = [];
      c.hrv[key].push(val);
    } else if (type === RHR_TYPE) {
      const val = Number(getAttr(tag, 'value'));
      if (!isNaN(val) && val > 0) {
        if (!c.rhr[key]) c.rhr[key] = [];
        c.rhr[key].push(val);
      }
    } else if (type === SLEEP_TYPE) {
      const endD = toDate(getAttr(tag, 'endDate'));
      const dur = endD && start ? (endD.getTime() - start.getTime()) / 1000 : 0;
      const val = (getAttr(tag, 'value') || '').toUpperCase();
      if (!c.sleep[key]) c.sleep[key] = { total: 0, deep: 0, rem: 0, core: 0, awake: 0 };
      c.sleep[key].total += dur;
      if (val.includes('DEEP')) c.sleep[key].deep += dur;
      else if (val.includes('REM')) c.sleep[key].rem += dur;
      else if (val.includes('CORE') || val.includes('ASLEEP')) c.sleep[key].core += dur;
      else if (val.includes('AWAKE')) c.sleep[key].awake += dur;
    }
  });

  scan('<Workout ', (tag, c) => {
    const type = getAttr(tag, 'workoutActivityType');
    if (type !== RUNNING_WORKOUT) return;
    const start = toDate(getAttr(tag, 'startDate'));
    const end = toDate(getAttr(tag, 'endDate'));
    if (!start || !end) return;
    let dist = Number(getAttr(tag, 'totalDistance') || 0);
    const dUnit = (getAttr(tag, 'totalDistanceUnit') || '').toLowerCase();
    if (dUnit.includes('mi')) dist *= 1.60934;
    c.workouts.push({
      start: start.toISOString(),
      end: end.toISOString(),
      distance: dist,
      calories: Math.round(Number(getAttr(tag, 'totalEnergyBurned') || 0)),
      sourceName: getAttr(tag, 'sourceName') || 'Apple Health',
      duration: (end.getTime() - start.getTime()) / 1000,
    });
  });

  scan('<ActivitySummary ', (tag, c) => {
    const dc = (getAttr(tag, 'dateComponents') || '').slice(0, 10);
    if (!dc) return;
    c.activity.push({
      dateComp: dc,
      move: Number(getAttr(tag, 'activeEnergyBurned') || 0) || undefined,
      moveGoal: Number(getAttr(tag, 'activeEnergyBurnedGoal') || 0) || undefined,
      stand: Number(getAttr(tag, 'appleStandHours') || 0) || undefined,
      standGoal: Number(getAttr(tag, 'appleStandHoursGoal') || 0) || undefined,
      exercise: Number(getAttr(tag, 'appleExerciseTime') || 0) || undefined,
      exerciseGoal: Number(getAttr(tag, 'appleExerciseTimeGoal') || 0) || undefined,
    });
  });

  return lastEnd;
}

/**
 * Read a file from disk into a Uint8Array.
 * Uses fetch(file://) which works in React Native / Expo Go.
 * Falls back to base64 reading via expo-file-system if fetch fails.
 */
async function readFileAsBytes(fileUri) {
  try {
    const response = await fetch(fileUri);
    const ab = await response.arrayBuffer();
    return new Uint8Array(ab);
  } catch (_) {
    const b64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }
}

/**
 * Stream-decompress a ZIP and extract health data from export.xml.
 * Uses fflate's streaming Unzip so the full decompressed XML is
 * never in memory — we process XML tags as they stream through.
 */
function processZipStream(zipBytes, onProgress) {
  return new Promise((resolve, reject) => {
    const col = { hrv: {}, rhr: {}, sleep: {}, workouts: [], activity: [] };
    const decoder = new TextDecoder();
    let xmlBuf = '';
    let found = false;
    let chunkCount = 0;

    const uz = new Unzip();
    uz.register(UnzipInflate);

    uz.onfile = (file) => {
      const lower = file.name.toLowerCase();
      if (found) return;
      if (lower.includes('cda')) return;
      if (!lower.includes('export') || !lower.endsWith('.xml')) return;

      found = true;
      file.ondata = (err, data, final) => {
        if (err) { reject(err); return; }
        try {
          const text = decoder.decode(data, { stream: !final });
          xmlBuf += text;
          chunkCount++;

          if (chunkCount % 20 === 0) {
            const wk = col.workouts.length;
            const hd = Object.keys(col.hrv).length;
            onProgress?.(`Processing... ${wk} runs, ${hd} days of health data found`);
          }

          if (xmlBuf.length > 80_000 || final) {
            const processed = extractTags(xmlBuf, col);
            if (final) {
              xmlBuf = '';
            } else if (processed > 0) {
              const keepFrom = Math.min(processed, xmlBuf.length - 6000);
              xmlBuf = xmlBuf.slice(Math.max(0, keepFrom));
            }
          }

          if (final) resolve(col);
        } catch (e) { reject(e); }
      };
      file.start();
    };

    try {
      uz.push(zipBytes, true);
    } catch (e) {
      reject(new Error(`ZIP decompression failed: ${e.message}`));
      return;
    }

    if (!found) {
      reject(new Error('No export.xml found in the ZIP file. Make sure you exported from the Health app (Profile > Export All Health Data).'));
    }
  });
}

/**
 * Process a plain XML file (not zipped).
 */
function processXmlString(xmlText) {
  const col = { hrv: {}, rhr: {}, sleep: {}, workouts: [], activity: [] };
  extractTags(xmlText, col);
  return col;
}

/**
 * Build wellness day map from collected health records.
 */
function buildWellnessMap(col) {
  const wellnessByDay = {};

  for (const [key, vals] of Object.entries(col.hrv)) {
    if (!wellnessByDay[key]) wellnessByDay[key] = {};
    wellnessByDay[key].hrv_last_night = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  for (const [key, vals] of Object.entries(col.rhr)) {
    if (!wellnessByDay[key]) wellnessByDay[key] = {};
    wellnessByDay[key].resting_heart_rate = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  for (const [key, s] of Object.entries(col.sleep)) {
    if (!wellnessByDay[key]) wellnessByDay[key] = {};
    Object.assign(wellnessByDay[key], {
      sleep_duration_seconds: Math.round(s.total),
      sleep_deep_seconds: Math.round(s.deep),
      sleep_rem_seconds: Math.round(s.rem),
      sleep_core_seconds: Math.round(s.core),
      sleep_awake_seconds: Math.round(s.awake),
      sleep_score: sleepScore(s.total),
    });
  }
  for (const a of col.activity) {
    if (!wellnessByDay[a.dateComp]) wellnessByDay[a.dateComp] = {};
    const w = wellnessByDay[a.dateComp];
    if (a.move != null) w.move_calories = a.move;
    if (a.moveGoal != null) w.move_goal = a.moveGoal;
    if (a.stand != null) w.stand_hours = a.stand;
    if (a.standGoal != null) w.stand_goal = a.standGoal;
    if (a.exercise != null) w.exercise_minutes = Math.round(a.exercise);
    if (a.exerciseGoal != null) w.exercise_goal = Math.round(a.exerciseGoal);
  }

  for (const [, w] of Object.entries(wellnessByDay)) {
    const hrvSt = w.hrv_last_night != null
      ? (w.hrv_last_night >= 30 ? 'BALANCED' : w.hrv_last_night >= 20 ? 'LOW' : 'POOR')
      : null;
    const { readiness_score, readiness_verdict } = calculateAppleReadiness(
      { hrv_status: hrvSt, sleep_score: w.sleep_score ?? null, resting_heart_rate: w.resting_heart_rate ?? null },
      { resting_heart_rate: w.resting_heart_rate ?? 60 },
    );
    w.hrv_status = hrvSt;
    w.readiness_score = readiness_score;
    w.readiness_verdict = readiness_verdict;
  }

  return wellnessByDay;
}

/**
 * Process an Apple Health export entirely on-device.
 *
 * @param {string} fileUri  - file:// URI from DocumentPicker
 * @param {string} fileName - original file name
 * @param {(detail: string) => void} [onProgress]
 * @returns {Promise<{ wellnessRows: number, runsInserted: number, connectionCreated: boolean }>}
 */
export async function directUploadAndProcess(fileUri, fileName, onProgress) {
  let { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    const { data: { session: refreshed } } = await supabase.auth.refreshSession();
    session = refreshed;
  }
  if (!session?.access_token) throw new Error('You must be signed in.');
  const userId = session.user.id;

  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  if (!fileInfo.exists) throw new Error('File not found.');
  const fileSizeMB = Math.round((fileInfo.size || 0) / (1024 * 1024));

  const isZip = (fileName || '').toLowerCase().endsWith('.zip');
  let col;

  if (isZip) {
    onProgress?.(`Reading ${fileSizeMB} MB file...`);
    const zipBytes = await readFileAsBytes(fileUri);
    onProgress?.(`Decompressing and processing (${fileSizeMB} MB)...`);
    col = await processZipStream(zipBytes, onProgress);
  } else {
    onProgress?.('Reading XML file...');
    const xmlText = await FileSystem.readAsStringAsync(fileUri);
    onProgress?.('Processing health data...');
    col = processXmlString(xmlText);
  }

  const runCount = col.workouts.length;
  const healthDays = Object.keys(col.hrv).length + Object.keys(col.sleep).length;
  onProgress?.(`Found ${runCount} runs and ${healthDays} days of health data`);

  onProgress?.('Building wellness data...');
  const wellnessByDay = buildWellnessMap(col);

  onProgress?.('Saving health data to Pacelab...');
  const wellnessRows = Object.entries(wellnessByDay).map(([date, w]) => ({
    user_id: userId,
    date,
    hrv_last_night: w.hrv_last_night ?? null,
    hrv_status: w.hrv_status ?? null,
    resting_heart_rate: w.resting_heart_rate ?? null,
    sleep_score: w.sleep_score ?? null,
    sleep_duration_seconds: w.sleep_duration_seconds ?? null,
    sleep_deep_seconds: w.sleep_deep_seconds ?? null,
    sleep_rem_seconds: w.sleep_rem_seconds ?? null,
    sleep_core_seconds: w.sleep_core_seconds ?? null,
    sleep_awake_seconds: w.sleep_awake_seconds ?? null,
    apple_vo2_max: null,
    move_calories: w.move_calories != null ? Math.round(w.move_calories) : null,
    move_goal: w.move_goal != null ? Math.round(w.move_goal) : null,
    exercise_minutes: w.exercise_minutes != null ? Math.round(w.exercise_minutes) : null,
    exercise_goal: w.exercise_goal != null ? Math.round(w.exercise_goal) : null,
    stand_hours: w.stand_hours != null ? Math.round(w.stand_hours) : null,
    stand_goal: w.stand_goal != null ? Math.round(w.stand_goal) : null,
    readiness_score: w.readiness_score ?? null,
    readiness_verdict: w.readiness_verdict ?? null,
    synced_at: new Date().toISOString(),
  }));

  for (let i = 0; i < wellnessRows.length; i += WELLNESS_BATCH) {
    const batch = wellnessRows.slice(i, i + WELLNESS_BATCH);
    const { error } = await supabase
      .from('apple_wellness')
      .upsert(batch, { onConflict: 'user_id,date', ignoreDuplicates: false });
    if (error) throw new Error(`Failed to save health data: ${error.message}`);
    onProgress?.(`Saving health data... ${Math.min(i + WELLNESS_BATCH, wellnessRows.length)}/${wellnessRows.length}`);
  }

  onProgress?.('Saving runs...');
  const externalIds = col.workouts.map((w) => {
    const ms = new Date(w.start).getTime();
    return `apple_export_${ms}_${Math.round((w.distance ?? 0) * 1000)}`;
  });

  const existingIds = new Set();
  for (let i = 0; i < externalIds.length; i += 100) {
    const slice = externalIds.slice(i, i + 100);
    const { data } = await supabase
      .from('runs')
      .select('external_id')
      .eq('user_id', userId)
      .in('external_id', slice);
    if (data) data.forEach((r) => existingIds.add(r.external_id));
  }

  const newRuns = [];
  col.workouts.forEach((w, idx) => {
    const eid = externalIds[idx];
    if (existingIds.has(eid)) return;
    const distM = Math.round((w.distance ?? 0) * 1000);
    newRuns.push({
      user_id: userId,
      source: 'apple_watch',
      source_app: w.sourceName || 'Apple Health export',
      external_id: eid,
      started_at: w.start,
      ended_at: w.end,
      distance_meters: distM,
      duration_seconds: Math.round(w.duration),
      calories: w.calories || null,
      title: `Run · ${(distM / 1000).toFixed(1)} km`,
    });
  });

  let runsInserted = 0;
  for (let i = 0; i < newRuns.length; i += RUNS_BATCH) {
    const batch = newRuns.slice(i, i + RUNS_BATCH);
    const { error } = await supabase.from('runs').insert(batch);
    if (!error) runsInserted += batch.length;
    onProgress?.(`Saving runs... ${Math.min(i + RUNS_BATCH, newRuns.length)}/${newRuns.length}`);
  }

  const { data: existingConn } = await supabase
    .from('apple_health_connections')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (!existingConn) {
    await supabase.from('apple_health_connections').insert({
      user_id: userId,
      permissions_granted: ['export'],
      last_synced_at: new Date().toISOString(),
      is_active: true,
    });
  } else {
    await supabase
      .from('apple_health_connections')
      .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('is_active', true);
  }

  if (runsInserted > 0) {
    onProgress?.('Running AI analysis on new runs...');
    try {
      const { runFullCoachingPipeline } = await import('./coachingEngine');
      await runFullCoachingPipeline(userId).catch(() => {});
    } catch (_) {}
  }

  onProgress?.('Done!');
  return {
    wellnessRows: wellnessRows.length,
    runsInserted,
    connectionCreated: !existingConn,
  };
}
