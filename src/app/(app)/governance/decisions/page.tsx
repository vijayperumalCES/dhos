import type { Metadata } from "next";

import { FilterBar } from "@/components/common/filter-bar";
import { EmptyState } from "@/components/common/states";
import { DecisionStatusBadge } from "@/components/governance/badges";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/auth/org-context";
import { listDecisions, listGovernanceProjects } from "@/lib/data/governance";
import { DECISION_STATUS_LABELS, DECISION_STATUSES } from "@/lib/domain/governance";
import { formatDate, personName } from "@/lib/format";
import { governanceFilterSchema } from "@/lib/validation/governance";

import { DecisionDialog, DecisionRowActions } from "./decision-controls";

export const metadata: Metadata = { title: "Decisions" };

export default async function DecisionsPage({ searchParams }: PageProps<"/governance/decisions">) {
  const ctx = await requireOrgContext();
  const raw = await searchParams;
  const filters = governanceFilterSchema.parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
  const canManage = ctx.permissions.has("governance.manage");

  const [decisions, projects, all] = await Promise.all([listDecisions(ctx, filters), listGovernanceProjects(ctx), listDecisions(ctx, { status: "accepted" })]);
  const titleById = new Map(all.map((x) => [x.id, x.title]));

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <CardTitle>Decision log</CardTitle>
          <CardDescription>What was decided, by whom and why. Accepted and rejected decisions are locked; they can only be superseded by a newer one.</CardDescription>
        </div>
        {canManage && <DecisionDialog projects={projects} fixedProject={filters.project} />}
      </CardHeader>
      <CardContent>
        <FilterBar
          searchPlaceholder="Search titles"
          filters={[
            { key: "project", label: "Project", options: projects },
            { key: "status", label: "Status", allLabel: "Any status", options: DECISION_STATUSES.map((s) => ({ value: s, label: DECISION_STATUS_LABELS[s] })) },
          ]}
        />
        {decisions.length === 0 ? (
          <EmptyState title="No decisions recorded" description="Capture significant decisions with their context and rationale so the reasoning survives staff changes." />
        ) : (
          <ul className="space-y-3">
            {decisions.map((d) => (
              <li key={d.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">
                      <span className="mr-2 font-mono text-xs text-muted-foreground">{d.project?.code}</span>
                      {d.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {d.decided_on ? `${formatDate(d.decided_on)} · ${personName(d.decider)}` : `Proposed ${formatDate(d.created_at.slice(0, 10))}`}
                      {d.superseded_by_id ? ` · Superseded by “${titleById.get(d.superseded_by_id) ?? "a newer decision"}”` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <DecisionStatusBadge status={d.status} />
                    {canManage && (
                      <DecisionRowActions
                        row={d}
                        projects={projects}
                        replacements={all.filter((x) => x.project_id === d.project_id && x.id !== d.id).map((x) => ({ value: x.id, label: x.title }))}
                      />
                    )}
                  </div>
                </div>
                <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                  {d.context && <Field label="Context" text={d.context} />}
                  {d.decision && <Field label="Decision" text={d.decision} />}
                  {d.rationale && <Field label="Rationale" text={d.rationale} />}
                  {d.consequences && <Field label="Consequences" text={d.consequences} />}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap">{text}</dd>
    </div>
  );
}
