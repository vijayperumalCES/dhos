import type { Metadata } from "next";

import { FilterBar } from "@/components/common/filter-bar";
import { EmptyState } from "@/components/common/states";
import { ChangeStatusBadge } from "@/components/governance/badges";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/auth/org-context";
import { listChangeRequests, listGovernanceProjects } from "@/lib/data/governance";
import { CHANGE_STATUS_LABELS, CHANGE_STATUSES } from "@/lib/domain/governance";
import { formatDateTime, personName } from "@/lib/format";
import { governanceFilterSchema } from "@/lib/validation/governance";

import { ChangeDialog, ChangeRowActions } from "./change-controls";

export const metadata: Metadata = { title: "Change requests" };

export default async function ChangesPage({ searchParams }: PageProps<"/governance/changes">) {
  const ctx = await requireOrgContext();
  const raw = await searchParams;
  const filters = governanceFilterSchema.parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
  const canManage = ctx.permissions.has("governance.manage");
  const canApprove = ctx.permissions.has("change.approve");

  const [changes, projects] = await Promise.all([listChangeRequests(ctx, filters), listGovernanceProjects(ctx)]);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <CardTitle>Change requests</CardTitle>
          <CardDescription>
            {changes.filter((c) => c.status === "submitted").length} awaiting a decision. Approvers can&apos;t decide their own requests. Approving records the decision and its
            impact; it does not edit milestones or baselines.
          </CardDescription>
        </div>
        {canManage && <ChangeDialog projects={projects} fixedProject={filters.project} />}
      </CardHeader>
      <CardContent>
        <FilterBar
          searchPlaceholder="Search titles"
          filters={[
            { key: "project", label: "Project", options: projects },
            {
              key: "status",
              label: "Status",
              allLabel: "Any status",
              options: [{ value: "open", label: "Draft or submitted" }, ...CHANGE_STATUSES.map((s) => ({ value: s, label: CHANGE_STATUS_LABELS[s] }))],
            },
          ]}
        />
        {changes.length === 0 ? (
          <EmptyState title="No change requests" description="Raise a change request when scope, schedule or effort needs to move after the plan was agreed." />
        ) : (
          <ul className="space-y-3">
            {changes.map((c) => (
              <li key={c.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">
                      <span className="mr-2 font-mono text-xs text-muted-foreground">{c.project?.code}</span>
                      {c.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Requested by {personName(c.requester)}
                      {c.submitted_at ? ` · submitted ${formatDateTime(c.submitted_at, ctx.settings.timezone)}` : ""}
                      {c.decided_at ? ` · decided by ${personName(c.decider)} ${formatDateTime(c.decided_at, ctx.settings.timezone)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <ChangeStatusBadge status={c.status} />
                    <ChangeRowActions row={c} projects={projects} canManage={canManage} canApprove={canApprove} isRequester={c.requested_by_membership_id === ctx.membershipId} />
                  </div>
                </div>
                <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                  {c.description && <Item label="What changes" text={c.description} />}
                  {c.justification && <Item label="Why" text={c.justification} />}
                  {c.impact_scope && <Item label="Scope impact" text={c.impact_scope} />}
                  {c.impact_risk && <Item label="Risk impact" text={c.impact_risk} />}
                  {(c.impact_schedule_days !== null || c.impact_effort_hours !== null) && (
                    <Item
                      label="Schedule and effort"
                      text={[
                        c.impact_schedule_days !== null ? `${c.impact_schedule_days > 0 ? "+" : ""}${c.impact_schedule_days} days` : null,
                        c.impact_effort_hours !== null ? `${c.impact_effort_hours} hours` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    />
                  )}
                  {c.decision_note && <Item label="Decision note" text={c.decision_note} />}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Item({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap">{text}</dd>
    </div>
  );
}
