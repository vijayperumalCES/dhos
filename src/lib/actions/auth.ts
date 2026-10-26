"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ACTIVE_ORG_COOKIE } from "@/lib/auth/org-context";
import { env } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNextPath, signInSchema, signUpSchema } from "@/lib/validation/auth";

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
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${env.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/onboarding`,
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
