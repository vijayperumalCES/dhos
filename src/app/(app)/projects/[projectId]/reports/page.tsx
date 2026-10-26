import type { Metadata } from "next";

import { HealthBadge } from "@/components/common/badges";
import { EmptyState } from "@/components/common/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/auth/org-context";
import { getProject, resolveUserNames } from "@/lib/data/projects";
import { listStatusReports } from "@/lib/data/status-report";
import { reportToMarkdown, type ReportForMarkdown } from "@/lib/domain/report-markdown";
import { addDaysToDate, todayInTimeZone } from "@/lib/domain/time";
import { formatDate, formatDateTime } from "@/lib/format";

import { CopyMarkdownButton, NewReportForm } from "./report-controls";

export const metadata: Metadata = { title: "Status reports" };

export default async function StatusReportsPage({ params }: PageProps<"/projects/[projectId]/reports">) {
  const { projectId } = await params;
  const ctx = await requireOrgContext();
  const [project, reports] = await Promise.all([getProject(ctx, projectId), listStatusReports(projectId)]);
  if (!project) return null;
  const names = await resolveUserNames(reports.map((r) => r.author_id));
  const today = todayInTimeZone(new Date(), ctx.settings.timezone);
  const lastEnd = reports[0]?.period_end;
  const periodStart = lastEnd && lastEnd < today ? addDaysToDate(lastEnd, 1) : addDaysToDate(today, -6);

  return (
    <div className="space-y-6">
      {ctx.permissions.has("project.change_status") && <NewReportForm projectId={projectId} periodStart={periodStart} periodEnd={today} />}
      {reports.length === 0 ? (
        <EmptyState title="No status reports yet" description="Reports record what was said about the project, with the evidence behind it, at a point in time." />
      ) : (
        reports.map((r) => {
          const metrics = r.metrics as ReportForMarkdown["metrics"];
          const markdown = reportToMarkdown({
            projectCode: project.code,
            projectName: project.name,
            periodStart: r.period_start,
            periodEnd: r.period_end,
            health: r.health,
            summary: r.summary,
            highlights: r.highlights,
            nextSteps: r.next_steps,
            decisionsNeeded: r.decisions_needed,
            metrics,
          });
          const m = metrics.milestones;
          return (
            <Card key={r.id}>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <CardTitle className="flex items-center gap-2">
                    {formatDate(r.period_start)} – {formatDate(r.period_end)} <HealthBadge health={r.health} />
                  </CardTitle>
                  <CardDescription>
                    Published {formatDateTime(r.created_at, ctx.settings.timezone)} by {r.author_id ? (names.get(r.author_id) ?? "a user") : "system"}
                  </CardDescription>
                </div>
                <CopyMarkdownButton markdown={markdown} />
              </CardHeader>
              <CardContent className="grid gap-6 text-sm lg:grid-cols-[1fr_18rem]">
                <div className="space-y-3">
                  <p className="whitespace-pre-wrap">{r.summary}</p>
                  {[
                    ["Highlights", r.highlights],
                    ["Next steps", r.next_steps],
                    ["Decisions needed", r.decisions_needed],
                  ]
                    .filter(([, v]) => v)
                    .map(([label, v]) => (
                      <div key={label}>
                        <p className="font-medium">{label}</p>
                        <p className="whitespace-pre-wrap text-muted-foreground">{v}</p>
                      </div>
                    ))}
                </div>
                <dl className="space-y-2 rounded-lg border p-3 text-xs">
                  <p className="font-medium">Evidence at publication</p>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Overdue milestones</dt>
                    <dd className="tabular-nums">{m?.overdue?.length ?? 0}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Due in 14 days</dt>
                    <dd className="tabular-nums">{m?.dueNext14Days?.length ?? 0}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Slipped vs baseline</dt>
                    <dd className="tabular-nums">{m?.slipped?.length ?? 0}</dd>
                  </div>
                  {metrics.sprint && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">{metrics.sprint.name}</dt>
                      <dd className="tabular-nums">
                        {metrics.sprint.donePoints}/{metrics.sprint.scopePoints} pts
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Items completed</dt>
                    <dd className="tabular-nums">{metrics.completedItems ?? 0}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Blocked items</dt>
                    <dd className="tabular-nums">{metrics.blockedItems ?? 0}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
