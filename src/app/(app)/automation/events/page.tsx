import type { Metadata } from "next";

import { FilterBar } from "@/components/common/filter-bar";
import { Pagination, withParams } from "@/components/common/pagination";
import { EmptyState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgContext } from "@/lib/auth/org-context";
import { EVENTS, EVENT_TYPES, eventLabel, summarizeEvent } from "@/lib/automation/events";
import { listEvents } from "@/lib/data/automation";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Event stream" };

export default async function EventsPage({ searchParams }: PageProps<"/automation/events">) {
  const ctx = await requireOrgContext();
  const raw = await searchParams;
  const one = (k: string) => (Array.isArray(raw[k]) ? raw[k][0] : raw[k]) as string | undefined;
  const page = Math.max(1, Number(one("page")) || 1);
  const type = one("type");
  const { rows, total, pending, pageSize } = await listEvents(ctx, { type: type && type in EVENTS ? type : undefined, page });
  const tz = ctx.settings.timezone;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Event stream</CardTitle>
        <CardDescription>
          Every change that can notify someone, trigger a rule or reach a webhook is recorded here in the same transaction as the change itself. {pending > 0 ? `${pending} event(s) are waiting for the scheduler.` : "Nothing is waiting."} You see only events about projects you can read.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FilterBar filters={[{ key: "type", label: "Event", allLabel: "Any event", options: EVENT_TYPES.map((t) => ({ value: t, label: EVENTS[t].label })) }]} />
        {rows.length === 0 ? (
          <EmptyState title="No events" description="Events appear as people change projects, work items, governance records and timesheets." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead>State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap">{formatDateTime(e.created_at, tz)}</TableCell>
                  <TableCell>{eventLabel(e.event_type)}</TableCell>
                  <TableCell className="max-w-md truncate text-sm text-muted-foreground">{summarizeEvent(e.event_type, (e.payload ?? {}) as Record<string, unknown>)}</TableCell>
                  <TableCell>
                    {e.processed_at ? <Badge variant="secondary">Processed</Badge> : e.error ? <Badge variant="secondary" className="bg-health-red/15" title={e.error}>Retrying ({e.attempts})</Badge> : <Badge variant="outline">Waiting</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pagination page={page} pageSize={pageSize} total={total} hrefForPage={(p) => withParams("/automation/events", { type }, { page: String(p) })} />
      </CardContent>
    </Card>
  );
}
