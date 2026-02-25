import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function getSupabaseAdmin(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

export function getSupabaseAnon(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  );
}

export async function authenticateUser(
  req: Request,
): Promise<{ userId: string } | { error: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return { error: "Unauthorized" };

  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return { error: "Unauthorized" };

  const anonClient = getSupabaseAnon();
  const {
    data: { user },
    error,
  } = await anonClient.auth.getUser(jwt);

  if (error || !user) return { error: "Unauthorized" };
  return { userId: user.id };
}
