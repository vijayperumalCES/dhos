import "server-only";

import { subDays } from "date-fns";

import type { OrgContext } from "@/lib/auth/org-context";
import { computeDeliveryKpis, computePortfolioKpis, isHealthStale, isInFlight, isPastTargetEnd, type ReportingPeriod } from "@/lib/domain/kpis";
import { todayInTimeZone } from "@/lib/domain/time";
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

  const canWork = ctx.permissions.has("work.read");
  const [historyRes, teamsRes, membersRes, milestonesRes, sprintsRes, blockedRes] = await Promise.all([
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
    ids.length
      ? supabase.from("project_milestones").select("id, name, project_id, due_date, baseline_due_date, completed_on").in("project_id", ids)
      : Promise.resolve({ data: [], error: null }),
    ids.length && canWork
      ? supabase
          .from("sprints")
          .select(
            "id, project_id, name, end_date, committed_points, work_items(story_points, archived_at, state:workflow_states!work_items_state_id_organization_id_fkey(category))",
          )
          .in("project_id", ids)
          .eq("state", "active")
      : Promise.resolve({ data: [], error: null }),
    ids.length && canWork
      ? supabase
          .from("work_items")
          .select("id, project_id, state:workflow_states!work_items_state_id_organization_id_fkey(category)")
          .in("project_id", ids)
          .eq("blocked", true)
          .is("archived_at", null)
      : Promise.resolve({ data: null, error: null }),
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

  const milestones = milestonesRes.data ?? [];
  const activeSprints = sprintsRes.data ?? [];
  const blockedOpen = blockedRes.data ? blockedRes.data.filter((w) => w.state?.category !== "done") : null;
  const sprintItems = activeSprints.flatMap((sp) =>
    sp.work_items.filter((w) => w.archived_at === null).map((w) => ({ story_points: w.story_points === null ? null : Number(w.story_points), done: w.state?.category === "done" })),
  );
  const delivery = computeDeliveryKpis({
    milestones,
    sprintItems,
    committedPoints: activeSprints.reduce((s, sp) => s + Number(sp.committed_points ?? 0), 0),
    activeSprints: activeSprints.length,
    blockedItems: blockedOpen ? blockedOpen.length : null,
    now,
    timeZone: ctx.settings.timezone,
  });
  const today = todayInTimeZone(now, ctx.settings.timezone);
  const overdueMilestonesByProject = new Map<string, number>();
  for (const m of milestones) if (!m.completed_on && m.due_date < today) overdueMilestonesByProject.set(m.project_id, (overdueMilestonesByProject.get(m.project_id) ?? 0) + 1);
  const blockedByProject = new Map<string, number>();
  for (const b of blockedOpen ?? []) blockedByProject.set(b.project_id, (blockedByProject.get(b.project_id) ?? 0) + 1);

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
        overdueMilestones: overdueMilestonesByProject.get(p.id) ?? 0,
        blockedItems: blockedByProject.get(p.id) ?? 0,
      },
    }))
    .filter((p) => p.flags.red || p.flags.amber || p.flags.overdue || p.flags.stale || p.flags.overdueMilestones > 0)
    .sort((a, b) => score(b.flags) - score(a.flags) || a.code.localeCompare(b.code));

  const recentChanges = history
    .filter((h) => h.change_type !== "created")
    .slice(0, 12)
    .map((h) => ({ ...h, project: byId.get(h.project_id) }));

  return {
    generatedAt: now.toISOString(),
    kpis,
    delivery,
    activeSprints: activeSprints.map((sp) => ({ id: sp.id, name: sp.name, endDate: sp.end_date, project: byId.get(sp.project_id) })),
    attention,
    recentChanges,
    teamCount: teamsRes.count,
    memberCount: membersRes.count,
    projectCount: rows.length,
  };
}

function score(f: { red: boolean; amber: boolean; overdue: boolean; stale: boolean; overdueMilestones: number }) {
  return (f.red ? 8 : 0) + (f.overdue ? 4 : 0) + (f.overdueMilestones > 0 ? 3 : 0) + (f.amber ? 2 : 0) + (f.stale ? 1 : 0);
}
