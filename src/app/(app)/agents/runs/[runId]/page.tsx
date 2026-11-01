import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AgentOutput } from "@/components/agents/output";
import { ApprovalStatusBadge, RunStatusBadge } from "@/components/agents/badges";
import { PageHeader } from "@/components/common/page-header";
import { AccessDenied } from "@/components/common/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AGENTS, isAgentKey } from "@/lib/ai/registry";
import { requireOrgContext } from "@/lib/auth/org-context";
import { getRun } from "@/lib/data/agents";
import { formatDateTime } from "@/lib/format";
import { uuid } from "@/lib/validation/common";

export const metadata: Metadata = { title: "Agent run" };

export default async function RunPage({ params }: PageProps<"/agents/runs/[runId]">) {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("agent.run")) return <AccessDenied what="agent runs" />;
  const { runId } = await params;
  if (!uuid.safeParse(runId).success) notFound();
  const found = await getRun(ctx, runId);
  if (!found) notFound();
  const { run, approvals } = found;
  const key = run.agent?.key ?? "";
  const def = isAgentKey(key) ? AGENTS[key] : null;
  const tz = ctx.settings.timezone;
  const toolCalls = Array.isArray(run.tool_calls) ? (run.tool_calls as { tool: string; status: string; rows: number; note?: string }[]) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${def?.name ?? key} run`}
        breadcrumbs={[{ label: "AI Agents", href: "/agents" }, { label: "My runs", href: "/agents/runs" }, { label: formatDateTime(run.created_at, tz) }]}
        meta={<RunStatusBadge status={run.status} />}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Result</CardTitle>
              <CardDescription>
                {run.project ? `${run.project.code} · ${run.project.name}` : "Portfolio"} · generated content: check the cited records before relying on it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {run.status === "failed" ? (
                <p className="text-sm text-destructive">{run.error ?? "The run failed."}</p>
              ) : run.status === "running" ? (
                <p className="text-sm text-muted-foreground">Still running. Refresh in a moment.</p>
              ) : (
                <AgentOutput kind={def?.kind ?? "analysis"} output={run.output} evidence={run.evidence} />
              )}
            </CardContent>
          </Card>

          {approvals.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Proposals</CardTitle>
                <CardDescription>
                  Nothing below happens until a different person approves it. <Link href="/agents/approvals" className="underline">Open approvals</Link>.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {approvals.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                      <span>{a.summary}</span>
                      <ApprovalStatusBadge status={a.status} />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Run details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Version</dt>
              <dd>v{run.version?.version ?? "?"}</dd>
              <dt className="text-muted-foreground">Provider</dt>
              <dd>{run.provider ?? "—"}</dd>
              <dt className="text-muted-foreground">Model</dt>
              <dd className="break-all">{run.model ?? "—"}</dd>
              <dt className="text-muted-foreground">Tokens</dt>
              <dd className="tabular-nums">
                {run.input_tokens} in · {run.output_tokens} out
              </dd>
              <dt className="text-muted-foreground">Est. cost</dt>
              <dd>{run.estimated_cost === null ? "Not estimated" : `${ctx.settings.currencyCode} ${Number(run.estimated_cost).toFixed(4)}`}</dd>
              <dt className="text-muted-foreground">Duration</dt>
              <dd>{run.latency_ms === null ? "—" : `${(run.latency_ms / 1000).toFixed(1)}s`}</dd>
              <dt className="text-muted-foreground">Data read</dt>
              <dd>
                {toolCalls.length === 0 ? (
                  "—"
                ) : (
                  <ul className="space-y-0.5">
                    {toolCalls.map((t, i) => (
                      <li key={i}>
                        {t.tool.replace("_", " ")}: {t.status === "skipped" ? "not permitted" : `${t.rows} row${t.rows === 1 ? "" : "s"}${t.status === "truncated" ? " (truncated)" : ""}`}
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
