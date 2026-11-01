import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EnabledBadge, RunResultBadge } from "@/components/automation/badges";
import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgContext } from "@/lib/auth/org-context";
import { eventLabel } from "@/lib/automation/events";
import { actionSchema, describeRule, parseConditions } from "@/lib/automation/rules";
import { getRuleDetail } from "@/lib/data/automation";
import { formatDateTime } from "@/lib/format";
import { z } from "zod";

export const metadata: Metadata = { title: "Rule" };

export default async function RulePage({ params }: PageProps<"/automation/rules/[ruleId]">) {
  const ctx = await requireOrgContext();
  const { ruleId } = await params;
  const detail = await getRuleDetail(ctx, ruleId);
  if (!detail) notFound();
  const { rule, versions, runs } = detail;
  const tz = ctx.settings.timezone;
  const describe = (s: { trigger_event?: string; conditions?: unknown; actions?: unknown }) => {
    const actions = z.array(actionSchema).safeParse(s.actions);
    return actions.success ? describeRule({ triggerEvent: s.trigger_event ?? "", conditions: parseConditions(s.conditions) ?? [], actions: actions.data }, { event: eventLabel(s.trigger_event ?? "") }) : "Not valid.";
  };

  return (
    <div className="space-y-6">
      <PageHeader title={rule.name} breadcrumbs={[{ label: "Automation", href: "/automation" }, { label: rule.name }]} description={rule.description ?? undefined} meta={<EnabledBadge enabled={rule.enabled && !rule.archived_at} offLabel={rule.archived_at ? "Archived" : "Off"} />} />
      <Card>
        <CardHeader>
          <CardTitle>Definition (version {rule.version})</CardTitle>
          <CardDescription>{describe(rule)}</CardDescription>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
          <CardDescription>A rule runs at most once for each event.</CardDescription>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">It has not run yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{formatDateTime(r.created_at, tz)}</TableCell>
                    <TableCell>v{r.rule_version}</TableCell>
                    <TableCell>
                      <RunResultBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {(Array.isArray(r.detail) ? (r.detail as { action: string; recipients?: number; queued?: boolean; error?: string }[]) : []).map((d) => (d.error ? `${d.action}: ${d.error}` : d.action === "notify" ? `notified ${d.recipients ?? 0}` : d.queued ? "webhook queued" : "webhook skipped")).join(" · ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Version history</CardTitle>
          <CardDescription>Every change to the trigger, conditions or actions is kept and cannot be edited.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {versions.map((v) => (
              <li key={v.version}>
                <span className="font-medium">v{v.version}</span> · {formatDateTime(v.created_at, tz)}
                <div className="text-muted-foreground">{describe(v.snapshot as { trigger_event?: string; conditions?: unknown; actions?: unknown })}</div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
