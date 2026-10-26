"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { ACTIVE_ORG_COOKIE, getOrgContext, requireOrgContext } from "@/lib/auth/org-context";
import { requireUser } from "@/lib/auth/session";
import { resolveSiteOrigin } from "@/lib/auth/site-origin";
import { env } from "@/lib/env";
import { sendInvitationEmail } from "@/lib/supabase/email-client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requiredText, uuid } from "@/lib/validation/common";
import {
  createOrganizationSchema,
  inviteMemberSchema,
  organizationSettingsSchema,
  setMemberRolesSchema,
} from "@/lib/validation/organization";

import { fail, fromPostgrestError, fromZodError, ok, type ActionResult } from "./result";

const ORG_COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax" as const, path: "/", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 };

export async function switchOrganization(organizationId: string): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx || !ctx.organizations.some((o) => o.id === organizationId)) return fail("You are not a member of that organization.");
  (await cookies()).set(ACTIVE_ORG_COOKIE, organizationId, ORG_COOKIE_OPTIONS);
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function createOrganization(input: unknown): Promise<ActionResult<{ id: string }>> {
  await requireUser();
  const parsed = createOrganizationSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_organization", { p_name: parsed.data.name, p_slug: parsed.data.slug });
  if (error) return fromPostgrestError(error, { duplicate: "That URL slug is already taken." });

  (await cookies()).set(ACTIVE_ORG_COOKIE, data, ORG_COOKIE_OPTIONS);
  revalidatePath("/", "layout");
  return ok({ id: data }, "Organization created.");
}

export async function acceptPendingInvitations(): Promise<ActionResult<{ accepted: number }>> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("accept_pending_invitations");
  if (error) return fromPostgrestError(error);
  if (data > 0) revalidatePath("/", "layout");
  return ok({ accepted: data });
}

export async function acceptInvitationsAndContinue() {
  const result = await acceptPendingInvitations();
  if (result.ok && result.data.accepted > 0) redirect("/dashboard");
  redirect("/onboarding?invites=none");
}

export async function updateOrganizationSettings(input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("org.settings.manage")) return fail("You don't have permission to change organization settings.");
  const parsed = organizationSettingsSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const orgRes = await supabase.from("organizations").update({ name: parsed.data.name }).eq("id", ctx.organization.id);
  if (orgRes.error) return fromPostgrestError(orgRes.error);
  const settingsRes = await supabase
    .from("organization_settings")
    .update({
      timezone: parsed.data.timezone,
      currency_code: parsed.data.currencyCode,
      health_stale_after_days: parsed.data.healthStaleAfterDays,
    })
    .eq("organization_id", ctx.organization.id);
  if (settingsRes.error) return fromPostgrestError(settingsRes.error);

  revalidatePath("/", "layout");
  return ok(undefined, "Settings saved.");
}

export async function inviteMember(input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("org.members.manage")) return fail("You don't have permission to invite members.");
  const parsed = inviteMemberSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { data: invitationId, error } = await supabase.rpc("invite_member", {
    p_org: ctx.organization.id,
    p_email: parsed.data.email,
    p_role_keys: parsed.data.roleKeys,
  });
  if (error) return fromPostgrestError(error, { duplicate: "That person is already a member of this organization." });

  const emailed = await emailInvitation(invitationId, parsed.data.email);
  revalidatePath("/admin/members");
  return ok(
    undefined,
    emailed.ok
      ? `Invitation emailed to ${parsed.data.email}.`
      : `Invitation recorded, but the email was not sent: ${emailed.reason}. They can still join by signing up with this email.`,
  );
}

/** Sends (or resends) the sign-in link for a pending invitation and records the send. */
async function emailInvitation(invitationId: string, email: string) {
  const origin = resolveSiteOrigin(await headers(), env.NEXT_PUBLIC_SITE_URL);
  const result = await sendInvitationEmail(email, origin);
  if (result.ok) {
    const supabase = await createSupabaseServerClient();
    await supabase.rpc("record_invitation_email_sent", { p_invitation: invitationId });
  }
  return result;
}

export async function resendInvitation(invitationId: string): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(invitationId).success) return fail("Invalid invitation.");
  if (!ctx.permissions.has("org.members.manage")) return fail("You don't have permission to invite members.");

  const supabase = await createSupabaseServerClient();
  const { data: invitation } = await supabase
    .from("organization_invitations")
    .select("id, email, status, expires_at")
    .eq("id", invitationId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!invitation || invitation.status !== "pending") return fail("That invitation is no longer pending.");
  if (new Date(invitation.expires_at) < new Date()) return fail("That invitation has expired. Revoke it and invite again.");

  const emailed = await emailInvitation(invitation.id, invitation.email);
  revalidatePath("/admin/members");
  return emailed.ok ? ok(undefined, `Invitation re-sent to ${invitation.email}.`) : fail(`The email was not sent: ${emailed.reason}.`);
}

export async function revokeInvitation(invitationId: string): Promise<ActionResult> {
  await requireOrgContext();
  if (!uuid.safeParse(invitationId).success) return fail("Invalid invitation.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("revoke_invitation", { p_invitation: invitationId });
  if (error) return fromPostgrestError(error);
  revalidatePath("/admin/members");
  return ok(undefined, "Invitation revoked.");
}

export async function setMemberRoles(input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("org.members.manage")) return fail("You don't have permission to change roles.");
  const parsed = setMemberRolesSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_member_roles", {
    p_membership: parsed.data.membershipId,
    p_role_keys: parsed.data.roleKeys,
  });
  if (error) return fromPostgrestError(error);

  revalidatePath("/", "layout");
  return ok(undefined, "Roles updated.");
}

export async function setMembershipStatus(membershipId: string, status: "active" | "suspended"): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(membershipId).success || !["active", "suspended"].includes(status)) return fail("Invalid request.");
  if (!ctx.permissions.has("org.members.manage")) return fail("You don't have permission to manage members.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_membership_status", { p_membership: membershipId, p_status: status });
  if (error) return fromPostgrestError(error);

  revalidatePath("/admin/members");
  return ok(undefined, status === "suspended" ? "Membership suspended." : "Membership reactivated.");
}

export async function updateMyProfile(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = requiredText(1, 120, "Name").safeParse((input as { displayName?: unknown })?.displayName);
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("user_profiles").update({ display_name: parsed.data }).eq("id", user.id);
  if (error) return fromPostgrestError(error);
  revalidatePath("/", "layout");
  return ok(undefined, "Profile updated.");
}
