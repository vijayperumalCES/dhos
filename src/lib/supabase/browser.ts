"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types";

/** Browser client, used only where a session arrives in the URL fragment (/auth/callback). */
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { detectSessionInUrl: false } },
  );
}
