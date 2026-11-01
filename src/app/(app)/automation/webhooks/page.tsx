import type { Metadata } from "next";

import { EnabledBadge } from "@/components/automation/badges";
import { AddWebhookButton, WebhookRowActions } from "@/components/automation/webhook-controls";
import { EmptyState } from "@/components/common/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgContext } from "@/lib/auth/org-context";
import { eventLabel } from "@/lib/automation/events";
import { listWebhooks } from "@/lib/data/automation";
import { formatDateTime, formatRelative } from "@/lib/format";
import { WEBHOOK_FORMAT_LABELS } from "@/lib/validation/automation";

export const metadata: Metadata = { title: "Webhooks" };

export default async function WebhooksPage() {
  const ctx = await requireOrgContext();
  const canManage = ctx.permissions.has("automation.manage");
  const endpoints = await listWebhooks(ctx);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="space-y-1.5">
          <CardTitle>Webhooks</CardTitle>
          <CardDescription>
            Outbound https endpoints. Generic webhooks are signed (HMAC-SHA256) and retried with backoff; an endpoint that fails ten deliveries in a row is switched off. Requests to private or internal addresses are refused.
          </CardDescription>
        </div>
        {canManage && <AddWebhookButton />}
      </CardHeader>
      <CardContent>
        {endpoints.length === 0 ? (
          <EmptyState title="No webhooks" description="Add one to push events to Teams, Slack or your own system." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Endpoint</TableHead>
                <TableHead>Events</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Last 7 days</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {endpoints.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <div className="font-medium">{e.name}</div>
                    <div className="max-w-xs truncate text-xs text-muted-foreground" title={e.url}>
                      {WEBHOOK_FORMAT_LABELS[e.format as keyof typeof WEBHOOK_FORMAT_LABELS]} · {new URL(e.url).host}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs text-sm text-muted-foreground">{e.event_types.includes("*") ? "All events" : e.event_types.map(eventLabel).join(", ")}</TableCell>
                  <TableCell>
                    <EnabledBadge enabled={e.enabled} offLabel="Disabled" />
                    {e.disabled_reason && <div className="mt-1 max-w-48 text-xs text-destructive">{e.disabled_reason}</div>}
                    <div className="mt-1 text-xs text-muted-foreground" title={e.last_success_at ? formatDateTime(e.last_success_at, ctx.settings.timezone) : undefined}>
                      Last success {formatRelative(e.last_success_at)}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {e.week.succeeded} delivered · {e.week.pending} pending
                    {e.week.dead > 0 && <span className="text-destructive"> · {e.week.dead} failed</span>}
                  </TableCell>
                  <TableCell>{canManage && <WebhookRowActions endpoint={e} />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
