import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { PermissionSet } from "@/lib/domain/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { requireUser, type CurrentUser } from "./session";

export const ACTIVE_ORG_COOKIE = "stride_ces_org";
/** Cookie name before the stride-ces rename; read as a fallback and cleared on sign-out. */
export const LEGACY_ORG_COOKIE = "dhos_org";

export type OrgSummary = { id: string; name: string; slug: string; isDemo: boolean };

export type OrgContext = {
  user: CurrentUser & { displayName: string };
  organization: OrgSummary;
  organizations: OrgSummary[];
  membershipId: string;
  roles: { key: string; name: string }[];
  permissions: PermissionSet;
  settings: { timezone: string; currencyCode: string; healthStaleAfterDays: number };
};

/**
 * Resolves the caller's active organization. The cookie only expresses a preference: it is
 * honoured only when the user holds an active membership in that organization, and every
 * downstream query is still filtered by RLS.
 */
export const getOrgContext = cache(async (): Promise<OrgContext | null> => {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: memberships, error } = await supabase
    .from("organization_memberships")
    .select("id, organization_id, organizations!inner(id, name, slug, is_demo, archived_at)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .is("organizations.archived_at", null)
    .order("created_at");
  if (error) throw new Error(`Failed to load memberships: ${error.message}`);

  // An organization that requires MFA is invisible to a session that has not verified a second
  // factor, so it would otherwise look like the person belongs to nothing (and be sent to
  // onboarding). Ask the one function that is allowed to say so, and send them to verify.
  const { data: gated } = await supabase.rpc("mfa_required_organizations");
  const visible = new Set((memberships ?? []).map((m) => m.organization_id));
  if ((gated ?? []).some((o) => !visible.has(o.organization_id))) redirect("/mfa");

  if (!memberships?.length) return null;

  const organizations: OrgSummary[] = memberships.map((m) => ({
    id: m.organizations.id,
    name: m.organizations.name,
    slug: m.organizations.slug,
    isDemo: m.organizations.is_demo,
  }));

  const jar = await cookies();
  const preferred = jar.get(ACTIVE_ORG_COOKIE)?.value ?? jar.get(LEGACY_ORG_COOKIE)?.value;
  const active = memberships.find((m) => m.organization_id === preferred) ?? memberships[0];
  const orgId = active.organization_id;

  const [perms, roles, settings, profile] = await Promise.all([
    supabase.rpc("my_permissions", { p_org: orgId }),
    supabase.from("membership_roles").select("role_definitions!inner(key, name)").eq("membership_id", active.id),
    supabase
      .from("organization_settings")
      .select("timezone, currency_code, health_stale_after_days")
      .eq("organization_id", orgId)
      .single(),
    supabase.from("user_profiles").select("display_name").eq("id", user.id).single(),
  ]);
  if (perms.error) throw new Error(`Failed to load permissions: ${perms.error.message}`);

  return {
    user: { ...user, displayName: profile.data?.display_name ?? user.email },
    organization: organizations.find((o) => o.id === orgId)!,
    organizations,
    membershipId: active.id,
    roles: (roles.data ?? []).map((r) => r.role_definitions),
    permissions: new PermissionSet(perms.data ?? []),
    settings: {
      timezone: settings.data?.timezone ?? "UTC",
      currencyCode: settings.data?.currency_code ?? "USD",
      healthStaleAfterDays: settings.data?.health_stale_after_days ?? 14,
    },
  };
});

export async function requireOrgContext(): Promise<OrgContext> {
  const ctx = await getOrgContext();
  if (!ctx) redirect("/onboarding");
  return ctx;
}
