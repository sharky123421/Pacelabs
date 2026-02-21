// Apple Health workout sync: app sends new Apple Watch runs after dedup.
// Invoke with: POST /functions/v1/apple-health-sync-workouts
// Body: { runs: [ { started_at, ended_at, distance_meters, duration_seconds, source_app, external_id, calories?, title? } ] }
import "jsr:@supabase/functions-js/edge_runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { runs } = await req.json();
    if (!Array.isArray(runs)) {
      return new Response(JSON.stringify({ error: "Missing runs array" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const inserted = [];
    for (const r of runs) {
      if (!r.started_at || !r.external_id) continue;
      const row = {
        user_id: user.id,
        source: "apple_watch",
        source_app: r.source_app ?? "Apple Watch",
        external_id: r.external_id,
        started_at: r.started_at,
        ended_at: r.ended_at ?? r.started_at,
        distance_meters: r.distance_meters ?? 0,
        duration_seconds: r.duration_seconds ?? null,
        calories: r.calories ?? null,
        title: r.title ?? null,
      };
      const { data, error } = await supabase.from("runs").insert(row).select("id").single();
      if (!error && data) inserted.push(data.id);
    }

    return new Response(JSON.stringify({ ok: true, inserted: inserted.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
