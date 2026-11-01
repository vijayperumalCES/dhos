import type { Metadata } from "next";
import Link from "next/link";

import { EnabledBadge } from "@/components/automation/badges";
import { NewRuleButton, RuleRowActions } from "@/components/automation/rule-controls";
import { EmptyState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgContext } from "@/lib/auth/org-context";
import { eventLabel } from "@/lib/automation/events";
import { describeRule, parseConditions, actionSchema } from "@/lib/automation/rules";
import { listRules, roleOptions, webhookOptions } from "@/lib/data/automation";
import { listMemberOptions } from "@/lib/data/members";
import { z } from "zod";

export const metadata: Metadata = { title: "Automation rules" };

export default async function RulesPage({ searchParams }: PageProps<"/automation">) {
  const ctx = await requireOrgContext();
  const canManage = ctx.permissions.has("automation.manage");
  const raw = await searchParams;
  const showArchived = raw.archived === "1";
  const [rules, roles, webhooks, members] = await Promise.all([
    listRules(ctx, showArchived),
    canManage ? roleOptions(ctx) : [],
    canManage ? webhookOptions(ctx) : [],
    canManage && ctx.permissions.has("org.members.read") ? listMemberOptions(ctx) : [],
  ]);
  const options = { roles, webhooks, members: members.map((m) => ({ value: m.id, label: m.displayName })) };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="space-y-1.5">
          <CardTitle>Rules</CardTitle>
          <CardDescription>When an event happens and its conditions hold, notify people or call a webhook, once per event. Rules never change records and never trigger each other.</CardDescription>
        </div>
        {canManage && <NewRuleButton options={options} />}
      </CardHeader>
      <CardContent>
        {rules.length === 0 ? (
          <EmptyState title="No rules yet" description="Standard notifications (health changes, assignments, approvals, overdue escalations) work without any rules. Add a rule to route something differently." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule</TableHead>
                <TableHead>What it does</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="text-right">Runs (30 d)</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r) => {
                const conditions = parseConditions(r.conditions) ?? [];
                const actions = z.array(actionSchema).safeParse(r.actions);
                return (
                  <TableRow key={r.id} className={r.archived_at ? "opacity-60" : undefined}>
                    <TableCell className="font-medium">
                      <Link href={`/automation/rules/${r.id}`} className="underline underline-offset-2">
                        {r.name}
                      </Link>
                      <div className="text-xs font-normal text-muted-foreground">v{r.version}</div>
                    </TableCell>
                    <TableCell className="max-w-md text-sm text-muted-foreground">{actions.success ? describeRule({ triggerEvent: r.trigger_event, conditions, actions: actions.data }, { event: eventLabel(r.trigger_event) }) : "This rule's definition is not valid and will not run."}</TableCell>
                    <TableCell>{r.archived_at ? <Badge variant="outline">Archived</Badge> : <EnabledBadge enabled={r.enabled} />}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.runs30d.ok + r.runs30d.failed}
                      {r.runs30d.failed > 0 && <span className="ml-1 text-xs text-destructive">({r.runs30d.failed} failed)</span>}
                    </TableCell>
                    <TableCell>{canManage && <RuleRowActions rule={r} options={options} />}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <p className="mt-3 text-xs">
          <Link href={showArchived ? "/automation" : "/automation?archived=1"} className="text-muted-foreground underline underline-offset-2">
            {showArchived ? "Hide archived rules" : "Show archived rules"}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
