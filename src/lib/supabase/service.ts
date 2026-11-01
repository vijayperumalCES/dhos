import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

/**
 * Client for the background worker only. It carries the secret key, so it can call the
 * service_role-only RPCs (claim, fan out, complete, run jobs) and nothing in the app uses it to read
 * tenant tables. Callers must have authenticated the request first (cron secret, or a signed-in
 * person holding automation.manage). Returns null when the platform has no secret key configured.
 */
export function createSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
