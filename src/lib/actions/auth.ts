"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { ACTIVE_ORG_COOKIE } from "@/lib/auth/org-context";
import { resolveSiteOrigin } from "@/lib/auth/site-origin";
import { env } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { forgotPasswordSchema, safeNextPath, setPasswordSchema, signInSchema, signUpSchema } from "@/lib/validation/auth";

import { fail, fromZodError, ok, type ActionResult } from "./result";

export async function signIn(input: unknown, next?: string): Promise<ActionResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  // Deliberately generic: never reveal whether the email exists.
  if (error) return fail(error.code === "email_not_confirmed" ? "Confirm your email address before signing in." : "Invalid email or password.");

  // Activate any invitations addressed to this verified email.
  await supabase.rpc("accept_pending_invitations");
  redirect(safeNextPath(next));
}

export async function signUp(input: unknown): Promise<ActionResult<{ needsConfirmation: boolean }>> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const origin = resolveSiteOrigin(await headers(), env.NEXT_PUBLIC_SITE_URL);
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${origin}/auth/confirm?next=/onboarding`,
    },
  });
  if (error) {
    if (error.code === "weak_password") return fail("That password is too weak. Choose a longer, less common password.");
    if (error.code === "over_email_send_rate_limit" || error.status === 429) return fail("Too many attempts. Please wait and try again.");
    return fail("We couldn't create your account. Check your details and try again.");
  }

  if (data.session) {
    await supabase.rpc("accept_pending_invitations");
    redirect("/onboarding");
  }
  return ok({ needsConfirmation: true }, "Check your email to confirm your account.");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  (await cookies()).delete(ACTIVE_ORG_COOKIE);
  redirect("/login");
}

export async function requestPasswordReset(input: unknown): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const origin = resolveSiteOrigin(await headers(), env.NEXT_PUBLIC_SITE_URL);
  // PKCE: the code verifier is stored in this browser, so the link must be opened here.
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/confirm?next=/reset-password`,
  });
  if (error && (error.status === 429 || error.code === "over_email_send_rate_limit")) {
    return fail("Too many requests. Please wait a few minutes and try again.");
  }
  // Same response whether or not the account exists, so emails can't be enumerated.
  return ok(undefined, "If an account exists for that email, a reset link is on its way.");
}

export async function setPassword(input: unknown): Promise<ActionResult> {
  const parsed = setPasswordSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return fail("Your session has expired. Request a new link.");

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") return fail("Choose a password you haven't used for this account.");
    if (error.code === "weak_password") return fail("That password is too weak. Choose a longer, less common password.");
    if (error.code === "reauthentication_needed") return fail("For security, sign in again before changing your password.");
    return fail("We couldn't update your password. Please try again.");
  }
  return ok(undefined, "Password updated.");
}
