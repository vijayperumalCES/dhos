import "server-only";

import type { OrgContext } from "@/lib/auth/org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type MemberOption = { id: string; displayName: string; email: string; jobTitle: string | null };

export type MemberRow = MemberOption & {
  userId: string;
  status: "active" | "suspended";
  joinedAt: string;
  roles: { key: string; name: string }[];
};

export async function listMembers(ctx: OrgContext, opts: { includeSuspended?: boolean } = {}): Promise<MemberRow[]> {
  if (!ctx.permissions.has("org.members.read")) return [];
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("organization_memberships")
    .select(
      "id, user_id, status, job_title, created_at, user_profiles(display_name, email), membership_roles(role_definitions(key, name))",
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
    .select("id, key, name, description, is_system, role_permissions(permission_key)")
    .eq("organization_id", ctx.organization.id)
    .order("created_at");
  if (error) throw new Error(`Failed to load roles: ${error.message}`);
  return (data ?? []).map((r) => ({ ...r, permissions: r.role_permissions.map((p) => p.permission_key) }));
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
    .select("id, email, role_keys, status, expires_at, created_at")
    .eq("organization_id", ctx.organization.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load invitations: ${error.message}`);
  return data ?? [];
}
