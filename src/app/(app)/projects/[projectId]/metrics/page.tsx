import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgContext } from "@/lib/auth/org-context";
import { canEnterMetrics, getPeriodMetrics, getReportSettings, getWeek, listReportRuns } from "@/lib/data/metrics";
import { formatMetricValue, formatPeriod, isMonday, lastCompletePeriods, METRIC_GROUPS, METRICS, weekStartOf, type MetricValue } from "@/lib/domain/delivery-metrics";
import { addDaysToDate, todayInTimeZone } from "@/lib/domain/time";
import { formatDateTime } from "@/lib/format";

import { MetricsForm } from "./metrics-form";
import { ReportSettingsForm } from "./report-settings-form";

export const metadata: Metadata = { title: "Delivery metrics" };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function monthRange(month: string) {
  const start = `${month}-01`;
  const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)).toISOString().slice(0, 10);
  return { start, end: addDaysToDate(next, -1) };
}

function shiftMonth(month: string, by: number) {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

function SourceBadge({ source }: { source: MetricValue["source"] }) {
  if (source === "auto") return <Badge variant="secondary">From Stride</Badge>;
  if (source === "computed") return <Badge variant="outline">Worked out</Badge>;
  if (source === "manual") return <Badge variant="outline">Entered</Badge>;
  return null;
}

function MetricsTable({ values }: { values: MetricValue[] }) {
  const byKey = new Map(values.map((v) => [v.key, v]));
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Metric</TableHead>
          <TableHead className="w-32 text-right">Value</TableHead>
          <TableHead className="w-32">Source</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {METRIC_GROUPS.map((group) => (
          <Fragment key={group}>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableCell colSpan={3} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {group}
              </TableCell>
            </TableRow>
            {METRICS.filter((d) => d.group === group).map((d) => {
              const v = byKey.get(d.key);
              return (
                <TableRow key={d.key}>
                  <TableCell>{d.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMetricValue(d, v?.value ?? null)}</TableCell>
                  <TableCell>
                    <SourceBadge source={v?.source ?? null} />
                  </TableCell>
                </TableRow>
              );
            })}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  );
}

const STATUS_LABEL: Record<string, string> = { pending: "Waiting to send", sent: "Sent", simulated: "Not sent (no mail provider)", failed: "Failed" };

export default async function MetricsPage({ params, searchParams }: PageProps<"/projects/[projectId]/metrics">) {
  const { projectId } = await params;
  const sp = await searchParams;
  const ctx = await requireOrgContext();
  const canPublish = ctx.permissions.has("project.change_status");
  const canEnter = await canEnterMetrics(projectId);
  const today = todayInTimeZone(new Date(), ctx.settings.timezone);
  const last = lastCompletePeriods(today);

  const view = sp.view === "month" ? "month" : "week";
  const weekParam = typeof sp.week === "string" && isMonday(sp.week) ? sp.week : last.weekly.start;
  const week = weekParam > weekStartOf(today) ? weekStartOf(today) : weekParam;
  const monthParam = typeof sp.month === "string" && MONTH.test(sp.month) ? sp.month : last.monthly.start.slice(0, 7);
  const month = monthParam > today.slice(0, 7) ? today.slice(0, 7) : monthParam;
  const range = monthRange(month);

  const [weekData, monthValues, settings, runs] = await Promise.all([
    view === "week" ? getWeek(projectId, week) : null,
    view === "month" ? getPeriodMetrics(projectId, range.start, range.end) : null,
    canPublish ? getReportSettings(projectId) : null,
    canPublish ? listReportRuns(projectId) : [],
  ]);

  const base = `/projects/${projectId}/metrics`;
  const nav = "text-sm text-primary hover:underline";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border p-1 text-sm">
          <Link href={`${base}?week=${week}`} className={`rounded-md px-3 py-1 ${view === "week" ? "bg-muted font-medium" : "text-muted-foreground"}`}>
            Week
          </Link>
          <Link href={`${base}?view=month&month=${month}`} className={`rounded-md px-3 py-1 ${view === "month" ? "bg-muted font-medium" : "text-muted-foreground"}`}>
            Month
          </Link>
        </div>
        {view === "week" ? (
          <div className="flex items-center gap-4">
            <Link className={nav} href={`${base}?week=${addDaysToDate(week, -7)}`}>
              ← Previous
            </Link>
            <span className="text-sm font-medium">{formatPeriod(week, addDaysToDate(week, 6))}</span>
            {addDaysToDate(week, 7) <= weekStartOf(today) ? (
              <Link className={nav} href={`${base}?week=${addDaysToDate(week, 7)}`}>
                Next →
              </Link>
            ) : (
              <span className="text-sm text-muted-foreground">Next →</span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <Link className={nav} href={`${base}?view=month&month=${shiftMonth(month, -1)}`}>
              ← Previous
            </Link>
            <span className="text-sm font-medium">{formatPeriod(range.start, range.end)}</span>
            {month < today.slice(0, 7) ? (
              <Link className={nav} href={`${base}?view=month&month=${shiftMonth(month, 1)}`}>
                Next →
              </Link>
            ) : (
              <span className="text-sm text-muted-foreground">Next →</span>
            )}
          </div>
        )}
      </div>

      {view === "week" && weekData && (
        <>
          <p className="text-sm text-muted-foreground">
            {canEnter
              ? "Enter what you know for the week. Fields left blank use the figure Stride works out from its own records, shown as a hint where there is one."
              : "Figures for the week. Entered values are shown with those Stride works out itself."}
          </p>
          {canEnter ? (
            <MetricsForm key={week} projectId={projectId} week={week} manual={weekData.manual} values={weekData.values} />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <MetricsTable values={weekData.values} />
              </CardContent>
            </Card>
          )}
        </>
      )}

      {view === "month" && monthValues && (
        <Card>
          <CardHeader>
            <CardTitle>Month at a glance</CardTitle>
            <CardDescription>Counts add up across the weeks, percentages are averaged, and quarterly scores and open items take the latest week.</CardDescription>
          </CardHeader>
          <CardContent>
            <MetricsTable values={monthValues} />
          </CardContent>
        </Card>
      )}

      {canPublish && settings && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Email reports</CardTitle>
              <CardDescription>
                Stride emails the last complete week every Monday and the last complete month on the 1st, to the people below. Nothing is sent until you add
                recipients and switch a report on. Projects that are not planning, active or on hold are skipped.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReportSettingsForm initial={settings} projectId={projectId} />
            </CardContent>
          </Card>

          {runs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Sent reports</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Report</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Delivered to</TableHead>
                      <TableHead>Generated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="capitalize">{r.kind}</TableCell>
                        <TableCell>{formatPeriod(r.period_start, r.period_end)}</TableCell>
                        <TableCell>
                          {STATUS_LABEL[r.status] ?? r.status}
                          {r.status === "failed" && r.last_error ? <span className="block text-xs text-muted-foreground">{r.last_error}</span> : null}
                        </TableCell>
                        <TableCell>
                          {r.delivered_to.length} of {r.recipients.length}
                        </TableCell>
                        <TableCell>{formatDateTime(r.created_at, ctx.settings.timezone)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
