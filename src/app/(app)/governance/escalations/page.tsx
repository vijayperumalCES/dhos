import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";

import { FilterBar } from "@/components/common/filter-bar";
import { EmptyState } from "@/components/common/states";
import { EscalationSeverityBadge, EscalationStatusBadge } from "@/components/governance/badges";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/auth/org-context";
import { listEscalations, listGovernanceProjects } from "@/lib/data/governance";
import { loadProjectFormOptions } from "@/lib/data/options";
import { ESCALATION_STATUS_LABELS, ESCALATION_STATUSES, escalationTiming } from "@/lib/domain/governance";
import { formatDateTime, personName } from "@/lib/format";
import { governanceFilterSchema } from "@/lib/validation/governance";

import { EscalationDialog, EscalationRowActions } from "./escalation-controls";

export const metadata: Metadata = { title: "Escalations" };

export default async function EscalationsPage({ searchParams }: PageProps<"/governance/escalations">) {
  const ctx = await requireOrgContext();
  const raw = await searchParams;
  const filters = governanceFilterSchema.parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
  const canManage = ctx.permissions.has("governance.manage");

  const [escalations, projects, options] = await Promise.all([listEscalations(ctx, filters), listGovernanceProjects(ctx), loadProjectFormOptions(ctx)]);
  const now = new Date();
  const rows = escalations.map((e) => ({ ...e, timing: escalationTiming(e, now) }));
  const overdue = rows.filter((e) => e.timing === "overdue").length;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <CardTitle>Escalations</CardTitle>
          <CardDescription>
            {rows.filter((e) => e.status !== "resolved").length} open · {overdue} past their deadline. Times are shown in {ctx.settings.timezone}.
          </CardDescription>
        </div>
        {canManage && <EscalationDialog projects={projects} members={options.members} fixedProject={filters.project} />}
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
              options: [{ value: "open", label: "Not yet resolved" }, ...ESCALATION_STATUSES.filter((s) => s !== "open").map((s) => ({ value: s, label: ESCALATION_STATUS_LABELS[s] }))],
            },
          ]}
        />
        {rows.length === 0 ? (
          <EmptyState title="No escalations" description="Escalate when a project needs a decision or help from someone with more authority, and attach the evidence." />
        ) : (
          <ul className="space-y-3">
            {rows.map((e) => (
              <li key={e.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">
                      <span className="mr-2 font-mono text-xs text-muted-foreground">{e.project?.code}</span>
                      {e.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      To {personName(e.escalated_to)} · raised by {personName(e.raised_by)} · respond by {formatDateTime(e.respond_by, ctx.settings.timezone)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <EscalationSeverityBadge severity={e.severity} />
                    <EscalationStatusBadge status={e.status} timing={e.timing} />
                    <EscalationRowActions id={e.id} title={e.title} status={e.status} isRecipient={e.escalated_to_membership_id === ctx.membershipId} canManage={canManage} />
                  </div>
                </div>
                <p className="mt-3 text-sm whitespace-pre-wrap">{e.description}</p>
                {e.raid && <p className="mt-2 text-xs text-muted-foreground">Linked risk: {e.raid.title}</p>}
                <div className="mt-3">
                  <p className="text-xs font-medium text-muted-foreground">Evidence ({e.evidence.length})</p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {[...e.evidence]
                      .sort((a, b) => a.created_at.localeCompare(b.created_at))
                      .map((ev) => (
                        <li key={ev.id}>
                          <span className="font-medium">{ev.title}</span>
                          {ev.url ? (
                            <a href={ev.url} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 text-primary hover:underline">
                              Open <ExternalLink className="size-3" aria-hidden />
                            </a>
                          ) : (
                            <span className="text-muted-foreground"> — {ev.note}</span>
                          )}
                        </li>
                      ))}
                  </ul>
                </div>
                {e.status === "resolved" && (
                  <p className="mt-3 rounded-md bg-health-green/10 px-3 py-2 text-sm">
                    <span className="font-medium">Resolved {formatDateTime(e.resolved_at, ctx.settings.timezone)}:</span> {e.resolution_note}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
