import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ActivateButton, EnableToggle, EvaluateButton, NewVersionDialog } from "@/components/agents/agent-controls";
import { PageHeader } from "@/components/common/page-header";
import { AccessDenied } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AGENTS, isAgentKey } from "@/lib/ai/registry";
import { requireOrgContext } from "@/lib/auth/org-context";
import { getAgentDetail } from "@/lib/data/agents";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Agent configuration" };

export default async function AgentDetailPage({ params }: PageProps<"/agents/[agentKey]">) {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("agent.read")) return <AccessDenied what="agent configuration" />;
  const { agentKey } = await params;
  if (!isAgentKey(agentKey)) notFound();
  const detail = await getAgentDetail(ctx, agentKey);
  if (!detail) notFound();
  const def = AGENTS[agentKey];
  const manage = ctx.permissions.has("agent.manage");
  const { def: row, versions } = detail;
  const active = versions.find((v) => v.id === row.active_version_id);
  const tz = ctx.settings.timezone;

  return (
    <div className="space-y-6">
      <PageHeader
        title={def.name}
        description={def.purpose}
        breadcrumbs={[{ label: "AI Agents", href: "/agents" }, { label: def.name }]}
        meta={<Badge variant="secondary">{row.enabled ? "Enabled" : "Disabled"}</Badge>}
        actions={manage ? <EnableToggle agentId={row.id} enabled={row.enabled} canEnable={!!row.active_version_id} /> : undefined}
      />

      <Card>
        <CardHeader>
          <CardTitle>Safety contract</CardTitle>
          <CardDescription>Fixed in code and reviewed with each release; it cannot be changed from this page.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid max-w-3xl grid-cols-[10rem_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Tool allow-list</dt>
            <dd className="flex flex-wrap gap-1">
              {def.tools.map((t) => (
                <Badge key={t} variant="outline">
                  {t.replace("_", " ")}
                </Badge>
              ))}
            </dd>
            <dt className="text-muted-foreground">Caller needs</dt>
            <dd>{def.callerNeeds}</dd>
            <dt className="text-muted-foreground">Approval policy</dt>
            <dd>{def.approvalPolicy}</dd>
            <dt className="text-muted-foreground">Timeout</dt>
            <dd>{def.timeoutMs / 1000}s, retried twice with backoff by the provider</dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Prompt versions</CardTitle>
            <CardDescription>
              A version can be activated only after every evaluation case passes. To roll back, activate an earlier version that passed. Disable the agent at any time with the kill switch.
            </CardDescription>
          </div>
          {manage && active && (
            <NewVersionDialog
              agentId={row.id}
              base={{ systemPrompt: active.system_prompt, model: active.model ?? "", temperature: String(active.temperature), maxTokens: String(active.max_tokens), notes: "" }}
            />
          )}
        </CardHeader>
        <CardContent>
          <ul className="space-y-4">
            {versions.map((v) => {
              const isActive = v.id === row.active_version_id;
              const ev = v.latestEval;
              const results = Array.isArray(ev?.results) ? (ev.results as { name: string; passed: boolean; detail: string }[]) : [];
              return (
                <li key={v.id} className="space-y-3 rounded-lg border p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">Version {v.version}</span>
                      {isActive && <Badge>Active</Badge>}
                      {ev ? <Badge variant="outline">{ev.passed ? `Evaluation passed ${ev.passed_cases}/${ev.total_cases}` : `Evaluation failed ${ev.passed_cases}/${ev.total_cases}`}</Badge> : <Badge variant="outline">Not evaluated</Badge>}
                      <span className="text-xs text-muted-foreground">{formatDateTime(v.created_at, tz)}</span>
                    </div>
                    {manage && (
                      <div className="flex gap-2">
                        <EvaluateButton versionId={v.id} />
                        {!isActive && ev?.passed && <ActivateButton versionId={v.id} label={active && v.version < active.version ? "Roll back to this" : "Activate"} />}
                      </div>
                    )}
                  </div>
                  {v.notes && <p className="text-muted-foreground">{v.notes}</p>}
                  <details>
                    <summary className="cursor-pointer text-muted-foreground">Prompt and settings</summary>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Temperature {v.temperature} · max {v.max_tokens} tokens · model {v.model ?? "organization default"}
                    </p>
                    <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-muted/50 p-3 text-xs whitespace-pre-wrap">{v.system_prompt}</pre>
                  </details>
                  {results.length > 0 && (
                    <details>
                      <summary className="cursor-pointer text-muted-foreground">Latest evaluation cases</summary>
                      <ul className="mt-2 space-y-1">
                        {results.map((r) => (
                          <li key={r.name}>
                            <span aria-hidden>{r.passed ? "✓" : "✗"}</span> <span className="sr-only">{r.passed ? "Passed:" : "Failed:"}</span> {r.name}
                            {!r.passed && <span className="text-destructive"> — {r.detail}</span>}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
