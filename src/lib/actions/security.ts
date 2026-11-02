"use server";

import { revalidatePath } from "next/cache";

import { requireOrgContext } from "@/lib/auth/org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation/common";
import { controlsSchema, decisionSchema, grantRequestSchema, legalHoldSchema, retentionSchema } from "@/lib/validation/security";

import { fail, fromPostgrestError, fromZodError, ok, type ActionResult } from "./result";

const NO_SETTINGS = "You don't have permission to change security settings.";
const NO_MEMBERS = "You don't have permission to manage members.";

function refresh() {
  revalidatePath("/admin/security");
  revalidatePath("/admin/members");
}

export async function saveSecurityControls(input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("org.settings.manage")) return fail(NO_SETTINGS);
  const parsed = controlsSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_security_controls", {
    p_org: ctx.organization.id,
    p_dual_approval: parsed.data.dualApproval,
    p_require_mfa: parsed.data.requireMfa,
  });
  if (error) return fromPostgrestError(error);
  refresh();
  return ok(undefined, "Security controls saved.");
}

export async function setLegalHold(on: boolean, input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("org.settings.manage")) return fail(NO_SETTINGS);
  let reason: string | null = null;
  if (on) {
    const parsed = legalHoldSchema.safeParse(input);
    if (!parsed.success) return fromZodError(parsed.error);
    reason = parsed.data.reason;
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_legal_hold", { p_org: ctx.organization.id, p_on: on, p_reason: reason as string });
  if (error) return fromPostgrestError(error);
  refresh();
  revalidatePath("/automation/scheduler");
  return ok(undefined, on ? "Legal hold placed. Retention deletes nothing until it is lifted." : "Legal hold lifted.");
}

export async function saveRetentionWindows(input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("org.settings.manage")) return fail(NO_SETTINGS);
  const parsed = retentionSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_retention_windows", {
    p_org: ctx.organization.id,
    p_outbox_days: parsed.data.outboxDays,
    p_notification_days: parsed.data.notificationDays,
    p_log_days: parsed.data.logDays,
  });
  if (error) return fromPostgrestError(error);
  refresh();
  revalidatePath("/automation/scheduler");
  return ok(undefined, "Retention windows saved.");
}

export async function requestRoleGrant(input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("org.members.manage")) return fail(NO_MEMBERS);
  const parsed = grantRequestSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("request_role_grant", {
    p_membership: parsed.data.membershipId,
    p_role_key: parsed.data.roleKey,
    p_reason: parsed.data.reason,
  });
  if (error) return fromPostgrestError(error, { duplicate: "That member already has the role, or a request for it is already waiting." });
  refresh();
  return ok({ id: data }, "Request sent. A different administrator must approve it.");
}

export async function decideRoleGrant(requestId: string, approve: boolean, input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("org.members.manage")) return fail(NO_MEMBERS);
  if (!uuid.safeParse(requestId).success) return fail("Invalid request.");
  const parsed = decisionSchema.safeParse(input ?? {});
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("decide_role_grant", { p_request: requestId, p_approve: approve, p_note: parsed.data.note as string });
  if (error) return fromPostgrestError(error);
  refresh();
  revalidatePath("/", "layout"); // the member's permissions changed
  return ok(undefined, approve ? "Approved. The role is granted." : "Request rejected.");
}

export async function cancelRoleGrant(requestId: string): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("org.members.manage")) return fail(NO_MEMBERS);
  if (!uuid.safeParse(requestId).success) return fail("Invalid request.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_role_grant", { p_request: requestId });
  if (error) return fromPostgrestError(error);
  refresh();
  return ok(undefined, "Request cancelled.");
}
