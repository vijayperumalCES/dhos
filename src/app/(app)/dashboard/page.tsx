import { Bot, CalendarClock, Clock3, OctagonAlert, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { HorizontalBars } from "@/components/dashboard/charts";
import { KpiInfo, KpiTile } from "@/components/dashboard/kpi-tile";
import { HealthBadge, StatusBadge } from "@/components/common/badges";
import { FilterBar } from "@/components/common/filter-bar";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/auth/org-context";
import { getDashboardData } from "@/lib/data/dashboard";
import { loadProjectFormOptions } from "@/lib/data/options";
import { KPI_CATALOGUE, parseReportingPeriod, REPORTING_PERIODS } from "@/lib/domain/kpis";
import { HEALTH_LABELS, PROJECT_STATUSES, STATUS_LABELS } from "@/lib/domain/project-lifecycle";
import { formatDate, formatDateTime, formatRelative, personName } from "@/lib/format";
import { uuid } from "@/lib/validation/common";

export const metadata: Metadata = { title: "Command Center" };

const NOT_YET_MEASURED = [
  { name: "Milestones due / overdue", phase: 2 },
  { name: "Sprint commitment vs completion", phase: 2 },
  { name: "Blocked or overdue work items", phase: 2 },
  { name: "Attendance and available capacity", phase: 3 },
  { name: "Resource allocation and utilisation", phase: 3 },
  { name: "Open critical risks and escalations", phase: 4 },
  { name: "Defect trends and release readiness", phase: 4 },
  { name: "Client satisfaction", phase: 4 },
  { name: "Pending decisions and approvals", phase: 4 },
  { name: "Budget variance and forecast", phase: 5 },
];

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("dashboard.portfolio.view")) {
    redirect(ctx.permissions.canReadProjects ? "/projects" : "/account");
  }

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const period = parseReportingPeriod(one(sp.period));
  const pick = (v: string | undefined) => (v && uuid.safeParse(v).success ? v : undefined);
  const filters = { client: pick(one(sp.client)), manager: pick(one(sp.manager)), team: pick(one(sp.team)) };

  const [data, options] = await Promise.all([getDashboardData(ctx, period, filters), loadProjectFormOptions(ctx)]);
  const { kpis } = data;
  const scope = ctx.permissions.has("project.read_all") ? "all projects in the organization" : "the projects assigned to you";

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Delivery Command Center"
        description={`Live view of ${scope}. Every figure is computed from records in DHOS — open the ⓘ next to a metric for its definition.`}
        meta={
          <span className="text-xs text-muted-foreground">
            Generated {formatDateTime(data.generatedAt)} · health considered stale after {ctx.settings.healthStaleAfterDays} days
          </span>
        }
      />

      <FilterBar
        filters={[
          {
            key: "period",
            label: "Reporting period",
            allLabel: "Last 30 days",
            options: REPORTING_PERIODS.filter((p) => p !== 30).map((p) => ({ value: String(p), label: `Last ${p} days` })),
          },
          ...(options.clients.length ? [{ key: "client", label: "Clients", options: options.clients }] : []),
          ...(options.members.length ? [{ key: "manager", label: "Managers", options: options.members }] : []),
          ...(options.teams.length ? [{ key: "team", label: "Teams", options: options.teams }] : []),
        ]}
      />

      {data.projectCount === 0 ? (
        <EmptyState
          title="No projects to report on"
          description="Once projects exist (or match these filters), their health, lifecycle and schedule metrics appear here."
          action={
            ctx.permissions.has("project.create") && (
              <Button asChild>
                <Link href="/projects/new">Create a project</Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-6">
          <section aria-label="Headline metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile kpi={KPI_CATALOGUE.in_flight_projects} value={kpis.in_flight_projects} hint={`${kpis.active_projects} active`} />
            <KpiTile kpi={KPI_CATALOGUE.projects_at_risk} value={kpis.projects_at_risk} hint={`${kpis.health_distribution.red} red · ${kpis.health_distribution.amber} amber`} tone="critical" />
            <KpiTile kpi={KPI_CATALOGUE.overdue_target_end} value={kpis.overdue_target_end} hint={`${kpis.due_next_30_days} more due in the next 30 days`} tone="critical" />
            <KpiTile kpi={KPI_CATALOGUE.stale_health} value={kpis.stale_health} tone="warning" />
          </section>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div className="space-y-1.5">
                  <CardTitle>Needs attention</CardTitle>
                  <CardDescription>In-flight projects that are Red, Amber, past their target end, or carry a stale rating.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {data.attention.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing needs attention right now.</p>
                ) : (
                  <ul className="divide-y">
                    {data.attention.map((p) => (
                      <li key={p.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <Link href={`/projects/${p.id}`} className="font-medium hover:underline">
                            <span className="mr-1.5 font-mono text-xs text-muted-foreground">{p.code}</span>
                            {p.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {p.client?.name ?? "Internal"} · {personName(p.manager)}
                          </p>
                          {p.health_reason && (p.flags.red || p.flags.amber) && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.health_reason}</p>}
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-1.5 sm:justify-end">
                          <HealthBadge health={p.health} />
                          {p.flags.overdue && (
                            <Badge variant="outline" className="gap-1">
                              <OctagonAlert className="size-3 text-health-red" aria-hidden /> Past target {formatDate(p.target_end_date)}
                            </Badge>
                          )}
                          {p.flags.stale && (
                            <Badge variant="outline" className="gap-1 text-muted-foreground">
                              <Clock3 className="size-3" aria-hidden />
                              {p.health === "not_assessed" ? "Never assessed" : `Rated ${formatRelative(p.health_updated_at)}`}
                            </Badge>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div className="space-y-1.5">
                  <CardTitle>Health of in-flight projects</CardTitle>
                  <CardDescription>{kpis.in_flight_projects} projects in planning, active or on hold</CardDescription>
                </div>
                <KpiInfo kpi={KPI_CATALOGUE.health_distribution} />
              </CardHeader>
              <CardContent>
                <HorizontalBars
                  ariaLabel={`Health distribution: ${(["red", "amber", "green", "not_assessed"] as const).map((h) => `${HEALTH_LABELS[h]} ${kpis.health_distribution[h]}`).join(", ")}`}
                  data={(["red", "amber", "green", "not_assessed"] as const).map((h) => ({ key: h, label: HEALTH_LABELS[h], value: kpis.health_distribution[h] }))}
                  colors={{ red: "var(--health-red)", amber: "var(--health-amber)", green: "var(--health-green)", not_assessed: "var(--health-none)" }}
                />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div className="space-y-1.5">
                  <CardTitle>Portfolio by lifecycle stage</CardTitle>
                  <CardDescription>{data.projectCount} non-archived projects</CardDescription>
                </div>
                <KpiInfo kpi={KPI_CATALOGUE.lifecycle_distribution} />
              </CardHeader>
              <CardContent>
                <HorizontalBars
                  ariaLabel={`Projects by stage: ${PROJECT_STATUSES.map((s) => `${STATUS_LABELS[s]} ${kpis.lifecycle_distribution[s]}`).join(", ")}`}
                  data={PROJECT_STATUSES.map((s) => ({ key: s, label: STATUS_LABELS[s], value: kpis.lifecycle_distribution[s] }))}
                />
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div className="space-y-1.5">
                  <CardTitle>Changes in the last {period} days</CardTitle>
                  <CardDescription>
                    {kpis.status_changes} lifecycle or health changes · {kpis.health_deteriorations} deteriorations
                  </CardDescription>
                </div>
                <KpiInfo kpi={KPI_CATALOGUE.status_changes} />
              </CardHeader>
              <CardContent>
                {data.recentChanges.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No status or health changes in this period.</p>
                ) : (
                  <ul className="space-y-2.5 text-sm">
                    {data.recentChanges.map((h) => (
                      <li key={h.id} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link href={`/projects/${h.project_id}`} className="font-medium hover:underline">
                            {h.project?.code ?? "Project"}
                          </Link>{" "}
                          {h.change_type === "status" ? (
                            <span className="inline-flex flex-wrap items-center gap-1 align-middle">
                              <StatusBadge status={h.from_status!} /> → <StatusBadge status={h.to_status!} />
                            </span>
                          ) : (
                            <span className="inline-flex flex-wrap items-center gap-1 align-middle">
                              <HealthBadge health={h.from_health!} /> → <HealthBadge health={h.to_health!} />
                            </span>
                          )}
                          {h.reason && <p className="truncate text-xs text-muted-foreground">{h.reason}</p>}
                        </div>
                        <time className="shrink-0 text-xs text-muted-foreground" dateTime={h.changed_at}>
                          {formatRelative(h.changed_at)}
                        </time>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="size-4" /> Organization
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-2xl font-semibold tabular-nums">{data.teamCount ?? "—"}</p>
              <p className="text-muted-foreground">Active teams</p>
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums">{data.memberCount ?? "—"}</p>
              <p className="text-muted-foreground">Active members</p>
            </div>
            <p className="col-span-2 text-xs text-muted-foreground">Headcount only. Capacity and availability arrive in Phase 3.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TriangleAlert className="size-4" /> Not yet measured
            </CardTitle>
            <CardDescription>These Command Center metrics need modules that are not built yet, so no value is shown.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {NOT_YET_MEASURED.map((m) => (
                <li key={m.name} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{m.name}</span>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    Phase {m.phase}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="size-4" /> AI daily delivery brief
            </CardTitle>
            <CardDescription>Not available</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            AI agents are not implemented. The daily brief will be produced by the Reporting Agent in Phase 6, using only
            data you are authorised to see, with sources cited and human approval for any action it recommends.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
