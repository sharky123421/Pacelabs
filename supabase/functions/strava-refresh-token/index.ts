// Standalone token refresh for Strava. Called by other functions when token is expired.
// POST /functions/v1/strava-refresh-token
// Body: { connection_id: string } or { user_id: string }
// Headers: Authorization: Bearer SUPABASE_SERVICE_ROLE_KEY (or Anon + user JWT for user_id)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureValidToken } from "../_shared/strava_client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const connectionId = body.connection_id;
    const userId = body.user_id;

    let connection;
    if (connectionId) {
      const { data, error } = await supabase
        .from("strava_connections")
        .select("*")
        .eq("id", connectionId)
        .eq("is_active", true)
        .single();
      if (error || !data) {
        return new Response(JSON.stringify({ error: "Connection not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      connection = data;
    } else if (userId) {
      const { data, error } = await supabase
        .from("strava_connections")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true)
        .single();
      if (error || !data) {
        return new Response(JSON.stringify({ error: "No active Strava connection for user" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      connection = data;
    } else {
      return new Response(JSON.stringify({ error: "Provide connection_id or user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await ensureValidToken(supabase, connection);
    return new Response(JSON.stringify({ ok: true, expires_at: connection.token_expires_at }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
