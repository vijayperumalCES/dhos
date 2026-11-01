import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import { AccessDenied, EmptyState } from "@/components/common/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RequestStatusBadge } from "@/components/workforce/badges";
import { ActionButton, ReviewControls } from "@/components/workforce/review-controls";
import { cancelLeave } from "@/lib/actions/leave";
import { requireOrgContext } from "@/lib/auth/org-context";
import {
  getLeaveBalances,
  getLeaveConflicts,
  getPeople,
  getTeamAvailability,
  listLeaveRequests,
  listLeaveTypes,
  personLabel,
  reviewableIds,
  type LeaveRequestRow,
} from "@/lib/data/workforce";
import { addDaysToDate, todayInTimeZone } from "@/lib/domain/time";
import { daysInRange, isoWeekday } from "@/lib/domain/workforce";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import { LeaveRequestDialog } from "./leave-controls";

export const metadata: Metadata = { title: "Leave" };

const AVAILABILITY_DAYS = 28;

function formatDays(n: number) {
  return `${Number.isInteger(n) ? n : n.toFixed(1)} ${n === 1 ? "day" : "days"}`;
}

function dateRange(r: Pick<LeaveRequestRow, "start_date" | "end_date" | "half_day">) {
  if (r.half_day) return `${formatDate(r.start_date)} (half day)`;
  return r.start_date === r.end_date ? formatDate(r.start_date) : `${formatDate(r.start_date)} – ${formatDate(r.end_date)}`;
}

export default async function LeavePage() {
  const ctx = await requireOrgContext();
  const p = ctx.permissions;
  if (!p.any("workforce.self", "hr.read")) return <AccessDenied what="leave" />;

  const today = todayInTimeZone(new Date(), ctx.settings.timezone);
  const year = Number(today.slice(0, 4));
  const self = p.has("workforce.self");
  const seesAvailability = p.any("org.members.read", "team.read");
  const availabilityTo = addDaysToDate(today, AVAILABILITY_DAYS - 1);
  const people = await getPeople(ctx);
  const reviewable = reviewableIds(ctx, people, "hr.manage");

  const [types, balances, mine, pending, availability] = await Promise.all([
    listLeaveTypes(ctx),
    self ? getLeaveBalances(ctx, ctx.membershipId, year) : Promise.resolve([]),
    self ? listLeaveRequests(ctx, { membershipId: ctx.membershipId, limit: 20 }) : Promise.resolve([]),
    reviewable.size > 0 ? listLeaveRequests(ctx, { status: ["pending"] }) : Promise.resolve([]),
    seesAvailability ? getTeamAvailability(ctx, today, availabilityTo) : Promise.resolve([]),
  ]);
  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const approvals = pending.filter((r) => reviewable.has(r.membership_id)).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const conflicts = await getLeaveConflicts(approvals.map((r) => r.id));

  const days = Array.from({ length: daysInRange(today, availabilityTo) }, (_, i) => addDaysToDate(today, i));
  const holidays = new Map(availability.filter((a) => a.kind === "holiday").map((a) => [a.day, a.label]));
  const away = new Map<string, Map<string, boolean>>();
  for (const a of availability) {
    if (a.kind !== "leave" || !a.membership_id) continue;
    if (!away.has(a.membership_id)) away.set(a.membership_id, new Map());
    away.get(a.membership_id)!.set(a.day, a.half_day);
  }
  const awayRows = [...away.keys()].sort((a, b) => personLabel(people, a).localeCompare(personLabel(people, b)));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Leave"
        description="Requests count working days on your calendar, excluding holidays. Managers approve; HR can act for anyone."
        actions={
          self && (
            <LeaveRequestDialog
              today={today}
              types={types.map((t) => ({ value: t.id, label: t.requires_approval ? t.name : `${t.name} (recorded without approval)` }))}
            />
          )
        }
      />

      {self && (
        <Card>
          <CardHeader>
            <CardTitle>My balances · {year}</CardTitle>
            <CardDescription>Allowances are granted once a year. Pending requests are held against the balance.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {balances.map((b) => (
              <div key={b.leaveTypeId} className="rounded-lg border p-3">
                <p className="text-sm text-muted-foreground">{b.name}</p>
                <p className="text-2xl font-semibold tabular-nums">{b.remaining === null ? formatDays(b.used) : formatDays(b.remaining)}</p>
                <p className="text-xs text-muted-foreground">
                  {b.granted === null
                    ? "taken · not limited"
                    : `left of ${formatDays(b.granted)} · ${formatDays(b.used)} taken${b.pending ? ` · ${formatDays(b.pending)} pending` : ""}`}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {approvals.length > 0 && (
        <Card className="pb-0">
          <CardHeader>
            <CardTitle>Requests to review</CardTitle>
            <CardDescription>Milestones due during the leave are flagged for projects you can see.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Person</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead className="hidden md:table-cell">Reason</TableHead>
                  <TableHead className="pr-6 text-right">Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvals.map((r) => {
                  const hits = conflicts.get(r.id) ?? [];
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="pl-6 font-medium">{personLabel(people, r.membership_id)}</TableCell>
                      <TableCell>{typeName.get(r.leave_type_id) ?? "Leave"}</TableCell>
                      <TableCell>
                        <div className="tabular-nums">
                          {dateRange(r)} · {formatDays(r.days)}
                        </div>
                        {hits.map((h, i) => (
                          <div key={i} className="mt-1 flex items-center gap-1 text-xs text-health-red">
                            <AlertTriangle className="size-3" aria-hidden />
                            <span>
                              {h.project_name}: {h.milestone_name} due {formatDate(h.due_date)}
                            </span>
                          </div>
                        ))}
                      </TableCell>
                      <TableCell className="hidden max-w-xs truncate md:table-cell">{r.reason ?? "—"}</TableCell>
                      <TableCell className="pr-6">
                        <ReviewControls kind="leave" id={r.id} subject={`leave for ${personLabel(people, r.membership_id)}`} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {seesAvailability && (
        <Card>
          <CardHeader>
            <CardTitle>Team availability</CardTitle>
            <CardDescription>
              Who is away in the next four weeks. Only &ldquo;on leave&rdquo; is shown; leave types and reasons stay private.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {awayRows.length === 0 && holidays.size === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody is away in the next four weeks.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-0.5 text-xs">
                  <thead>
                    <tr>
                      <th className="sticky left-0 bg-card pr-2 text-left font-medium">Person</th>
                      {days.map((d) => (
                        <th key={d} className={cn("min-w-6 text-center font-normal", isoWeekday(d) >= 6 && "text-muted-foreground")}>
                          <div>{d.slice(8)}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {holidays.size > 0 && (
                      <tr>
                        <td className="sticky left-0 bg-card pr-2 text-muted-foreground">Holidays</td>
                        {days.map((d) => (
                          <td key={d} title={holidays.get(d)} className={cn("h-6 rounded-sm", holidays.has(d) ? "bg-chart-2/40" : "bg-muted/40")}>
                            <span className="sr-only">{holidays.get(d) ?? ""}</span>
                          </td>
                        ))}
                      </tr>
                    )}
                    {awayRows.map((m) => (
                      <tr key={m}>
                        <td className="sticky left-0 bg-card pr-2 whitespace-nowrap">{personLabel(people, m)}</td>
                        {days.map((d) => {
                          const half = away.get(m)!.get(d);
                          return (
                            <td
                              key={d}
                              title={half === undefined ? undefined : half ? "On leave (half day)" : "On leave"}
                              className={cn(
                                "h-6 rounded-sm",
                                half === undefined ? (isoWeekday(d) >= 6 ? "bg-muted/20" : "bg-muted/40") : half ? "bg-primary/35" : "bg-primary/70",
                              )}
                            >
                              <span className="sr-only">{half === undefined ? "" : half ? "On leave half day" : "On leave"}</span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-muted-foreground">
                  Starting {formatDate(today)}. Darker cells are full days, lighter cells half days.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {self && (
        <Card className="pb-0">
          <CardHeader>
            <CardTitle>My requests</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {mine.length === 0 ? (
              <EmptyState className="mx-6 mb-6" title="No leave requested" description="Requests you make appear here with their status." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Type</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Days</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-24 pr-6">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mine.map((r) => {
                    const cancellable = r.status === "pending" || (r.status === "approved" && r.start_date > today);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="pl-6">{typeName.get(r.leave_type_id) ?? "Leave"}</TableCell>
                        <TableCell className="tabular-nums">
                          {dateRange(r)}
                          {r.review_note && <div className="text-xs text-muted-foreground">“{r.review_note}”</div>}
                        </TableCell>
                        <TableCell className="tabular-nums">{r.days}</TableCell>
                        <TableCell>
                          <RequestStatusBadge status={r.status} />
                        </TableCell>
                        <TableCell className="pr-6 text-right">
                          {cancellable && (
                            <ActionButton
                              action={cancelLeave.bind(null, r.id, "")}
                              label="Cancel"
                              variant="ghost"
                              confirm="Cancel this leave request?"
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
