import type { Metadata } from "next";
import Link from "next/link";

import { AccessDenied, EmptyState } from "@/components/common/states";
import { BurndownChart, VelocityChart } from "@/components/work/sprint-charts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgContext } from "@/lib/auth/org-context";
import { getSprintStats, listSprints, listWorkItems } from "@/lib/data/work";
import { addDaysToDate, todayInTimeZone } from "@/lib/domain/time";
import { averageVelocity, buildBurndown, commitmentReliability } from "@/lib/domain/work";
import { formatDate } from "@/lib/format";

import { CompleteSprintDialog, DeleteSprintButton, SprintDialog, StartSprintButton } from "./sprint-controls";

export const metadata: Metadata = { title: "Sprints" };

export default async function SprintsPage({ params }: PageProps<"/projects/[projectId]/sprints">) {
  const { projectId } = await params;
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("work.read")) return <AccessDenied what="sprints" />;
  const canManage = ctx.permissions.has("sprint.manage");
  const [sprints, items] = await Promise.all([listSprints(projectId), listWorkItems(ctx, projectId)]);
  const today = todayInTimeZone(new Date(), ctx.settings.timezone);

  const active = sprints.find((s) => s.state === "active") ?? null;
  const planned = sprints.filter((s) => s.state === "planned").sort((a, b) => a.start_date.localeCompare(b.start_date));
  const completed = sprints.filter((s) => s.state === "completed").sort((a, b) => a.start_date.localeCompare(b.start_date));
  const velocity = averageVelocity(completed.map((s) => ({ completed_points: s.completed_points === null ? null : Number(s.completed_points), completed_at: s.completed_at })));
  const stats = active ? await getSprintStats(active.id) : [];
  const burndown = active ? buildBurndown({ ...active, committed_points: active.committed_points === null ? null : Number(active.committed_points) }, stats, today) : [];

  const inSprint = (id: string) => items.filter((i) => i.sprint_id === id);
  const points = (list: typeof items) => list.reduce((s, i) => s + Number(i.story_points ?? 0), 0);
  const activeItems = active ? inSprint(active.id) : [];
  const done = activeItems.filter((i) => i.state?.category === "done");
  const latestEnd = sprints.map((s) => s.end_date).sort().at(-1);
  const nextStart = latestEnd && latestEnd >= today ? addDaysToDate(latestEnd, 1) : today;
  const suggested = { name: `Sprint ${sprints.length + 1}`, goal: "", startDate: nextStart, endDate: addDaysToDate(nextStart, 13) };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Average velocity (last 3 completed sprints): <strong className="text-foreground">{velocity ?? "—"}</strong>
          {velocity !== null && " points"}
        </p>
        {canManage && <SprintDialog projectId={projectId} suggested={suggested} />}
      </div>

      {active ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2">
                {active.name} <Badge>Active</Badge>
              </CardTitle>
              <CardDescription>
                {formatDate(active.start_date)} – {formatDate(active.end_date)}
                {active.goal && <span className="block">Goal: {active.goal}</span>}
              </CardDescription>
            </div>
            {canManage && (
              <CompleteSprintDialog
                projectId={projectId}
                sprintId={active.id}
                unfinished={activeItems.length - done.length}
                targets={planned.map((s) => ({ id: s.id, name: s.name }))}
              />
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
              {[
                ["Committed", `${Number(active.committed_points ?? 0)} pts`],
                ["Current scope", `${points(activeItems)} pts`],
                ["Done", `${points(done)} pts`],
                ["Items done", `${done.length} / ${activeItems.length}`],
                ["Days left", `${Math.max(0, Math.round((Date.parse(active.end_date) - Date.parse(today)) / 86_400_000))}`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border p-3">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            <BurndownChart
              points={burndown}
              ariaLabel={`Burndown for ${active.name}: ${points(activeItems) - points(done)} of ${points(activeItems)} points remaining.`}
            />
            <p className="text-xs text-muted-foreground">
              Recorded daily from changes to sprint items (in {ctx.settings.timezone}). Days without changes carry the previous value.{" "}
              <Link href={`/projects/${projectId}/board`} className="text-primary hover:underline">
                Open the board
              </Link>
            </p>
          </CardContent>
        </Card>
      ) : (
        <EmptyState title="No active sprint" description={planned.length ? "Start a planned sprint below." : "Plan a sprint, add items from the backlog, then start it."} />
      )}

      <Card className="pb-0">
        <CardHeader>
          <CardTitle>Planned sprints</CardTitle>
          <CardDescription>Compare planned points with average velocity before starting.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {planned.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">None.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Sprint</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                  {canManage && <TableHead className="pr-6 text-right"><span className="sr-only">Actions</span></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {planned.map((s) => {
                  const list = inSprint(s.id);
                  const over = velocity !== null && points(list) > velocity * 1.15;
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="pl-6">
                        <div className="font-medium">{s.name}</div>
                        {s.goal && <div className="text-xs text-muted-foreground">{s.goal}</div>}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatDate(s.start_date)} – {formatDate(s.end_date)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{list.length}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className={over ? "font-medium text-health-amber" : undefined}>{points(list)}</span>
                        {over && <span className="block text-xs text-health-amber">Above average velocity</span>}
                      </TableCell>
                      {canManage && (
                        <TableCell className="pr-6">
                          <div className="flex items-center justify-end gap-1">
                            <StartSprintButton projectId={projectId} sprintId={s.id} disabledReason={active ? "Complete the active sprint first." : undefined} />
                            <SprintDialog projectId={projectId} sprint={{ id: s.id, name: s.name, goal: s.goal ?? "", startDate: s.start_date, endDate: s.end_date }} />
                            <DeleteSprintButton projectId={projectId} sprintId={s.id} name={s.name} />
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="pb-0">
        <CardHeader>
          <CardTitle>Velocity</CardTitle>
          <CardDescription>Committed (at sprint start) versus completed (at sprint end) points.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-0">
          {completed.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">No completed sprints yet.</p>
          ) : (
            <>
              <div className="px-6">
                <VelocityChart
                  ariaLabel={`Velocity over ${completed.length} sprints: ${completed.map((s) => `${s.name} ${Number(s.completed_points ?? 0)} of ${Number(s.committed_points ?? 0)}`).join(", ")}.`}
                  sprints={completed.map((s) => ({ name: s.name, committed: Number(s.committed_points ?? 0), completed: Number(s.completed_points ?? 0) }))}
                />
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Sprint</TableHead>
                    <TableHead className="text-right">Committed</TableHead>
                    <TableHead className="text-right">Completed</TableHead>
                    <TableHead className="pr-6 text-right">Reliability</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...completed].reverse().map((s) => {
                    const r = commitmentReliability(s.committed_points === null ? null : Number(s.committed_points), s.completed_points === null ? null : Number(s.completed_points));
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="pl-6">
                          {s.name} <span className="text-xs text-muted-foreground">({formatDate(s.start_date)} – {formatDate(s.end_date)})</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{Number(s.committed_points ?? 0)}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(s.completed_points ?? 0)}</TableCell>
                        <TableCell className="pr-6 text-right tabular-nums">{r === null ? "—" : `${r}%`}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
