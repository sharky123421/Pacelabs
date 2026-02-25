// Strava OAuth callback: exchange code for tokens, store in strava_connections, trigger initial import.
// GET /functions/v1/strava-auth-callback?code=...&state=user_id
// Redirects back to app deep link or success URL.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // expected: user_id
  const errorParam = url.searchParams.get("error");

  const appDeepLink = Deno.env.get("PACELAB_APP_DEEP_LINK") ?? "pacelab://";
  const successPath = Deno.env.get("STRAVA_OAUTH_SUCCESS_PATH") ?? "profile?strava=connected";
  const failurePath = Deno.env.get("STRAVA_OAUTH_FAILURE_PATH") ?? "profile?strava=error";

  if (errorParam) {
    const redirect = `${appDeepLink.replace(/\/$/, "")}/${failurePath}`;
    return Response.redirect(redirect, 302);
  }

  if (!code || !state) {
    return new Response(
      JSON.stringify({ error: "Missing code or state (expected state=user_id)" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const clientId = Deno.env.get("STRAVA_CLIENT_ID");
  const clientSecret = Deno.env.get("STRAVA_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceKey);

  const redirectUri = `${supabaseUrl}/functions/v1/strava-auth-callback`;
  const tokenRes = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    console.error("Strava token exchange failed:", tokenRes.status, text);
    const redirect = `${appDeepLink.replace(/\/$/, "")}/${failurePath}`;
    return Response.redirect(redirect, 302);
  }

  const tokenData = await tokenRes.json();
  const athlete = tokenData.athlete ?? {};
  const stravaAthleteId = athlete.id ?? tokenData.athlete_id;
  if (!stravaAthleteId) {
    return new Response(JSON.stringify({ error: "No athlete in token response" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId = state;
  const expiresAt = new Date((tokenData.expires_at ?? 0) * 1000).toISOString();

  const { error: upsertError } = await supabase.from("strava_connections").upsert(
    {
      user_id: userId,
      strava_athlete_id: stravaAthleteId,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expires_at: expiresAt,
      scope: tokenData.scope ?? null,
      is_active: true,
      last_synced_at: null,
    },
    { onConflict: "user_id" }
  );

  if (upsertError) {
    console.error("Strava connection upsert error:", upsertError);
    const redirect = `${appDeepLink.replace(/\/$/, "")}/${failurePath}`;
    return Response.redirect(redirect, 302);
  }

  // Trigger initial history import asynchronously (invoke import function without waiting)
  const functionsUrl = `${supabaseUrl}/functions/v1/strava-import-history`;
  fetch(functionsUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ user_id: userId, full_import: true }),
  }).catch((e) => console.error("Trigger import failed:", e));

  const redirect = `${appDeepLink.replace(/\/$/, "")}/${successPath}`;
  return Response.redirect(redirect, 302);
});
