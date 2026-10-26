import "server-only";

import { subDays } from "date-fns";

import type { OrgContext } from "@/lib/auth/org-context";
import { computePortfolioKpis, isHealthStale, isInFlight, isPastTargetEnd, type ReportingPeriod } from "@/lib/domain/kpis";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DashboardFilters = { client?: string; manager?: string; team?: string };

/**
 * Loads the rows behind the Command Center. Everything is read with the viewer's session,
 * so a project manager's dashboard covers only their assigned projects.
 */
export async function getDashboardData(ctx: OrgContext, period: ReportingPeriod, filters: DashboardFilters) {
  const supabase = await createSupabaseServerClient();
  const now = new Date();

  let projectsQuery = supabase
    .from("projects")
    .select(
      `id, code, name, status, health, health_reason, health_updated_at, target_end_date, archived_at, updated_at, client_id,
       client:clients!projects_client_id_organization_id_fkey(id, name),
       manager:organization_memberships!projects_project_manager_id_organization_id_fkey(id, user_profiles(display_name))`,
    )
    .eq("organization_id", ctx.organization.id)
    .is("archived_at", null);
  if (filters.client) projectsQuery = projectsQuery.eq("client_id", filters.client);
  if (filters.manager) projectsQuery = projectsQuery.eq("project_manager_id", filters.manager);
  if (filters.team) projectsQuery = projectsQuery.eq("primary_team_id", filters.team);

  const { data: projects, error } = await projectsQuery;
  if (error) throw new Error(`Failed to load dashboard projects: ${error.message}`);
  const rows = projects ?? [];
  const ids = rows.map((p) => p.id);

  const [historyRes, teamsRes, membersRes] = await Promise.all([
    ids.length
      ? supabase
          .from("project_status_history")
          .select("id, project_id, change_type, from_status, to_status, from_health, to_health, reason, changed_at")
          .in("project_id", ids)
          .gte("changed_at", subDays(now, period).toISOString())
          .order("changed_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    ctx.permissions.has("team.read")
      ? supabase
          .from("teams")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", ctx.organization.id)
          .is("archived_at", null)
      : Promise.resolve({ count: null, error: null }),
    ctx.permissions.has("org.members.read")
      ? supabase
          .from("organization_memberships")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", ctx.organization.id)
          .eq("status", "active")
      : Promise.resolve({ count: null, error: null }),
  ]);
  if (historyRes.error) throw new Error(`Failed to load status history: ${historyRes.error.message}`);
  const history = historyRes.data ?? [];

  const kpis = computePortfolioKpis({
    projects: rows,
    history,
    now,
    timeZone: ctx.settings.timezone,
    staleAfterDays: ctx.settings.healthStaleAfterDays,
    periodDays: period,
  });

  const byId = new Map(rows.map((p) => [p.id, p]));
  const attention = rows
    .filter(isInFlight)
    .map((p) => ({
      ...p,
      flags: {
        red: p.health === "red",
        amber: p.health === "amber",
        overdue: isPastTargetEnd(p, now, ctx.settings.timezone),
        stale: isHealthStale(p, now, ctx.settings.healthStaleAfterDays),
      },
    }))
    .filter((p) => p.flags.red || p.flags.amber || p.flags.overdue || p.flags.stale)
    .sort((a, b) => score(b.flags) - score(a.flags) || a.code.localeCompare(b.code));

  const recentChanges = history
    .filter((h) => h.change_type !== "created")
    .slice(0, 12)
    .map((h) => ({ ...h, project: byId.get(h.project_id) }));

  return {
    generatedAt: now.toISOString(),
    kpis,
    attention,
    recentChanges,
    teamCount: teamsRes.count,
    memberCount: membersRes.count,
    projectCount: rows.length,
  };
}

function score(f: { red: boolean; amber: boolean; overdue: boolean; stale: boolean }) {
  return (f.red ? 8 : 0) + (f.overdue ? 4 : 0) + (f.amber ? 2 : 0) + (f.stale ? 1 : 0);
}
