import "server-only";

import type { OrgContext } from "@/lib/auth/org-context";
import { IN_FLIGHT_STATUSES, type ProjectStatus } from "@/lib/domain/project-lifecycle";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProjectListFilters } from "@/lib/validation/project";

import { sanitizeSearch } from "./search";

export const PROJECTS_PAGE_SIZE = 20;

const PERSON = "id, user_profiles(display_name)";

const LIST_COLUMNS = `
  id, code, name, status, health, health_updated_at, target_end_date, planned_start_date, archived_at, updated_at, client_id,
  client:clients!projects_client_id_organization_id_fkey(id, name),
  manager:organization_memberships!projects_project_manager_id_organization_id_fkey(${PERSON}),
  team:teams!projects_primary_team_id_organization_id_fkey(id, name)
`;

export async function listProjects(ctx: OrgContext, filters: ProjectListFilters) {
  const supabase = await createSupabaseServerClient();
  const page = filters.page ?? 1;
  const from = (page - 1) * PROJECTS_PAGE_SIZE;

  let query = supabase
    .from("projects")
    .select(LIST_COLUMNS, { count: "exact" })
    .eq("organization_id", ctx.organization.id);

  if (filters.archived === "only") query = query.not("archived_at", "is", null);
  else if (filters.archived !== "include") query = query.is("archived_at", null);

  if (filters.status === "in_flight") query = query.in("status", IN_FLIGHT_STATUSES as ProjectStatus[]);
  else if (filters.status && filters.status !== "all") query = query.eq("status", filters.status as ProjectStatus);
  if (filters.health) query = query.eq("health", filters.health as "green");
  if (filters.client) query = query.eq("client_id", filters.client);
  if (filters.manager) query = query.eq("project_manager_id", filters.manager);
  if (filters.team) query = query.eq("primary_team_id", filters.team);
  const q = sanitizeSearch(filters.q);
  if (q) query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%`);

  const sort = filters.sort ?? "updated_at";
  const ascending = (filters.dir ?? (sort === "updated_at" || sort === "health" ? "desc" : "asc")) === "asc";
  query = query.order(sort, { ascending, nullsFirst: false }).order("code").range(from, from + PROJECTS_PAGE_SIZE - 1);

  const { data, count, error } = await query;
  if (error) throw new Error(`Failed to load projects: ${error.message}`);
  return { rows: data ?? [], total: count ?? 0, page, pageSize: PROJECTS_PAGE_SIZE };
}

export type ProjectListRow = Awaited<ReturnType<typeof listProjects>>["rows"][number];

export async function getProject(ctx: OrgContext, projectId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .select(
      `*,
       client:clients!projects_client_id_organization_id_fkey(id, name),
       manager:organization_memberships!projects_project_manager_id_organization_id_fkey(${PERSON}),
       owner:organization_memberships!projects_delivery_owner_id_organization_id_fkey(${PERSON}),
       team:teams!projects_primary_team_id_organization_id_fkey(id, name)`,
    )
    .eq("organization_id", ctx.organization.id)
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load project: ${error.message}`);
  return data;
}

export type ProjectDetail = NonNullable<Awaited<ReturnType<typeof getProject>>>;

export async function getProjectHistory(projectId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("project_status_history")
    .select("id, change_type, from_status, to_status, from_health, to_health, reason, changed_by, changed_at")
    .eq("project_id", projectId)
    .order("changed_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`Failed to load status history: ${error.message}`);
  return data ?? [];
}

export async function getProjectMembers(projectId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("project_memberships")
    .select("membership_id, project_role, allocation_percent, created_at, member:organization_memberships(id, job_title, user_profiles(display_name, email))")
    .eq("project_id", projectId)
    .order("created_at");
  if (error) throw new Error(`Failed to load project members: ${error.message}`);
  return data ?? [];
}

export async function listClientOptions(ctx: OrgContext) {
  if (!ctx.permissions.has("client.read")) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("clients")
    .select("id, name")
    .eq("organization_id", ctx.organization.id)
    .is("archived_at", null)
    .order("name");
  return data ?? [];
}

export async function listTeamOptions(ctx: OrgContext) {
  if (!ctx.permissions.has("team.read")) return [];
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("teams")
    .select("id, name")
    .eq("organization_id", ctx.organization.id)
    .is("archived_at", null)
    .order("name");
  return data ?? [];
}

/** Display names for the users referenced in history rows; RLS hides people the viewer may not see. */
export async function resolveUserNames(userIds: (string | null)[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((v): v is string => !!v))];
  if (!ids.length) return new Map();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("user_profiles").select("id, display_name").in("id", ids);
  return new Map((data ?? []).map((p) => [p.id, p.display_name]));
}
