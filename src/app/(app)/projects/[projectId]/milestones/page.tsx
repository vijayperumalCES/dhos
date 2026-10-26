import type { Metadata } from "next";

import { MilestoneStatusBadge, VarianceLabel } from "@/components/common/milestone-badge";
import { EmptyState } from "@/components/common/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgContext } from "@/lib/auth/org-context";
import { listBaselines, listMilestones } from "@/lib/data/milestones";
import { loadProjectFormOptions } from "@/lib/data/options";
import { resolveUserNames } from "@/lib/data/projects";
import { todayInTimeZone } from "@/lib/domain/time";
import { milestoneStatus } from "@/lib/domain/work";
import { formatDate, formatDateTime, personName } from "@/lib/format";
import { NONE } from "@/lib/validation/common";

import { BaselineDialog, MilestoneActions, MilestoneDialog } from "./milestone-controls";

export const metadata: Metadata = { title: "Milestones" };

export default async function MilestonesPage({ params }: PageProps<"/projects/[projectId]/milestones">) {
  const { projectId } = await params;
  const ctx = await requireOrgContext();
  const canManage = ctx.permissions.has("milestone.manage");
  const [milestones, baselines, options] = await Promise.all([
    listMilestones(projectId),
    listBaselines(projectId),
    canManage ? loadProjectFormOptions(ctx) : Promise.resolve({ members: [] }),
  ]);
  const names = await resolveUserNames(baselines.map((b) => b.created_by));
  const today = todayInTimeZone(new Date(), ctx.settings.timezone);
  const rows = milestones.map((m) => ({ ...m, status: milestoneStatus(m, today) }));
  const slipped = rows.filter((m) => m.baseline_due_date && m.due_date > m.baseline_due_date && !m.completed_on).length;

  return (
    <div className="space-y-6">
      <Card className="pb-0">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Milestones</CardTitle>
            <CardDescription>
              {rows.filter((m) => m.status === "overdue").length} overdue · {slipped} slipped against baseline · today is{" "}
              {formatDate(today)} ({ctx.settings.timezone})
            </CardDescription>
          </div>
          {canManage && (
            <div className="flex gap-2">
              <BaselineDialog projectId={projectId} />
              <MilestoneDialog projectId={projectId} members={options.members} />
            </div>
          )}
        </CardHeader>
        <CardContent className="px-0">
          {rows.length === 0 ? (
            <EmptyState className="mx-6 mb-6" title="No milestones yet" description="Milestones mark the commitments this project is measured against." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Milestone</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="hidden md:table-cell">Baseline</TableHead>
                  <TableHead>Variance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Owner</TableHead>
                  {canManage && <TableHead className="w-12 pr-6"><span className="sr-only">Actions</span></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="pl-6">
                      <div className="font-medium">{m.name}</div>
                      {m.description && <div className="text-xs text-muted-foreground">{m.description}</div>}
                      {m.completed_on && <div className="text-xs text-muted-foreground">Achieved {formatDate(m.completed_on)}</div>}
                    </TableCell>
                    <TableCell className="tabular-nums">{formatDate(m.due_date)}</TableCell>
                    <TableCell className="hidden tabular-nums md:table-cell">{formatDate(m.baseline_due_date)}</TableCell>
                    <TableCell>
                      <VarianceLabel milestone={m} />
                    </TableCell>
                    <TableCell>
                      <MilestoneStatusBadge status={m.status} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{personName(m.owner)}</TableCell>
                    {canManage && (
                      <TableCell className="pr-6">
                        <MilestoneActions
                          projectId={projectId}
                          members={options.members}
                          today={today}
                          milestone={{
                            id: m.id,
                            completed_on: m.completed_on,
                            name: m.name,
                            description: m.description ?? "",
                            dueDate: m.due_date,
                            ownerId: m.owner_membership_id ?? NONE,
                          }}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Baseline history</CardTitle>
          <CardDescription>Each baseline is an immutable snapshot of the plan at that moment.</CardDescription>
        </CardHeader>
        <CardContent>
          {baselines.length === 0 ? (
            <p className="text-sm text-muted-foreground">No baselines yet. Take one once the plan is agreed.</p>
          ) : (
            <ul className="divide-y text-sm">
              {baselines.map((b) => {
                const snap = b.snapshot as { target_end_date?: string | null; milestones?: unknown[] };
                return (
                  <li key={b.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>
                      <span className="font-medium">{b.name}</span>{" "}
                      <span className="text-muted-foreground">
                        · {snap.milestones?.length ?? 0} milestones · target end {formatDate(snap.target_end_date ?? null)}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(b.created_at, ctx.settings.timezone)} · {b.created_by ? (names.get(b.created_by) ?? "a user") : "system"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
