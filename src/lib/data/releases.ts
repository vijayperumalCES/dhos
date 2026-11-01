import "server-only";

import type { OrgContext } from "@/lib/auth/org-context";
import { summarizeGates, type GateStatus } from "@/lib/domain/governance";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PERSON = "id, user_profiles(display_name)";

export async function listReleases(ctx: OrgContext, filters: { project?: string; status?: string }) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("releases")
    .select(
      `id, project_id, name, version, status, planned_date, released_on, approved_at, created_at,
       project:projects!releases_project_id_organization_id_fkey(id, code, name),
       manager:organization_memberships!releases_release_manager_membership_id_organization_id_fkey(${PERSON}),
       gates:release_gates(is_required, status)`,
    )
    .eq("organization_id", ctx.organization.id);
  if (filters.project) query = query.eq("project_id", filters.project);
  if (filters.status === "active") query = query.in("status", ["planned", "in_review", "approved"]);
  else if (filters.status === "done") query = query.in("status", ["released", "cancelled"]);
  else if (filters.status) query = query.eq("status", filters.status as "planned");
  const { data, error } = await query.order("planned_date", { ascending: true, nullsFirst: false }).limit(300);
  if (error) throw new Error(`Failed to load releases: ${error.message}`);
  return (data ?? []).map((r) => ({ ...r, gateSummary: summarizeGates(r.gates as { is_required: boolean; status: GateStatus }[]) }));
}
export type ReleaseRow = Awaited<ReturnType<typeof listReleases>>[number];

export async function getRelease(ctx: OrgContext, releaseId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("releases")
    .select(
      `id, project_id, name, version, status, planned_date, released_on, notes, approved_at, created_at, release_manager_membership_id,
       project:projects!releases_project_id_organization_id_fkey(id, code, name),
       manager:organization_memberships!releases_release_manager_membership_id_organization_id_fkey(${PERSON}),
       approver:organization_memberships!releases_approved_by_membership_id_organization_id_fkey(${PERSON}),
       gates:release_gates(id, name, category, is_required, status, note, checked_at, position,
         checker:organization_memberships!release_gates_checked_by_membership_id_organization_id_fkey(${PERSON}))`,
    )
    .eq("organization_id", ctx.organization.id)
    .eq("id", releaseId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load the release: ${error.message}`);
  if (!data) return null;

  const readiness = await supabase.rpc("release_readiness", { p_release: releaseId });
  const gates = [...data.gates].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  return {
    ...data,
    gates,
    gateSummary: summarizeGates(gates as { is_required: boolean; status: GateStatus }[]),
    openCriticalDefects: readiness.data?.[0]?.open_critical_defects ?? 0,
    openHighDefects: readiness.data?.[0]?.open_high_defects ?? 0,
  };
}
export type ReleaseDetail = NonNullable<Awaited<ReturnType<typeof getRelease>>>;
