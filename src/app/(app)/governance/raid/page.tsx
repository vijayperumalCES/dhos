import type { Metadata } from "next";

import { FilterBar } from "@/components/common/filter-bar";
import { EmptyState } from "@/components/common/states";
import { OverdueBadge, RaidStatusBadge, RaidTypeBadge, RiskScoreBadge } from "@/components/governance/badges";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgContext } from "@/lib/auth/org-context";
import { listGovernanceProjects, listRaidItems } from "@/lib/data/governance";
import { loadProjectFormOptions } from "@/lib/data/options";
import { isPastDue, isRaidOpen, RAID_STATUS_LABELS, RAID_TYPE_LABELS, RAID_TYPES } from "@/lib/domain/governance";
import { todayInTimeZone } from "@/lib/domain/time";
import { formatDate, personName } from "@/lib/format";
import { governanceFilterSchema } from "@/lib/validation/governance";

import { RaidDialog, RaidRowActions } from "./raid-controls";

export const metadata: Metadata = { title: "RAID register" };

export default async function RaidPage({ searchParams }: PageProps<"/governance/raid">) {
  const ctx = await requireOrgContext();
  const raw = await searchParams;
  const filters = governanceFilterSchema.parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
  const archived = raw.archived === "1";
  const canManage = ctx.permissions.has("governance.manage");

  const [items, projects, options] = await Promise.all([
    listRaidItems(ctx, { ...filters, archived }),
    listGovernanceProjects(ctx),
    loadProjectFormOptions(ctx),
  ]);
  const today = todayInTimeZone(new Date(), ctx.settings.timezone);
  const open = items.filter((i) => isRaidOpen(i.status));
  const overdue = open.filter((i) => isPastDue(i.due_date, today)).length;

  return (
    <Card className="pb-0">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <CardTitle>RAID register</CardTitle>
          <CardDescription>
            {open.length} open · {overdue} overdue · risks are ranked by probability × impact. Showing {archived ? "archived" : "current"} items
            {items.length === 500 ? " (first 500)" : ""}.
          </CardDescription>
        </div>
        {canManage && !archived && <RaidDialog projects={projects} members={options.members} fixedProject={filters.project} />}
      </CardHeader>
      <CardContent className="px-0">
        <div className="px-6">
          <FilterBar
            searchPlaceholder="Search titles"
            filters={[
              { key: "project", label: "Project", options: projects },
              { key: "type", label: "Type", options: RAID_TYPES.map((t) => ({ value: t, label: RAID_TYPE_LABELS[t] })) },
              {
                key: "status",
                label: "Status",
                allLabel: "Any status",
                options: [
                  { value: "open", label: "Open or in progress" },
                  { value: "closed", label: "Resolved, accepted or closed" },
                  ...(["open", "in_progress", "resolved", "accepted", "closed"] as const).map((s) => ({ value: s, label: RAID_STATUS_LABELS[s] })),
                ].filter((o, i, all) => all.findIndex((x) => x.value === o.value) === i),
              },
              { key: "owner", label: "Owner", options: options.members },
              { key: "archived", label: "Archive", allLabel: "Current", options: [{ value: "1", label: "Archived" }] },
            ]}
          />
        </div>
        {items.length === 0 ? (
          <EmptyState className="mx-6 mb-6" title="Nothing in the register" description="Record the risks, assumptions, issues and dependencies the team is carrying." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Item</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead className="hidden md:table-cell">Owner</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                {canManage && (
                  <TableHead className="w-12 pr-6">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="max-w-md pl-6 whitespace-normal">
                    <div className="font-medium">{i.title}</div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-mono">{i.project?.code}</span>
                      {i.mitigation ? ` · Response: ${i.mitigation.slice(0, 90)}${i.mitigation.length > 90 ? "…" : ""}` : ""}
                    </div>
                    {i.resolution_note && <div className="text-xs text-muted-foreground">Outcome: {i.resolution_note}</div>}
                  </TableCell>
                  <TableCell>
                    <RaidTypeBadge type={i.type} />
                  </TableCell>
                  <TableCell>{i.type === "risk" ? <RiskScoreBadge score={i.score} /> : i.impact ? <span className="text-sm tabular-nums">Impact {i.impact}/5</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="hidden md:table-cell">{personName(i.owner)}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatDate(i.due_date)} {isRaidOpen(i.status) && isPastDue(i.due_date, today) && <OverdueBadge />}
                  </TableCell>
                  <TableCell>
                    <RaidStatusBadge status={i.status} />
                  </TableCell>
                  {canManage && (
                    <TableCell className="pr-6">
                      <RaidRowActions row={i} projects={projects} members={options.members} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
