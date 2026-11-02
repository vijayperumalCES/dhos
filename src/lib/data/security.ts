import "server-only";

import type { OrgContext } from "@/lib/auth/org-context";
import { isPrivilegedPermission } from "@/lib/domain/security";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SecuritySettings = {
  requireDualApproval: boolean;
  requireMfa: boolean;
  legalHold: boolean;
  legalHoldReason: string | null;
  legalHoldSetAt: string | null;
  retention: { outboxDays: number; notificationDays: number; logDays: number };
};

export type GrantRequest = {
  id: string;
  memberName: string;
  roleName: string;
  roleKey: string;
  reason: string;
  requestedById: string;
  requestedByName: string;
  status: "pending" | "approved" | "rejected" | "cancelled" | "expired";
  createdAt: string;
  expiresAt: string;
  expired: boolean;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
};

export async function getSecuritySettings(ctx: OrgContext): Promise<SecuritySettings> {
  const supabase = await createSupabaseServerClient();
  const [{ data: s, error }, { data: job }] = await Promise.all([
    supabase
      .from("organization_settings")
      .select("require_dual_approval, require_mfa, legal_hold, legal_hold_reason, legal_hold_set_at")
      .eq("organization_id", ctx.organization.id)
      .single(),
    supabase.from("scheduled_jobs").select("config").eq("organization_id", ctx.organization.id).eq("key", "retention").maybeSingle(),
  ]);
  if (error) throw new Error(`Failed to load security settings: ${error.message}`);
  const c = (job?.config ?? {}) as Record<string, unknown>;
  const num = (v: unknown, d: number) => (typeof v === "number" ? v : d);
  return {
    requireDualApproval: s.require_dual_approval,
    requireMfa: s.require_mfa,
    legalHold: s.legal_hold,
    legalHoldReason: s.legal_hold_reason,
    legalHoldSetAt: s.legal_hold_set_at,
    retention: { outboxDays: num(c.outbox_days, 30), notificationDays: num(c.notification_days, 90), logDays: num(c.log_days, 90) },
  };
}

export async function listGrantRequests(ctx: OrgContext): Promise<GrantRequest[]> {
  if (!ctx.permissions.has("org.members.manage")) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("role_grant_requests")
    .select(
      "id, reason, requested_by, status, created_at, expires_at, decided_by, decided_at, decision_note, role:role_definitions(key, name), member:organization_memberships(user_profiles(display_name))",
    )
    .eq("organization_id", ctx.organization.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Failed to load grant requests: ${error.message}`);

  const userIds = [...new Set((data ?? []).flatMap((r) => [r.requested_by, r.decided_by]).filter((v): v is string => Boolean(v)))];
  const names = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase.from("user_profiles").select("id, display_name").in("id", userIds);
    for (const p of profiles ?? []) names.set(p.id, p.display_name);
  }

  const now = Date.now();
  return (data ?? []).map((r) => ({
    id: r.id,
    memberName: r.member?.user_profiles?.display_name ?? "Unknown member",
    roleName: r.role?.name ?? "Unknown role",
    roleKey: r.role?.key ?? "",
    reason: r.reason,
    requestedById: r.requested_by,
    requestedByName: names.get(r.requested_by) ?? "Unknown",
    status: r.status as GrantRequest["status"],
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    expired: new Date(r.expires_at).getTime() <= now,
    decidedByName: r.decided_by ? (names.get(r.decided_by) ?? "Unknown") : null,
    decidedAt: r.decided_at,
    decisionNote: r.decision_note,
  }));
}

/** Roles that carry an administrative or finance permission, i.e. those that need an approved grant. */
export async function listPrivilegedRoles(ctx: OrgContext): Promise<{ key: string; name: string }[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("role_definitions")
    .select("key, name, role_permissions(permission_key)")
    .eq("organization_id", ctx.organization.id)
    .order("name");
  if (error) throw new Error(`Failed to load roles: ${error.message}`);
  return (data ?? [])
    .filter((r) => r.role_permissions.some((p) => isPrivilegedPermission(p.permission_key)))
    .map(({ key, name }) => ({ key, name }));
}
