import type { Metadata } from "next";

import { FilterBar } from "@/components/common/filter-bar";
import { EmptyState } from "@/components/common/states";
import { ActionStatusBadge, OverdueBadge } from "@/components/governance/badges";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgContext } from "@/lib/auth/org-context";
import { listGovernanceProjects, listProjectActions } from "@/lib/data/governance";
import { loadProjectFormOptions } from "@/lib/data/options";
import { isActionOpen, isPastDue } from "@/lib/domain/governance";
import { todayInTimeZone } from "@/lib/domain/time";
import { formatDate, personName } from "@/lib/format";
import { governanceFilterSchema } from "@/lib/validation/governance";

import { ActionDialog, ActionRowActions } from "./action-controls";

export const metadata: Metadata = { title: "Actions" };

export default async function ActionsPage({ searchParams }: PageProps<"/governance/actions">) {
  const ctx = await requireOrgContext();
  const raw = await searchParams;
  const filters = governanceFilterSchema.parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
  const mine = raw.mine === "1";
  const canManage = ctx.permissions.has("governance.manage");

  const [actions, projects, options] = await Promise.all([listProjectActions(ctx, { ...filters, mine }), listGovernanceProjects(ctx), loadProjectFormOptions(ctx)]);
  const today = todayInTimeZone(new Date(), ctx.settings.timezone);
  const open = actions.filter((a) => isActionOpen(a.status));
  const overdue = open.filter((a) => isPastDue(a.due_date, today)).length;

  return (
    <Card className="pb-0">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <CardTitle>Actions</CardTitle>
          <CardDescription>
            {open.length} open · {overdue} overdue. Owners can move their own actions along; changing the owner or deleting needs governance management.
          </CardDescription>
        </div>
        {canManage && <ActionDialog projects={projects} members={options.members} fixedProject={filters.project} />}
      </CardHeader>
      <CardContent className="px-0">
        <div className="px-6">
          <FilterBar
            searchPlaceholder="Search titles"
            filters={[
              { key: "project", label: "Project", options: projects },
              {
                key: "status",
                label: "Status",
                allLabel: "Any status",
                options: [
                  { value: "open", label: "Open or in progress" },
                  { value: "closed", label: "Done or cancelled" },
                ],
              },
              { key: "owner", label: "Owner", options: options.members },
              { key: "mine", label: "Scope", allLabel: "Everyone's", options: [{ value: "1", label: "Mine" }] },
            ]}
          />
        </div>
        {actions.length === 0 ? (
          <EmptyState className="mx-6 mb-6" title="No actions" description="Actions capture who will do what by when, from decisions, risks and escalations." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Action</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12 pr-6">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {actions.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="max-w-md pl-6 whitespace-normal">
                    <div className="font-medium">{a.title}</div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-mono">{a.project?.code}</span>
                      {a.raid ? ` · From risk: ${a.raid.title}` : ""}
                      {a.decision ? ` · From decision: ${a.decision.title}` : ""}
                    </div>
                  </TableCell>
                  <TableCell>{personName(a.owner)}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatDate(a.due_date)} {isActionOpen(a.status) && isPastDue(a.due_date, today) && <OverdueBadge />}
                  </TableCell>
                  <TableCell>
                    <ActionStatusBadge status={a.status} />
                  </TableCell>
                  <TableCell className="pr-6">
                    <ActionRowActions
                      row={a}
                      projects={projects}
                      members={options.members}
                      canManage={canManage}
                      isOwner={a.owner_membership_id === ctx.membershipId}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
