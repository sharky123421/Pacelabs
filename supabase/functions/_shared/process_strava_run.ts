/**
 * Shared pipeline: parse Strava activity + streams → runs, run_datapoints, run_splits, metrics.
 * Used by strava-webhook (create/update), strava-import-history, strava-sync-manual.
 */

import type { StravaActivity, StravaStreamSet } from "./strava_client.ts";

const RUN_TYPES = new Set(["Run", "VirtualRun"]);

export function isRunType(type: string): boolean {
  return RUN_TYPES.has(type) || (type !== "Ride" && type?.toLowerCase?.().includes("run"));
}

export interface ProcessedRunRow {
  user_id: string;
  source: "strava";
  source_app: string;
  external_id: string;
  strava_activity_id: number;
  started_at: string;
  ended_at: string;
  distance_meters: number;
  duration_seconds: number;
  title: string | null;
  notes: string | null;
  avg_hr: number | null;
  avg_cadence: number | null;
  calories: number | null;
  route_coordinates: [number, number][] | null;
  tss: number | null;
  trimp: number | null;
  intensity_factor: number | null;
  efficiency_factor: number | null;
}

export interface ProcessedDatapoint {
  sequence: number;
  time_offset_seconds: number;
  lat: number | null;
  lng: number | null;
  heartrate: number | null;
  cadence: number | null;
  altitude: number | null;
  velocity_smooth: number | null;
  watts: number | null;
}

export interface ProcessedSplit {
  split_index: number;
  distance_meters: number;
  elapsed_seconds: number;
  moving_seconds: number | null;
  pace_seconds_per_km: number | null;
  elevation_gain_meters: number | null;
}

export interface ProcessStravaRunResult {
  runRow: ProcessedRunRow;
  datapoints: ProcessedDatapoint[];
  splits: ProcessedSplit[];
}

/**
 * Parse Strava activity and optional streams into unified run row, datapoints, and splits.
 */
export function processStravaRun(
  activity: StravaActivity,
  streams: StravaStreamSet = {}
): ProcessStravaRunResult {
  const startDate = new Date(activity.start_date);
  const movingSeconds = activity.moving_time ?? 0;
  const distanceMeters = activity.distance ?? 0;
  const endDate = new Date(startDate.getTime() + (activity.elapsed_time ?? movingSeconds) * 1000);

  const routeCoordinates = parseRouteFromStreams(streams);
  const datapoints = parseDatapoints(streams);
  const splits = parseSplits(activity, streams);

  const paceSecPerKm =
    distanceMeters > 0 ? Math.round((movingSeconds / (distanceMeters / 1000)) * 100) / 100 : null;
  const avgSpeed = distanceMeters > 0 && movingSeconds > 0 ? distanceMeters / movingSeconds : null;
  const ftp = 255; // placeholder; in production use runner profile
  const normPower = avgSpeed ? estimateNormalizedPace(avgSpeed) : null;
  const tss = computeTSS(movingSeconds, distanceMeters, activity.average_heartrate, ftp);
  const trimp = computeTRIMP(movingSeconds, activity.average_heartrate);
  const intensityFactor = normPower && ftp ? normPower / ftp : null;
  const efficiencyFactor = avgSpeed && activity.average_heartrate ? avgSpeed / (activity.average_heartrate / 100) : null;

  const runRow: ProcessedRunRow = {
    user_id: "", // caller sets
    source: "strava",
    source_app: activity.device_name ?? "Strava",
    external_id: `strava_${activity.id}`,
    strava_activity_id: activity.id,
    started_at: startDate.toISOString(),
    ended_at: endDate.toISOString(),
    distance_meters: Math.round(distanceMeters * 100) / 100,
    duration_seconds: movingSeconds,
    title: activity.name || null,
    notes: activity.description || null,
    avg_hr: activity.average_heartrate ?? null,
    avg_cadence: activity.average_cadence ?? null,
    calories: activity.calories != null ? Math.round(activity.calories) : null,
    route_coordinates: routeCoordinates.length > 0 ? routeCoordinates : null,
    tss: tss != null ? Math.round(tss * 100) / 100 : null,
    trimp: trimp != null ? Math.round(trimp * 100) / 100 : null,
    intensity_factor: intensityFactor != null ? Math.round(intensityFactor * 10000) / 10000 : null,
    efficiency_factor: efficiencyFactor != null ? Math.round(efficiencyFactor * 10000) / 10000 : null,
  };

  return { runRow, datapoints, splits };
}

function parseRouteFromStreams(streams: StravaStreamSet): [number, number][] {
  const latlng = streams.latlng;
  if (!latlng || !Array.isArray(latlng)) return [];
  return (latlng as [number, number][]).map(([lat, lng]) => [lat, lng]);
}

function parseDatapoints(streams: StravaStreamSet): ProcessedDatapoint[] {
  const time = (streams.time as number[]) ?? [];
  const latlng = (streams.latlng as [number, number][]) ?? [];
  const heartrate = (streams.heartrate as number[]) ?? [];
  const cadence = (streams.cadence as number[]) ?? [];
  const altitude = (streams.altitude as number[]) ?? [];
  const velocity = (streams.velocity_smooth as number[]) ?? [];
  const watts = (streams.watts as number[]) ?? [];
  const len = time.length;
  if (len === 0) return [];

  const out: ProcessedDatapoint[] = [];
  for (let i = 0; i < len; i++) {
    const ll = latlng[i];
    out.push({
      sequence: i,
      time_offset_seconds: Math.round(time[i] ?? 0),
      lat: Array.isArray(ll) ? ll[0] : null,
      lng: Array.isArray(ll) ? ll[1] : null,
      heartrate: heartrate[i] ?? null,
      cadence: cadence[i] ?? null,
      altitude: altitude[i] ?? null,
      velocity_smooth: velocity[i] ?? null,
      watts: watts[i] ?? null,
    });
  }
  return out;
}

function parseSplits(activity: StravaActivity, _streams: StravaStreamSet): ProcessedSplit[] {
  const metric = activity.splits_metric;
  if (!metric || !Array.isArray(metric)) return [];

  return metric.map((s, i) => {
    const distM = s.distance ?? 0;
    const elapsed = s.elapsed_time ?? 0;
    const moving = s.moving_time ?? elapsed;
    const paceSecPerKm = distM > 0 ? (moving / (distM / 1000)) : null;
    return {
      split_index: i,
      distance_meters: distM,
      elapsed_seconds: elapsed,
      moving_seconds: moving,
      pace_seconds_per_km: paceSecPerKm,
      elevation_gain_meters: null,
    };
  });
}

function estimateNormalizedPace(avgSpeedMps: number): number {
  return Math.round(avgSpeedMps * 100);
}

function computeTSS(
  movingSeconds: number,
  distanceMeters: number,
  avgHr: number | undefined,
  _ftp: number
): number | null {
  if (movingSeconds <= 0) return null;
  const hours = movingSeconds / 3600;
  const intensity = avgHr ? Math.min(1, (avgHr - 60) / 120) : 0.7;
  return Math.round(hours * intensity * 100 * 100) / 100;
}

function computeTRIMP(movingSeconds: number, avgHr: number | undefined): number | null {
  if (!avgHr || movingSeconds <= 0) return null;
  const hours = movingSeconds / 3600;
  const intensity = Math.min(1, (avgHr - 60) / 120);
  return Math.round(hours * intensity * 100 * 100) / 100;
}
