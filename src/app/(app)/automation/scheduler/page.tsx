import type { Metadata } from "next";

import { RunResultBadge, EnabledBadge } from "@/components/automation/badges";
import { JobRowActions, RunSchedulerButton } from "@/components/automation/scheduler-controls";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgContext } from "@/lib/auth/org-context";
import { JOB_INFO } from "@/lib/automation/jobs";
import { getScheduler } from "@/lib/data/automation";
import { formatDateTime, formatRelative } from "@/lib/format";

export const metadata: Metadata = { title: "Scheduler" };

export default async function SchedulerPage() {
  const ctx = await requireOrgContext();
  const canManage = ctx.permissions.has("automation.manage");
  const { jobs, runs, heartbeat, stale } = await getScheduler(ctx);
  const tz = ctx.settings.timezone;

  return (
    <div className="space-y-6">
      <Alert variant={stale ? "destructive" : "default"}>
        <AlertTitle>{heartbeat ? (stale ? "The scheduler has not ticked recently" : "The scheduler is running") : "The scheduler has never run"}</AlertTitle>
        <AlertDescription>
          {heartbeat ? `Last tick ${formatRelative(heartbeat.last_tick_at)}.` : "Nothing will be delivered, reminded or synced until it does."} A tick is a request to <code>/api/cron/tick</code> carrying the platform&apos;s cron secret; see the deployment guide for how to schedule it.
          {canManage && (
            <span className="mt-2 block">
              <RunSchedulerButton />
            </span>
          )}
        </AlertDescription>
      </Alert>
      <Card>
        <CardHeader>
          <CardTitle>Scheduled jobs</CardTitle>
          <CardDescription>Jobs for this organization. Each runs at most once per interval, whenever a tick finds it due.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Every</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead>Next run</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((j) => {
                const info = JOB_INFO[j.key] ?? { name: j.key, description: "" };
                return (
                  <TableRow key={j.id}>
                    <TableCell>
                      <div className="font-medium">{info.name}</div>
                      <div className="max-w-sm text-xs text-muted-foreground">{info.description}</div>
                    </TableCell>
                    <TableCell className="tabular-nums">{j.interval_minutes >= 1440 && j.interval_minutes % 1440 === 0 ? `${j.interval_minutes / 1440} d` : j.interval_minutes >= 60 && j.interval_minutes % 60 === 0 ? `${j.interval_minutes / 60} h` : `${j.interval_minutes} min`}</TableCell>
                    <TableCell>
                      <EnabledBadge enabled={j.enabled} offLabel="Paused" />
                    </TableCell>
                    <TableCell>
                      <RunResultBadge status={j.last_status} />
                      <div className="text-xs text-muted-foreground">{formatRelative(j.last_run_at)}</div>
                      {j.last_error && <div className="max-w-48 text-xs text-destructive">{j.last_error}</div>}
                    </TableCell>
                    <TableCell className="text-sm">{j.enabled ? formatDateTime(j.next_run_at, tz) : "—"}</TableCell>
                    <TableCell>{canManage && <JobRowActions job={j} label={info.name} />}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No job has run yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Summary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{formatDateTime(r.created_at, tz)}</TableCell>
                    <TableCell>{JOB_INFO[r.job_key]?.name ?? r.job_key}</TableCell>
                    <TableCell>
                      <RunResultBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.error ?? Object.entries((r.summary ?? {}) as Record<string, unknown>).map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
