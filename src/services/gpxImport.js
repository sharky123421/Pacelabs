/**
 * GPX file parsing and run import for Pacelab.
 * Uses fast-xml-parser. Produces runs with source 'gpx' for Supabase.
 */

import { XMLParser } from 'fast-xml-parser';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';

const RUNS_BATCH = 50;

/** Haversine distance in meters between two [lat, lon] points. */
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toNum(v) {
  if (v == null) return null;
  const n = parseFloat(String(v).trim(), 10);
  return Number.isNaN(n) ? null : n;
}

function toTime(v) {
  if (v == null) return null;
  const d = new Date(String(v).trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Normalize to array (GPX can have single or multiple trk/trkseg/trkpt). */
function toArray(x) {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

/**
 * Parse GPX XML string and return array of runs.
 * Each run: { start, end, distance_meters, duration_seconds, route_coordinates }.
 */
export function parseGpxToRuns(xmlString) {
  const runs = [];
  const parser = new XMLParser({ ignoreAttributes: false });
  let doc;
  try {
    doc = parser.parse(xmlString);
  } catch (e) {
    return { runs: [], error: e?.message || 'Invalid XML' };
  }
  const gpx = doc?.gpx;
  if (!gpx) return { runs: [], error: 'No gpx root' };

  const trks = toArray(gpx.trk);
  for (const trk of trks) {
    const segs = toArray(trk.trkseg);
    for (const seg of segs) {
      const pts = toArray(seg.trkpt);
      if (pts.length < 2) continue;

      const points = pts.map((p) => {
        const lat = toNum(p['@_lat'] ?? p.lat);
        const lon = toNum(p['@_lon'] ?? p.lon);
        const timeEl = p.time ?? p.extensions?.['gpxtpx:time'];
        const timeStr = typeof timeEl === 'string' ? timeEl : timeEl?.['#text'] ?? timeEl;
        const time = toTime(timeStr);
        return { lat, lon, time };
      }).filter((p) => p.lat != null && p.lon != null);

      if (points.length < 2) continue;

      const first = points[0];
      const last = points[points.length - 1];
      const start = first.time || new Date(0);
      const end = last.time || new Date(0);
      let distanceMeters = 0;
      for (let i = 1; i < points.length; i++) {
        distanceMeters += haversineMeters(
          points[i - 1].lat, points[i - 1].lon,
          points[i].lat, points[i].lon
        );
      }
      const durationSeconds = end && start ? Math.round((new Date(end) - new Date(start)) / 1000) : 0;
      const route_coordinates = points.map((p) => [p.lat, p.lon]);

      runs.push({
        start: start instanceof Date ? start.toISOString() : new Date(start).toISOString(),
        end: end instanceof Date ? end.toISOString() : new Date(end).toISOString(),
        distance_meters: Math.round(distanceMeters),
        duration_seconds: durationSeconds > 0 ? durationSeconds : Math.max(1, Math.round(distanceMeters / 200)),
        route_coordinates: route_coordinates.length > 0 ? route_coordinates : null,
      });
    }
  }
  return { runs, error: null };
}

/**
 * Generate a stable external_id for a GPX run (dedup).
 */
function externalIdForGpxRun(run, fileIndex = 0, runIndex = 0) {
  const start = run.start.slice(0, 19).replace(/[-:T]/g, '');
  return `gpx_${fileIndex}_${runIndex}_${start}_${run.distance_meters}`;
}

/**
 * Import GPX file(s) and insert runs into Supabase for the given user.
 * @param {string[]} fileUris - file:// URIs from DocumentPicker
 * @param {string} userId - Supabase user id
 * @param {(msg: string) => void} [onProgress]
 * @returns {{ runsInserted: number, runsSkipped: number, errors: string[] }}
 */
export async function importGpxFiles(fileUris, userId, onProgress) {
  const errors = [];
  const allRuns = [];
  let fileIndex = 0;
  for (const uri of fileUris) {
    onProgress?.(`Reading file ${fileIndex + 1}/${fileUris.length}...`);
    let xml;
    try {
      xml = await FileSystem.readAsStringAsync(uri);
    } catch (e) {
      errors.push(`File ${fileIndex + 1}: ${e?.message || 'Read failed'}`);
      fileIndex++;
      continue;
    }
    const { runs, error } = parseGpxToRuns(xml);
    if (error) {
      errors.push(`File ${fileIndex + 1}: ${error}`);
      fileIndex++;
      continue;
    }
    runs.forEach((r, runIndex) => {
      allRuns.push({ ...r, external_id: externalIdForGpxRun(r, fileIndex, runIndex) });
    });
    fileIndex++;
  }

  if (allRuns.length === 0) {
    return { runsInserted: 0, runsSkipped: 0, errors };
  }

  const externalIds = allRuns.map((r) => r.external_id);
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

  const toInsert = allRuns.filter((r) => !existingIds.has(r.external_id));
  let runsInserted = 0;
  for (let i = 0; i < toInsert.length; i += RUNS_BATCH) {
    const batch = toInsert.slice(i, i + RUNS_BATCH);
    const rows = batch.map((r) => ({
      user_id: userId,
      source: 'gpx',
      source_app: 'GPX import',
      external_id: r.external_id,
      started_at: r.start,
      ended_at: r.end,
      distance_meters: r.distance_meters,
      duration_seconds: r.duration_seconds,
      route_coordinates: r.route_coordinates,
      title: `Run · ${(r.distance_meters / 1000).toFixed(1)} km`,
    }));
    const { error } = await supabase.from('runs').insert(rows);
    if (error) {
      errors.push(`Insert: ${error.message}`);
      break;
    }
    runsInserted += rows.length;
    onProgress?.(`Saving runs... ${runsInserted}/${toInsert.length}`);
  }

  return {
    runsInserted,
    runsSkipped: allRuns.length - toInsert.length,
    errors,
  };
}

/**
 * Import runs from GPX XML strings (e.g. extracted from a ZIP).
 * @param {{ xml: string, fileIndex: number }[]} xmlEntries
 * @param {string} userId
 * @param {(msg: string) => void} [onProgress]
 */
export async function importGpxFromXmlStrings(xmlEntries, userId, onProgress) {
  const errors = [];
  const allRuns = [];
  for (let i = 0; i < xmlEntries.length; i++) {
    const { xml, fileIndex } = xmlEntries[i];
    onProgress?.(`Processing file ${i + 1}/${xmlEntries.length}...`);
    const { runs, error } = parseGpxToRuns(xml);
    if (error) {
      errors.push(`File ${fileIndex + 1}: ${error}`);
      continue;
    }
    runs.forEach((r, runIndex) => {
      allRuns.push({ ...r, external_id: externalIdForGpxRun(r, fileIndex, runIndex) });
    });
  }

  if (allRuns.length === 0) {
    return { runsInserted: 0, runsSkipped: 0, errors };
  }

  const externalIds = allRuns.map((r) => r.external_id);
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

  const toInsert = allRuns.filter((r) => !existingIds.has(r.external_id));
  let runsInserted = 0;
  for (let i = 0; i < toInsert.length; i += RUNS_BATCH) {
    const batch = toInsert.slice(i, i + RUNS_BATCH);
    const rows = batch.map((r) => ({
      user_id: userId,
      source: 'gpx',
      source_app: 'GPX import',
      external_id: r.external_id,
      started_at: r.start,
      ended_at: r.end,
      distance_meters: r.distance_meters,
      duration_seconds: r.duration_seconds,
      route_coordinates: r.route_coordinates,
      title: `Run · ${(r.distance_meters / 1000).toFixed(1)} km`,
    }));
    const { error } = await supabase.from('runs').insert(rows);
    if (error) {
      errors.push(`Insert: ${error.message}`);
      break;
    }
    runsInserted += rows.length;
    onProgress?.(`Saving runs... ${runsInserted}/${toInsert.length}`);
  }

  return {
    runsInserted,
    runsSkipped: allRuns.length - toInsert.length,
    errors,
  };
}
