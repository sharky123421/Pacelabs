// Process Apple Health export — stream parse, no full-file load.
// Two input modes:
//   1. Direct upload: POST with Content-Type application/zip or application/xml (body = file data)
//   2. Storage path:  POST with Content-Type application/json, body: { path: "userId/filename" }
// ZIP files are stream-decompressed using fflate before SAX parsing.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as sax from "npm:sax";
import { Unzip, UnzipInflate } from "npm:fflate";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "health-exports";
const HRV_TYPE = "HKQuantityTypeIdentifierHeartRateVariabilitySDNN";
const RHR_TYPE = "HKQuantityTypeIdentifierRestingHeartRate";
const SLEEP_TYPE = "HKCategoryTypeIdentifierSleepAnalysis";
const RUNNING_WORKOUT = "HKWorkoutActivityTypeRunning";
const WELLNESS_BATCH = 200;
const RUNS_BATCH = 50;

function toDate(str: string | undefined): Date | null {
  if (!str || !str.trim()) return null;
  const d = new Date(str.trim());
  return isNaN(d.getTime()) ? null : d;
}

function dateKey(d: Date | string): string {
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toISOString().slice(0, 10);
}

function sleepScore(durationSeconds: number, _deep = 0, _rem = 0): number | null {
  if (durationSeconds == null || durationSeconds <= 0) return null;
  const hours = durationSeconds / 3600;
  if (hours >= 7 && hours <= 9) return 100;
  if (hours >= 6 && hours < 7) return 80;
  if (hours >= 5 && hours < 6) return 60;
  if (hours < 5) return 30;
  if (hours > 9) return 85;
  return 70;
}

function hrvStatus(hrvMs: number | null): string | null {
  if (hrvMs == null) return null;
  if (hrvMs >= 30) return "BALANCED";
  if (hrvMs >= 20) return "LOW";
  return "POOR";
}

function readinessScore(hrvStatus: string | null, sleepScore: number | null, rhr: number | null): { score: number; verdict: string } {
  let hrvS = 50;
  if (hrvStatus === "BALANCED") hrvS = 100;
  else if (hrvStatus === "LOW") hrvS = 60;
  else if (hrvStatus === "POOR") hrvS = 25;
  const sleepS = sleepScore ?? 50;
  const baseline = 60;
  let rhrS = 50;
  if (rhr != null && baseline != null) {
    const diff = rhr - baseline;
    if (Math.abs(diff) <= 3) rhrS = 100;
    else if (diff <= 6) rhrS = 75;
    else if (diff <= 10) rhrS = 50;
    else rhrS = 25;
  }
  const score = Math.max(0, Math.min(100, Math.round(hrvS * 0.4 + sleepS * 0.35 + rhrS * 0.25)));
  let verdict = "YELLOW";
  if (score >= 75) verdict = "GREEN";
  else if (score < 45) verdict = "RED";
  return { score, verdict };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "", { global: { headers: { Authorization: authHeader } } });
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Determine input mode: direct file upload (binary body) or Storage path (JSON body)
    const contentType = (req.headers.get("content-type") || "").toLowerCase();
    const isDirectUpload = contentType.includes("zip") || contentType.includes("xml") || contentType.includes("octet-stream");

    let dataStream: ReadableStream<Uint8Array>;
    let isZipFile: boolean;

    if (isDirectUpload) {
      if (!req.body) {
        return new Response(JSON.stringify({ error: "No file data in request body" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      dataStream = req.body;
      isZipFile = contentType.includes("zip") || contentType.includes("octet-stream");
    } else {
      const body = await req.json().catch(() => ({}));
      const path = (body.path as string)?.trim();
      if (!path || !path.startsWith(user.id + "/")) {
        return new Response(JSON.stringify({ error: "Invalid path; must be userId/filename.xml" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
      if (!signed?.signedUrl) {
        return new Response(JSON.stringify({ error: "File not found in storage" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const resp = await fetch(signed.signedUrl);
      if (!resp.ok || !resp.body) {
        return new Response(JSON.stringify({ error: "Failed to download file" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      dataStream = resp.body;
      isZipFile = path.toLowerCase().endsWith(".zip");
    }

    const wellnessByDay: Record<string, { hrv_last_night?: number; hrv_status?: string; resting_heart_rate?: number; sleep_duration_seconds?: number; sleep_deep_seconds?: number; sleep_rem_seconds?: number; sleep_core_seconds?: number; sleep_awake_seconds?: number; sleep_score?: number; move_calories?: number; move_goal?: number; stand_hours?: number; stand_goal?: number; exercise_minutes?: number; exercise_goal?: number; readiness_score?: number; readiness_verdict?: string }> = {};
    const hrvByDay: Record<string, number[]> = {};
    const rhrByDay: Record<string, number[]> = {};
    const sleepByDay: Record<string, { total: number; deep: number; rem: number; core: number; awake: number }> = {};
    const workouts: { start: string; end: string; distance: number; calories: number; sourceName: string; duration: number }[] = [];
    const activitySummaries: { dateComp: string; move?: number; moveGoal?: number; stand?: number; standGoal?: number; exercise?: number; exerciseGoal?: number }[] = [];

    const saxStream = sax.createStream(false, { lowercase: true });
    saxStream.on("opentag", (node: { name: string; attributes: Record<string, string> }) => {
      const att = node.attributes;
      const startStr = att.startdate ?? att.startDate ?? att["startdate"];
      const endStr = att.enddate ?? att.endDate ?? att["enddate"];
      const start = toDate(startStr);
      if (!start) return;
      const key = dateKey(start);

      if (node.name === "record") {
        const type = (att.type ?? att["type"] ?? "").trim();
        const value = att.value ?? att["value"];
        const unit = ((att.unit ?? att["unit"]) ?? "").toString().toLowerCase();

        if (type === HRV_TYPE) {
          let ms = Number(value);
          if (unit.includes("second") || unit === "s") ms *= 1000;
          if (!hrvByDay[key]) hrvByDay[key] = [];
          hrvByDay[key].push(ms);
        } else if (type === RHR_TYPE) {
          const v = Number(value);
          if (!isNaN(v)) {
            if (!rhrByDay[key]) rhrByDay[key] = [];
            rhrByDay[key].push(v);
          }
        } else if (type === SLEEP_TYPE) {
          const v = (value ?? "").toString().toUpperCase();
          const end = toDate(endStr);
          const dur = end && start ? (end.getTime() - start.getTime()) / 1000 : 0;
          if (!sleepByDay[key]) sleepByDay[key] = { total: 0, deep: 0, rem: 0, core: 0, awake: 0 };
          sleepByDay[key].total += dur;
          if (v === "DEEP" || v === "DEEP_SLEEP") sleepByDay[key].deep += dur;
          else if (v === "REM") sleepByDay[key].rem += dur;
          else if (v === "CORE" || v === "ASLEEP") sleepByDay[key].core += dur;
          else if (v === "AWAKE") sleepByDay[key].awake += dur;
        }
      } else if (node.name === "workout") {
        const type = (att.workoutactivitytype ?? att.workoutActivityType ?? att["workoutactivitytype"] ?? "").trim();
        if (type !== RUNNING_WORKOUT) return;
        const end = toDate(endStr);
        if (!end) return;
        let distanceKm = Number(att.totaldistance ?? att.totalDistance ?? att["totaldistance"] ?? 0);
        const distUnit = ((att.totaldistanceunit ?? att.totalDistanceUnit ?? att["totaldistanceunit"]) ?? "").toString().toLowerCase();
        if (distUnit.includes("mi") || distUnit === "mile") distanceKm *= 1.60934;
        const calories = Number(att.totalenergyburned ?? att.totalEnergyBurned ?? att["totalenergyburned"] ?? 0);
        const duration = (end.getTime() - start.getTime()) / 1000;
        workouts.push({
          start: start.toISOString(),
          end: end.toISOString(),
          distance: distanceKm,
          calories: Math.round(calories),
          sourceName: (att.sourcename ?? att.sourceName ?? att["sourcename"]) ?? "Apple Health",
          duration,
        });
      } else if (node.name === "activitysummary") {
        const dateComp = ((att.datecomponents ?? att.dateComponents ?? att["datecomponents"]) ?? "").toString().slice(0, 10);
        if (!dateComp) return;
        const move = att.activeenergyburned ?? att.activeEnergyBurned ?? att["activeenergyburned"];
        const moveGoal = att.activeenergyburnedgoal ?? att.activeEnergyBurnedGoal ?? att["activeenergyburnedgoal"];
        const stand = att.applestandhours ?? att.appleStandHours ?? att["applestandhours"];
        const standGoal = att.applestandhoursgoal ?? att.appleStandHoursGoal ?? att["applestandhoursgoal"];
        const exercise = att.appleexercisetime ?? att.appleExerciseTime ?? att["appleexercisetime"];
        const exerciseGoal = att.appleexercisetimegoal ?? att.appleExerciseTimeGoal ?? att["appleexercisetimegoal"];
        activitySummaries.push({
          dateComp,
          move: move != null ? Number(move) : undefined,
          moveGoal: moveGoal != null ? Number(moveGoal) : undefined,
          stand: stand != null ? Number(stand) : undefined,
          standGoal: standGoal != null ? Number(standGoal) : undefined,
          exercise: exercise != null ? Number(exercise) / 60 : undefined,
          exerciseGoal: exerciseGoal != null ? Number(exerciseGoal) / 60 : undefined,
        });
      }
    });

    const saxDone = new Promise<void>((resolve, reject) => {
      saxStream.on("end", () => resolve());
      saxStream.on("error", (err: Error) => reject(err));
    });

    if (isZipFile) {
      // Stream-decompress ZIP → find export.xml → pipe XML chunks to SAX
      const uz = new Unzip();
      uz.register(UnzipInflate);

      let foundExportXml = false;
      const xmlDone = new Promise<void>((resolve, reject) => {
        uz.onfile = (file) => {
          if (foundExportXml) return;
          const name = file.name.toLowerCase();
          if (name.endsWith("export.xml") || name === "export.xml") {
            foundExportXml = true;
            const decoder = new TextDecoder();
            file.ondata = (err, chunk, final) => {
              if (err) { reject(err); return; }
              try {
                saxStream.write(decoder.decode(chunk, { stream: !final }));
              } catch (e) { reject(e); }
              if (final) {
                saxStream.end();
                resolve();
              }
            };
            file.start();
          }
        };
      });

      const reader = dataStream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (value) uz.push(value, done);
        if (done) break;
      }
      if (!foundExportXml) {
        saxStream.end();
        throw new Error("Ingen export.xml hittades i ZIP-filen.");
      }
      await xmlDone;
    } else {
      const reader = dataStream.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        const text = decoder.decode(value, { stream: !done });
        if (text) saxStream.write(text);
        if (done) break;
      }
      saxStream.end();
    }
    await saxDone;

    for (const key of Object.keys(hrvByDay)) {
      const vals = hrvByDay[key];
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      if (!wellnessByDay[key]) wellnessByDay[key] = {};
      wellnessByDay[key].hrv_last_night = Math.round(avg);
    }
    for (const key of Object.keys(rhrByDay)) {
      const vals = rhrByDay[key];
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      if (!wellnessByDay[key]) wellnessByDay[key] = {};
      wellnessByDay[key].resting_heart_rate = Math.round(avg);
    }
    for (const key of Object.keys(sleepByDay)) {
      const s = sleepByDay[key];
      if (!wellnessByDay[key]) wellnessByDay[key] = {};
      wellnessByDay[key].sleep_duration_seconds = Math.round(s.total);
      wellnessByDay[key].sleep_deep_seconds = Math.round(s.deep);
      wellnessByDay[key].sleep_rem_seconds = Math.round(s.rem);
      wellnessByDay[key].sleep_core_seconds = Math.round(s.core);
      wellnessByDay[key].sleep_awake_seconds = Math.round(s.awake);
      wellnessByDay[key].sleep_score = sleepScore(s.total, s.deep, s.rem) ?? null;
    }
    for (const a of activitySummaries) {
      const key = a.dateComp;
      if (!wellnessByDay[key]) wellnessByDay[key] = {};
      if (a.move != null) wellnessByDay[key].move_calories = a.move;
      if (a.moveGoal != null) wellnessByDay[key].move_goal = a.moveGoal;
      if (a.stand != null) wellnessByDay[key].stand_hours = a.stand;
      if (a.standGoal != null) wellnessByDay[key].stand_goal = a.standGoal;
      if (a.exercise != null) wellnessByDay[key].exercise_minutes = Math.round(a.exercise);
      if (a.exerciseGoal != null) wellnessByDay[key].exercise_goal = Math.round(a.exerciseGoal);
    }
    for (const key of Object.keys(wellnessByDay)) {
      const w = wellnessByDay[key];
      w.hrv_status = hrvStatus(w.hrv_last_night ?? null);
      const { score, verdict } = readinessScore(w.hrv_status, w.sleep_score ?? null, w.resting_heart_rate ?? null);
      w.readiness_score = score;
      w.readiness_verdict = verdict;
    }

    const wellnessRows: { user_id: string; date: string; [k: string]: unknown }[] = [];
    for (const [date, w] of Object.entries(wellnessByDay)) {
      wellnessRows.push({
        user_id: user.id,
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
      });
    }

    for (let i = 0; i < wellnessRows.length; i += WELLNESS_BATCH) {
      const chunk = wellnessRows.slice(i, i + WELLNESS_BATCH);
      const { error } = await supabase.from("apple_wellness").upsert(chunk, { onConflict: "user_id,date", ignoreDuplicates: false });
      if (error) throw error;
    }

    let runsInserted = 0;
    for (const w of workouts) {
      const start = new Date(w.start);
      const distanceMeters = (w.distance ?? 0) * 1000;
      const externalId = `apple_export_${start.getTime()}_${Math.round(distanceMeters)}`;
      const { data: existing } = await supabase.from("runs").select("id").eq("user_id", user.id).eq("external_id", externalId).maybeSingle();
      if (existing) continue;
      const end = new Date(w.end);
      const { error } = await supabase.from("runs").insert({
        user_id: user.id,
        source: "apple_watch",
        source_app: w.sourceName || "Apple Health export",
        external_id: externalId,
        started_at: w.start,
        ended_at: w.end,
        distance_meters: Math.round(distanceMeters),
        duration_seconds: Math.round(w.duration ?? (end.getTime() - start.getTime()) / 1000),
        calories: w.calories ? Math.round(w.calories) : null,
        title: `Löpning · ${(distanceMeters / 1000).toFixed(1)} km`,
      });
      if (!error) runsInserted++;
    }

    const { data: existingConn } = await supabase.from("apple_health_connections").select("id").eq("user_id", user.id).eq("is_active", true).maybeSingle();
    if (!existingConn) {
      await supabase.from("apple_health_connections").insert({
        user_id: user.id,
        permissions_granted: ["export"],
        last_synced_at: new Date().toISOString(),
        is_active: true,
      });
    } else {
      await supabase.from("apple_health_connections").update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("user_id", user.id).eq("is_active", true);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        wellnessRows: wellnessRows.length,
        runsInserted,
        connectionCreated: !existingConn,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("process-apple-health-export error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Processing failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
