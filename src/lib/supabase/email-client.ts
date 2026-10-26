import "server-only";

import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";

/**
 * Stateless Supabase client for asking Auth to email *someone else* a sign-in link (invitations).
 *
 * It must not share the caller's cookie storage: with the SSR client's PKCE flow the code
 * verifier would be saved in the inviter's browser and the invitee's link could never be
 * exchanged. The implicit flow returns tokens in the URL fragment, which /auth/callback handles.
 * Uses only the publishable key — the same request any visitor could make — so no privileged
 * credential is involved.
 */
export function createAuthEmailClient() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, flowType: "implicit" },
  });
}

export async function sendInvitationEmail(email: string, origin: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { error } = await createAuthEmailClient().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: `${origin}/auth/callback?next=/welcome` },
  });
  if (!error) return { ok: true };
  if (error.status === 429 || error.code === "over_email_send_rate_limit") {
    return { ok: false, reason: "the email service's rate limit was reached; try resending later" };
  }
  console.error("[stride] invitation email failed", { code: error.code, status: error.status });
  return { ok: false, reason: "the email service rejected the request" };
}
