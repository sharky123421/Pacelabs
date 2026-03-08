import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type IntervalsActivity = {
  id: number | string;
  name?: string;
  type?: string;
  start_date_local?: string;
  start_date?: string;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  average_heartrate?: number;
  icu_training_load?: number;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return new Response(JSON.stringify({ error: "Missing Supabase env" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "No auth user" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    const serviceSupabase = createClient(supabaseUrl, serviceKey);
    const { data: conn, error: connError } = await serviceSupabase
      .from("intervals_connections")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();

    if (connError || !conn) {
      return new Response(JSON.stringify({ error: "No active Intervals.icu connection" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const athleteId = conn.athlete_id;
    const apiKey: string = conn.api_key;
    if (!athleteId || !apiKey) {
      return new Response(JSON.stringify({ error: "Intervals.icu connection is missing athlete_id or api_key" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const newest = now.toISOString().slice(0, 10);
    const oldestDate = conn.last_synced_at ? new Date(conn.last_synced_at) : new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const oldest = oldestDate.toISOString().slice(0, 10);

    const fields = [
      "id",
      "name",
      "type",
      "start_date_local",
      "start_date",
      "distance",
      "moving_time",
      "elapsed_time",
      "average_heartrate",
      "icu_training_load",
    ].join(",");

    const url = new URL(`https://intervals.icu/api/v1/athlete/${athleteId}/activities`);
    url.searchParams.set("oldest", oldest);
    url.searchParams.set("newest", newest);
    url.searchParams.set("fields", fields);

    const basicCreds = typeof btoa === "function" ? btoa(`API_KEY:${apiKey}`) : Buffer.from(`API_KEY:${apiKey}`).toString("base64");

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Basic ${basicCreds}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(
        JSON.stringify({ error: "Intervals.icu API error", status: res.status, body: text }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const activities = (await res.json()) as IntervalsActivity[] | null;
    if (!activities || !Array.isArray(activities) || activities.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          imported: 0,
          skipped: 0,
          message: "No activities returned from Intervals.icu",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let imported = 0;
    let skipped = 0;

    for (const act of activities) {
      if (!act) continue;
      const type = (act.type || "").toLowerCase();
      if (!type.includes("run")) continue;

      const externalId = String(act.id);

      const { data: existing, error: existingError } = await serviceSupabase
        .from("runs")
        .select("id")
        .eq("user_id", userId)
        .eq("source_app", "intervals.icu")
        .eq("external_id", externalId)
        .is("deleted_at", null)
        .maybeSingle();

      if (existingError) {
        console.error("Intervals.icu existing run lookup error", existingError);
      }

      if (existing?.id) {
        skipped += 1;
        continue;
      }

      const startIso =
        act.start_date_local ??
        act.start_date ??
        now.toISOString();
      const durationSeconds = act.moving_time ?? act.elapsed_time ?? 0;
      const start = new Date(startIso);
      if (Number.isNaN(start.getTime())) continue;
      const end = new Date(start.getTime() + (durationSeconds || 0) * 1000);

      const distanceMeters = act.distance != null ? Number(act.distance) : null;

      const title = act.name || "Run";

      const { error: insertError } = await serviceSupabase.from("runs").insert({
        user_id: userId,
        started_at: start.toISOString(),
        ended_at: end.toISOString(),
        distance_meters: distanceMeters,
        duration_seconds: durationSeconds || null,
        title,
        source: "device",
        source_app: "intervals.icu",
        external_id: externalId,
        avg_hr: act.average_heartrate ?? null,
        tss: act.icu_training_load ?? null,
      });

      if (insertError) {
        console.error("Intervals.icu insert run error", insertError);
        continue;
      }

      imported += 1;
    }

    await serviceSupabase
      .from("intervals_connections")
      .update({ last_synced_at: now.toISOString() })
      .eq("id", conn.id);

    return new Response(
      JSON.stringify({
        ok: true,
        imported,
        skipped,
        oldest,
        newest,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("Intervals.icu sync error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

