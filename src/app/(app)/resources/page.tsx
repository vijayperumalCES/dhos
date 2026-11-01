import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/common/page-header";
import { AccessDenied, EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CapacityBadge } from "@/components/workforce/badges";
import { requireOrgContext } from "@/lib/auth/org-context";
import { defaultPlanningRange, getCapacityOverview, getPeople, listAllocations, listLoggableWork, personLabel } from "@/lib/data/workforce";
import { addDaysToDate, todayInTimeZone } from "@/lib/domain/time";
import { allocationRatio, capacityStatus, formatHours, formatPercent, utilisationRatio } from "@/lib/domain/workforce";
import { formatDate } from "@/lib/format";
import { rangeSchema } from "@/lib/validation/workforce";

import { AllocationActions, AllocationDialog } from "./allocation-controls";

export const metadata: Metadata = { title: "Resource planning" };

const MAX_RANGE_DAYS = 184;

export default async function ResourcesPage({ searchParams }: PageProps<"/resources">) {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("resource.read")) return <AccessDenied what="resource planning" />;

  const sp = await searchParams;
  const today = todayInTimeZone(new Date(), ctx.settings.timezone);
  const fallback = defaultPlanningRange(today);
  const parsed = rangeSchema.safeParse({ from: sp.from, to: sp.to });
  let range = parsed.success ? parsed.data : fallback;
  if (addDaysToDate(range.from, MAX_RANGE_DAYS - 1) < range.to) range = { from: range.from, to: addDaysToDate(range.from, MAX_RANGE_DAYS - 1) };

  const canManage = ctx.permissions.has("resource.manage");
  const [people, capacity, allocations, work] = await Promise.all([
    getPeople(ctx),
    getCapacityOverview(ctx, range.from, range.to),
    listAllocations(ctx, range),
    canManage ? listLoggableWork(ctx) : Promise.resolve({ projects: [], workItems: [] }),
  ]);
  const rows = capacity
    .map((c) => ({ ...c, status: capacityStatus(c), name: personLabel(people, c.membership_id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const over = rows.filter((r) => r.status === "over").length;
  const bench = rows.filter((r) => r.status === "bench").length;
  const totals = rows.reduce(
    (t, r) => ({ capacity: t.capacity + r.capacity_hours, allocated: t.allocated + r.allocated_hours, logged: t.logged + r.logged_hours }),
    { capacity: 0, allocated: 0, logged: 0 },
  );
  const memberOptions = rows.map((r) => ({ value: r.membership_id, label: r.name }));
  const projectOptions = work.projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }));
  const presets = [
    { label: "Next 8 weeks", ...fallback },
    { label: "Next quarter", from: today, to: addDaysToDate(today, 90) },
    { label: "Last 4 weeks", from: addDaysToDate(today, -27), to: today },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Resource planning"
        description="Capacity comes from each person's calendar minus holidays and approved leave. Allocations are dated; utilisation counts submitted project time."
        actions={canManage && <AllocationDialog members={memberOptions} projects={projectOptions} defaultRange={range} />}
      />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">
          {formatDate(range.from)} – {formatDate(range.to)}
        </span>
        {presets.map((p) => (
          <Button key={p.label} asChild size="sm" variant={p.from === range.from && p.to === range.to ? "secondary" : "ghost"}>
            <Link href={`/resources?from=${p.from}&to=${p.to}`}>{p.label}</Link>
          </Button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: "Capacity", value: formatHours(totals.capacity) },
          { label: "Allocated", value: formatPercent(totals.capacity ? totals.allocated / totals.capacity : null) },
          { label: "Over-allocated", value: String(over) },
          { label: "Unallocated", value: String(bench) },
        ].map((k) => (
          <Card key={k.label} className="gap-1 py-4">
            <CardContent className="px-4">
              <p className="text-2xl font-semibold tabular-nums">{k.value}</p>
              <p className="text-sm text-muted-foreground">{k.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="pb-0">
        <CardHeader>
          <CardTitle>Capacity and utilisation</CardTitle>
          <CardDescription>
            Over-allocation is judged on the busiest day in the range, so a short overlap still shows. Attendance is not used here.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {rows.length === 0 ? (
            <EmptyState className="mx-6 mb-6" title="No people to plan" description="Members who log time appear here." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Person</TableHead>
                  <TableHead className="text-right">Working days</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Leave</TableHead>
                  <TableHead className="text-right">Capacity</TableHead>
                  <TableHead className="text-right">Allocated</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Peak</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Utilisation</TableHead>
                  <TableHead className="pr-6">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.membership_id}>
                    <TableCell className="pl-6 font-medium">{r.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.working_days}
                      {r.holiday_days > 0 && <span className="text-xs text-muted-foreground"> (−{r.holiday_days} hol.)</span>}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{r.leave_days || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatHours(r.capacity_hours)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPercent(allocationRatio(r))}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{r.peak_allocation_percent}%</TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">{formatPercent(utilisationRatio(r))}</TableCell>
                    <TableCell className="pr-6">
                      <CapacityBadge status={r.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="pb-0">
        <CardHeader>
          <CardTitle>Allocations in range</CardTitle>
          <CardDescription>Dated assignments of people to projects. These replace the indicative percentage on project membership.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {allocations.length === 0 ? (
            <EmptyState className="mx-6 mb-6" title="No allocations" description="Allocate people to projects to plan capacity." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Person</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                  <TableHead className="hidden md:table-cell">Role</TableHead>
                  {canManage && (
                    <TableHead className="w-12 pr-6">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {allocations.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="pl-6 font-medium">{personLabel(people, a.membership_id)}</TableCell>
                    <TableCell>
                      <Link href={`/projects/${a.project_id}`} className="hover:underline">
                        {a.project ? `${a.project.code} · ${a.project.name}` : "Project"}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatDate(a.start_date)} – {formatDate(a.end_date)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{a.percent}%</TableCell>
                    <TableCell className="hidden md:table-cell">{a.role ?? "—"}</TableCell>
                    {canManage && (
                      <TableCell className="pr-6">
                        <AllocationActions
                          members={memberOptions}
                          projects={projectOptions}
                          allocation={{
                            id: a.id,
                            membershipId: a.membership_id,
                            projectId: a.project_id,
                            startDate: a.start_date,
                            endDate: a.end_date,
                            percent: String(a.percent),
                            role: a.role ?? "",
                            notes: a.notes ?? "",
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
    </div>
  );
}
