import type { Metadata } from "next";

import { AccessDenied } from "@/components/common/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AGENTS, isAgentKey } from "@/lib/ai/registry";
import { requireOrgContext } from "@/lib/auth/org-context";
import { getAgentOverview, getUsage } from "@/lib/data/agents";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Agent usage" };

export default async function UsagePage() {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("agent.read")) return <AccessDenied what="agent usage" />;
  const [{ settings }, usage] = await Promise.all([getAgentOverview(ctx), getUsage(ctx, new Date())]);
  const used = usage.rows.reduce((n, r) => n + Number(r.input_tokens) + Number(r.output_tokens), 0);
  const cap = settings?.monthly_token_cap ?? 0;
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 100;
  const cost = usage.rows.some((r) => r.estimated_cost !== null) ? usage.rows.reduce((n, r) => n + Number(r.estimated_cost ?? 0), 0) : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Token budget</CardTitle>
          <CardDescription>
            Month starting {usage.from}. New runs are refused once the cap is reached. This page shows counts only, never what anyone asked or received.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="tabular-nums">
              {used.toLocaleString()} of {cap.toLocaleString()} tokens ({pct}%)
            </span>
            <span className="text-muted-foreground">{cost === null ? "Cost not estimated (set prices in Settings)" : `Estimated cost ${ctx.settings.currencyCode} ${cost.toFixed(4)}`}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Monthly token budget used">
            <div className={`h-full ${pct >= 90 ? "bg-health-red" : pct >= 70 ? "bg-health-amber" : "bg-primary"}`} style={{ width: `${pct}%` }} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By agent</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead className="text-right">Runs</TableHead>
                <TableHead className="text-right">Failed</TableHead>
                <TableHead className="text-right">Tokens in</TableHead>
                <TableHead className="text-right">Tokens out</TableHead>
                <TableHead className="text-right">Avg time</TableHead>
                <TableHead>Last run</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usage.rows.map((r) => (
                <TableRow key={r.agent_key}>
                  <TableCell>{isAgentKey(r.agent_key) ? AGENTS[r.agent_key].name : r.agent_key}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(r.runs)}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(r.failed_runs)}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(r.input_tokens).toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(r.output_tokens).toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.avg_latency_ms === null ? "—" : `${(Number(r.avg_latency_ms) / 1000).toFixed(1)}s`}</TableCell>
                  <TableCell>{r.last_run_at ? formatDateTime(r.last_run_at, ctx.settings.timezone) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">The built-in provider uses no tokens, so its runs show zero.</p>
        </CardContent>
      </Card>
    </div>
  );
}
