import type { Metadata } from "next";
import Link from "next/link";

import { RunStatusBadge } from "@/components/agents/badges";
import { FilterBar } from "@/components/common/filter-bar";
import { Pagination, withParams } from "@/components/common/pagination";
import { AccessDenied, EmptyState } from "@/components/common/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AGENT_KEYS, AGENTS } from "@/lib/ai/registry";
import { requireOrgContext } from "@/lib/auth/org-context";
import { listRuns } from "@/lib/data/agents";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "My agent runs" };

export default async function RunsPage({ searchParams }: PageProps<"/agents/runs">) {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("agent.run")) return <AccessDenied what="agent runs" />;
  const raw = await searchParams;
  const one = (k: string) => (Array.isArray(raw[k]) ? raw[k][0] : raw[k]) as string | undefined;
  const page = Math.max(1, Number(one("page")) || 1);
  const { rows, total, pageSize } = await listRuns(ctx, { agent: one("agent"), status: one("status"), page });

  return (
    <Card>
      <CardHeader>
        <CardTitle>My runs</CardTitle>
        <CardDescription>Only you can open your runs: they contain data you were allowed to read. Administrators see aggregate usage, never content.</CardDescription>
      </CardHeader>
      <CardContent>
        <FilterBar
          filters={[
            { key: "agent", label: "Agent", allLabel: "Any agent", options: AGENT_KEYS.map((k) => ({ value: k, label: AGENTS[k].name })) },
            { key: "status", label: "Status", allLabel: "Any status", options: [{ value: "succeeded", label: "Succeeded" }, { value: "failed", label: "Failed" }, { value: "running", label: "Running" }] },
          ]}
        />
        {rows.length === 0 ? (
          <EmptyState title="No runs yet" description="Run an agent from the Agents tab and it will appear here." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/agents/runs/${r.id}`} className="underline underline-offset-2">
                      {formatDateTime(r.created_at, ctx.settings.timezone)}
                    </Link>
                  </TableCell>
                  <TableCell>{r.agent ? (AGENTS[r.agent.key as keyof typeof AGENTS]?.name ?? r.agent.key) : "—"}</TableCell>
                  <TableCell>{r.project?.code ?? "Portfolio"}</TableCell>
                  <TableCell>
                    <RunStatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.input_tokens + r.output_tokens || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.latency_ms === null ? "—" : `${(r.latency_ms / 1000).toFixed(1)}s`}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pagination page={page} pageSize={pageSize} total={total} hrefForPage={(p) => withParams("/agents/runs", { agent: one("agent"), status: one("status") }, { page: String(p) })} />
      </CardContent>
    </Card>
  );
}
