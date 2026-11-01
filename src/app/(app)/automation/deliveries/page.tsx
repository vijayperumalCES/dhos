import type { Metadata } from "next";

import { DeliveryStatusBadge } from "@/components/automation/badges";
import { RedeliverButton } from "@/components/automation/webhook-controls";
import { FilterBar } from "@/components/common/filter-bar";
import { Pagination, withParams } from "@/components/common/pagination";
import { EmptyState } from "@/components/common/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgContext } from "@/lib/auth/org-context";
import { eventLabel } from "@/lib/automation/events";
import { listDeliveries, listWebhooks } from "@/lib/data/automation";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Webhook deliveries" };

export default async function DeliveriesPage({ searchParams }: PageProps<"/automation/deliveries">) {
  const ctx = await requireOrgContext();
  const raw = await searchParams;
  const one = (k: string) => (Array.isArray(raw[k]) ? raw[k][0] : raw[k]) as string | undefined;
  const page = Math.max(1, Number(one("page")) || 1);
  const [{ rows, total, pageSize }, endpoints] = await Promise.all([listDeliveries(ctx, { endpointId: one("endpoint"), status: one("status"), page }), listWebhooks(ctx)]);
  const canManage = ctx.permissions.has("automation.manage");
  const tz = ctx.settings.timezone;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deliveries</CardTitle>
        <CardDescription>Every attempt to send an event to a webhook. Retries wait 1 minute, 5 minutes, 30 minutes, 2 hours and 12 hours, then the delivery is marked failed for good; you can retry it by hand.</CardDescription>
      </CardHeader>
      <CardContent>
        <FilterBar
          filters={[
            { key: "endpoint", label: "Webhook", allLabel: "Any webhook", options: endpoints.map((e) => ({ value: e.id, label: e.name })) },
            { key: "status", label: "Status", allLabel: "Any status", options: [{ value: "pending", label: "Pending" }, { value: "succeeded", label: "Delivered" }, { value: "dead", label: "Failed for good" }] },
          ]}
        />
        {rows.length === 0 ? (
          <EmptyState title="No deliveries" description="Deliveries appear here once an event matches a webhook's subscription." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Queued</TableHead>
                <TableHead>Webhook</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Attempts</TableHead>
                <TableHead>Last result</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>{formatDateTime(d.created_at, tz)}</TableCell>
                  <TableCell>{d.endpoint?.name ?? "—"}</TableCell>
                  <TableCell>{eventLabel(d.event_type)}</TableCell>
                  <TableCell>
                    <DeliveryStatusBadge status={d.status} />
                    {d.status === "pending" && d.attempts > 0 && <div className="text-xs text-muted-foreground">Next try {formatDateTime(d.next_attempt_at, tz)}</div>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{d.attempts}</TableCell>
                  <TableCell className="max-w-xs text-xs text-muted-foreground">{d.error ?? (d.response_status ? `HTTP ${d.response_status}` : "—")}</TableCell>
                  <TableCell>{canManage && d.status !== "succeeded" && <RedeliverButton deliveryId={d.id} />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pagination page={page} pageSize={pageSize} total={total} hrefForPage={(p) => withParams("/automation/deliveries", { endpoint: one("endpoint"), status: one("status") }, { page: String(p) })} />
      </CardContent>
    </Card>
  );
}
