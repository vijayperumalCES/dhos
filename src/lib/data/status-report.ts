import "server-only";

import type { OrgContext } from "@/lib/auth/org-context";
import { addDaysToDate, todayInTimeZone } from "@/lib/domain/time";
import { milestoneStatus, scheduleVarianceDays } from "@/lib/domain/work";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Evidence gathered from the system of record for a project status report. Stored as JSON with
 * the report so the record shows what the numbers were when it was written.
 *
 * Reports are readable by everyone who can see the project, including client stakeholders, so the
 * snapshot holds counts only for internal work items — never their titles.
 */
export async function buildReportMetrics(ctx: OrgContext, projectId: string, periodStart: string, periodEnd: string) {
  const supabase = await createSupabaseServerClient();
  const today = todayInTimeZone(new Date(), ctx.settings.timezone);
  const [project, milestones, sprint, blocked, completed, history] = await Promise.all([
    supabase.from("projects").select("status, health, health_reason, target_end_date").eq("id", projectId).single(),
    supabase.from("project_milestones").select("name, due_date, baseline_due_date, completed_on").eq("project_id", projectId).order("due_date"),
    supabase
      .from("sprints")
      .select("id, name, start_date, end_date, committed_points")
      .eq("project_id", projectId)
      .eq("state", "active")
      .maybeSingle(),
    supabase.from("work_items").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("blocked", true).is("archived_at", null),
    supabase
      .from("work_items")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .gte("completed_at", `${periodStart}T00:00:00Z`)
      .lte("completed_at", `${periodEnd}T23:59:59Z`)
      .is("archived_at", null),
    supabase
      .from("project_status_history")
      .select("change_type, from_status, to_status, from_health, to_health, reason, changed_at")
      .eq("project_id", projectId)
      .in("change_type", ["status", "health"])
      .gte("changed_at", `${periodStart}T00:00:00Z`)
      .lte("changed_at", `${periodEnd}T23:59:59Z`)
      .order("changed_at"),
  ]);

  let sprintProgress = null;
  if (sprint.data) {
    const { data: items } = await supabase
      .from("work_items")
      .select("story_points, state:workflow_states!work_items_state_id_organization_id_fkey(category)")
      .eq("sprint_id", sprint.data.id)
      .is("archived_at", null);
    const all = items ?? [];
    const pts = (list: typeof all) => list.reduce((s, i) => s + Number(i.story_points ?? 0), 0);
    sprintProgress = {
      name: sprint.data.name,
      endDate: sprint.data.end_date,
      committedPoints: Number(sprint.data.committed_points ?? 0),
      scopePoints: pts(all),
      donePoints: pts(all.filter((i) => i.state?.category === "done")),
    };
  }

  const ms = milestones.data ?? [];
  return {
    asOf: today,
    project: project.data,
    milestones: {
      overdue: ms.filter((m) => milestoneStatus(m, today) === "overdue").map((m) => ({ name: m.name, dueDate: m.due_date })),
      dueNext14Days: ms
        .filter((m) => !m.completed_on && m.due_date >= today && m.due_date <= addDaysToDate(today, 14))
        .map((m) => ({ name: m.name, dueDate: m.due_date })),
      achievedInPeriod: ms.filter((m) => m.completed_on && m.completed_on >= periodStart && m.completed_on <= periodEnd).map((m) => ({ name: m.name, completedOn: m.completed_on })),
      slipped: ms
        .filter((m) => !m.completed_on && (scheduleVarianceDays(m) ?? 0) > 0)
        .map((m) => ({ name: m.name, varianceDays: scheduleVarianceDays(m) })),
    },
    sprint: sprintProgress,
    blockedItems: blocked.count ?? 0,
    completedItems: completed.count ?? 0,
    changes: history.data ?? [],
  };
}

export type ReportMetrics = Awaited<ReturnType<typeof buildReportMetrics>>;

export async function listStatusReports(projectId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("project_status_reports")
    .select("id, period_start, period_end, health, summary, highlights, next_steps, decisions_needed, metrics, author_id, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`Failed to load status reports: ${error.message}`);
  return data ?? [];
}
