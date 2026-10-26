import "server-only";

import type { OrgContext } from "@/lib/auth/org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const OWNER = "owner:organization_memberships!programs_owner_membership_id_organization_id_fkey(id, user_profiles(display_name))";

export async function listProgramOptions(ctx: OrgContext) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("programs")
    .select("id, code, name")
    .eq("organization_id", ctx.organization.id)
    .is("archived_at", null)
    .eq("status", "active")
    .order("name");
  return data ?? [];
}

export async function listPrograms(ctx: OrgContext, opts: { includeClosed?: boolean } = {}) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("programs")
    .select(`id, code, name, description, status, archived_at, ${OWNER}, projects(id, status, health, archived_at)`)
    .eq("organization_id", ctx.organization.id)
    .is("archived_at", null)
    .order("name");
  if (!opts.includeClosed) query = query.eq("status", "active");
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load programs: ${error.message}`);
  return (data ?? []).map((p) => ({ ...p, projects: p.projects.filter((x) => x.archived_at === null) }));
}

export async function getProgram(ctx: OrgContext, programId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("programs")
    .select(`*, ${OWNER}`)
    .eq("organization_id", ctx.organization.id)
    .eq("id", programId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load program: ${error.message}`);
  return data;
}

/** Projects of a program the viewer can see, with their milestones (RLS-filtered). */
export async function getProgramProjects(ctx: OrgContext, programId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .select(
      `id, code, name, status, health, health_reason, target_end_date, archived_at,
       manager:organization_memberships!projects_project_manager_id_organization_id_fkey(id, user_profiles(display_name)),
       project_milestones(id, name, due_date, baseline_due_date, completed_on)`,
    )
    .eq("organization_id", ctx.organization.id)
    .eq("program_id", programId)
    .is("archived_at", null)
    .order("code");
  if (error) throw new Error(`Failed to load program projects: ${error.message}`);
  return data ?? [];
}
