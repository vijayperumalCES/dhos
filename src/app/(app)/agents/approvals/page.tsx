import type { Metadata } from "next";
import Link from "next/link";

import { ApprovalStatusBadge } from "@/components/agents/badges";
import { ApprovalButtons, RetryButton } from "@/components/agents/approval-controls";
import { EmptyState } from "@/components/common/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/auth/org-context";
import { listApprovals } from "@/lib/data/agents";
import { createWorkItemPayloadSchema } from "@/lib/ai/registry";
import { formatDateTime, personName } from "@/lib/format";

export const metadata: Metadata = { title: "Agent approvals" };

export default async function ApprovalsPage() {
  const ctx = await requireOrgContext();
  const canApprove = ctx.permissions.has("agent.approve");
  const [pending, decided] = await Promise.all([listApprovals(ctx, "pending"), listApprovals(ctx, "decided")]);
  const tz = ctx.settings.timezone;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Awaiting approval</CardTitle>
          <CardDescription>
            An agent only proposes. A person other than the requester, who is allowed to do the action on the project, decides. An approved action runs as the approver and is audited.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <EmptyState title="Nothing waiting" description="Proposals from agents, such as draft work items from the Requirements agent, appear here." />
          ) : (
            <ul className="space-y-3">
              {pending.map((a) => {
                const payload = createWorkItemPayloadSchema.safeParse(a.payload);
                const mine = a.requested_by_membership_id === ctx.membershipId;
                return (
                  <li key={a.id} className="space-y-2 rounded-lg border p-4 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{a.summary}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.project?.code} · requested by {personName(a.requester)} · {formatDateTime(a.created_at, tz)} ·{" "}
                          <Link href={`/agents/runs/${a.execution_id}`} className="underline">
                            source run
                          </Link>
                        </p>
                      </div>
                      {canApprove && !mine && <ApprovalButtons id={a.id} />}
                      {mine && <span className="text-xs text-muted-foreground">You requested this; someone else must decide.</span>}
                    </div>
                    {payload.success && (
                      <div className="rounded-md bg-muted/50 p-3">
                        {payload.data.description && <p>{payload.data.description}</p>}
                        {payload.data.acceptanceCriteria.length > 0 && (
                          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                            {payload.data.acceptanceCriteria.map((c, i) => (
                              <li key={i}>{c}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Decided</CardTitle>
        </CardHeader>
        <CardContent>
          {decided.length === 0 ? (
            <p className="text-sm text-muted-foreground">No decisions yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {decided.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p>{a.summary}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.project?.code} · decided by {personName(a.decider)} {a.decided_at ? `· ${formatDateTime(a.decided_at, tz)}` : ""}
                      {a.decision_note ? ` · “${a.decision_note}”` : ""}
                      {a.status === "executed" && (a.result as { key?: string } | null)?.key ? ` · created ${(a.result as { key: string }).key}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ApprovalStatusBadge status={a.status} />
                    {(a.status === "failed" || a.status === "approved") && a.decided_by_membership_id === ctx.membershipId && <RetryButton id={a.id} />}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
