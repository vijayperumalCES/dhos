import "server-only";

import type { OrgContext } from "@/lib/auth/org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type MemberOption = { id: string; displayName: string; email: string; jobTitle: string | null };

export type MemberRow = MemberOption & {
  userId: string;
  status: "active" | "suspended";
  joinedAt: string;
  roles: { key: string; name: string }[];
  departmentId: string | null;
  departmentName: string | null;
  managerMembershipId: string | null;
};

export async function listMembers(ctx: OrgContext, opts: { includeSuspended?: boolean } = {}): Promise<MemberRow[]> {
  if (!ctx.permissions.has("org.members.read")) return [];
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("organization_memberships")
    .select(
      "id, user_id, status, job_title, created_at, department_id, manager_membership_id, user_profiles(display_name, email), membership_roles(role_definitions(key, name)), department:departments!organization_memberships_department_fkey(name)",
    )
    .eq("organization_id", ctx.organization.id);
  if (!opts.includeSuspended) query = query.eq("status", "active");
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load members: ${error.message}`);

  return (data ?? [])
    .map((m) => ({
      id: m.id,
      userId: m.user_id,
      status: m.status,
      jobTitle: m.job_title,
      joinedAt: m.created_at,
      displayName: m.user_profiles?.display_name ?? "Unknown user",
      email: m.user_profiles?.email ?? "",
      roles: m.membership_roles.map((r) => r.role_definitions).filter(Boolean),
      departmentId: m.department_id,
      departmentName: m.department?.name ?? null,
      managerMembershipId: m.manager_membership_id,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function listMemberOptions(ctx: OrgContext): Promise<MemberOption[]> {
  return (await listMembers(ctx)).map(({ id, displayName, email, jobTitle }) => ({ id, displayName, email, jobTitle }));
}

export async function listRoles(ctx: OrgContext) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("role_definitions")
    .select("id, key, name, description, is_system, role_permissions(permission_key), membership_roles(count)")
    .eq("organization_id", ctx.organization.id)
    .order("is_system", { ascending: false })
    .order("created_at");
  if (error) throw new Error(`Failed to load roles: ${error.message}`);
  return (data ?? []).map(({ role_permissions, membership_roles, ...r }) => ({
    ...r,
    permissions: role_permissions.map((p) => p.permission_key),
    memberCount: membership_roles[0]?.count ?? 0,
  }));
}

export async function listPermissionCatalogue() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("permissions").select("key, category, description").order("key");
  if (error) throw new Error(`Failed to load permissions: ${error.message}`);
  return data ?? [];
}

export async function listInvitations(ctx: OrgContext) {
  if (!ctx.permissions.has("org.members.manage")) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organization_invitations")
    .select("id, email, role_keys, status, expires_at, created_at, email_sent_count, email_last_sent_at")
    .eq("organization_id", ctx.organization.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load invitations: ${error.message}`);
  return data ?? [];
}

export async function listDepartments(ctx: OrgContext, opts: { includeArchived?: boolean } = {}) {
  if (!ctx.permissions.has("org.members.read")) return [];
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("departments")
    .select(
      "id, name, code, description, archived_at, head_membership_id, head:organization_memberships!departments_head_membership_id_organization_id_fkey(id, user_profiles(display_name)), organization_memberships!organization_memberships_department_fkey(count)",
    )
    .eq("organization_id", ctx.organization.id)
    .order("name");
  if (!opts.includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load departments: ${error.message}`);
  return (data ?? []).map(({ organization_memberships, ...d }) => ({ ...d, memberCount: organization_memberships[0]?.count ?? 0 }));
}
