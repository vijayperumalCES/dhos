import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import { AccessDenied, EmptyState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RequestStatusBadge } from "@/components/workforce/badges";
import { ActionButton, ReviewControls } from "@/components/workforce/review-controls";
import { cancelCorrection } from "@/lib/actions/attendance";
import { requireOrgContext } from "@/lib/auth/org-context";
import {
  getPeople,
  hasDirectReports,
  listAttendance,
  listAttendanceExceptions,
  listCorrections,
  personLabel,
  reviewableIds,
} from "@/lib/data/workforce";
import { addDaysToDate, todayInTimeZone } from "@/lib/domain/time";
import { WORK_MODE_LABELS, formatDuration, timeInZone, workedMinutes } from "@/lib/domain/workforce";
import { formatDate } from "@/lib/format";

import { CorrectionDialog, TodayControls } from "./attendance-controls";

export const metadata: Metadata = { title: "Attendance" };

export default async function AttendancePage() {
  const ctx = await requireOrgContext();
  const p = ctx.permissions;
  if (!p.any("workforce.self", "hr.read")) return <AccessDenied what="attendance" />;

  const tz = ctx.settings.timezone;
  const today = todayInTimeZone(new Date(), tz);
  const from = addDaysToDate(today, -13);
  const people = await getPeople(ctx);
  const self = p.has("workforce.self");
  const seesTeam = p.has("hr.read") || hasDirectReports(ctx, people);
  const reviewable = reviewableIds(ctx, people, "hr.manage");

  const [mine, myCorrections, pendingCorrections, exceptions] = await Promise.all([
    self ? listAttendance(ctx, { membershipId: ctx.membershipId, from, to: today }) : Promise.resolve([]),
    self ? listCorrections(ctx, { membershipId: ctx.membershipId, limit: 10 }) : Promise.resolve([]),
    reviewable.size > 0 ? listCorrections(ctx, { status: "pending" }) : Promise.resolve([]),
    seesTeam ? listAttendanceExceptions(ctx, from, today) : Promise.resolve([]),
  ]);
  const todayRecord = mine.find((r) => r.work_date === today) ?? null;
  const approvals = pendingCorrections.filter((c) => reviewable.has(c.membership_id));
  const teamExceptions = exceptions.filter((e) => e.membership_id !== ctx.membershipId);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Attendance"
        description={`Presence records in ${tz}. Attendance is kept apart from capacity: planning uses calendars, holidays and approved leave.`}
        actions={self && <CorrectionDialog today={today} />}
      />

      {self && (
        <Card>
          <CardHeader>
            <CardTitle>Today · {formatDate(today)}</CardTitle>
            <CardDescription>
              {!todayRecord
                ? "You haven't checked in yet."
                : todayRecord.check_out_at
                  ? `Checked in ${timeInZone(todayRecord.check_in_at, tz)}, out ${timeInZone(todayRecord.check_out_at, tz)} · ${formatDuration(workedMinutes(todayRecord.check_in_at, todayRecord.check_out_at))}`
                  : `Checked in at ${timeInZone(todayRecord.check_in_at, tz)} (${WORK_MODE_LABELS[todayRecord.work_mode]}).`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TodayControls state={!todayRecord ? "out" : todayRecord.check_out_at ? "done" : "in"} />
          </CardContent>
        </Card>
      )}

      {approvals.length > 0 && (
        <Card className="pb-0">
          <CardHeader>
            <CardTitle>Corrections to review</CardTitle>
            <CardDescription>Requests from your reports{p.has("hr.manage") ? " and, as HR, everyone else" : ""}.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Person</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Times</TableHead>
                  <TableHead className="hidden md:table-cell">Reason</TableHead>
                  <TableHead className="pr-6 text-right">Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvals.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="pl-6 font-medium">{personLabel(people, c.membership_id)}</TableCell>
                    <TableCell className="tabular-nums">{formatDate(c.work_date)}</TableCell>
                    <TableCell className="tabular-nums">
                      {timeInZone(c.check_in_at, tz)}–{timeInZone(c.check_out_at, tz)} · {WORK_MODE_LABELS[c.work_mode]}
                    </TableCell>
                    <TableCell className="hidden max-w-xs truncate md:table-cell">{c.reason}</TableCell>
                    <TableCell className="pr-6">
                      <ReviewControls kind="correction" id={c.id} subject={`correction for ${personLabel(people, c.membership_id)}`} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {self && (
        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="pb-0 lg:col-span-3">
            <CardHeader>
              <CardTitle>My last two weeks</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {mine.length === 0 ? (
                <EmptyState className="mx-6 mb-6" title="No attendance yet" description="Check in to start recording." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Date</TableHead>
                      <TableHead>In</TableHead>
                      <TableHead>Out</TableHead>
                      <TableHead>Worked</TableHead>
                      <TableHead className="pr-6">Mode</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mine.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="pl-6 tabular-nums">
                          {formatDate(r.work_date)}
                          {r.source === "correction" && (
                            <Badge variant="outline" className="ml-2 text-muted-foreground">
                              Corrected
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums">{timeInZone(r.check_in_at, tz)}</TableCell>
                        <TableCell className="tabular-nums">{r.check_out_at ? timeInZone(r.check_out_at, tz) : "—"}</TableCell>
                        <TableCell className="tabular-nums">{formatDuration(workedMinutes(r.check_in_at, r.check_out_at))}</TableCell>
                        <TableCell className="pr-6">{WORK_MODE_LABELS[r.work_mode]}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>My corrections</CardTitle>
              <CardDescription>Corrections for the last 60 days go to your manager.</CardDescription>
            </CardHeader>
            <CardContent>
              {myCorrections.length === 0 ? (
                <p className="text-sm text-muted-foreground">No corrections requested.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {myCorrections.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div>
                        <div className="font-medium tabular-nums">
                          {formatDate(c.work_date)} · {timeInZone(c.check_in_at, tz)}–{timeInZone(c.check_out_at, tz)}
                        </div>
                        {c.review_note && <div className="text-xs text-muted-foreground">“{c.review_note}”</div>}
                      </div>
                      <div className="flex items-center gap-2">
                        <RequestStatusBadge status={c.status} />
                        {c.status === "pending" && (
                          <ActionButton action={cancelCorrection.bind(null, c.id)} label="Withdraw" variant="ghost" />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {seesTeam && (
        <Card className="pb-0">
          <CardHeader>
            <CardTitle>Team exceptions</CardTitle>
            <CardDescription>
              Working days in the last two weeks with no check-in or no check-out. Approved leave and holidays are excluded.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {teamExceptions.length === 0 ? (
              <EmptyState className="mx-6 mb-6" title="No exceptions" description="Everyone you can see has complete attendance." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Person</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="pr-6">Exception</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamExceptions.map((e) => (
                    <TableRow key={`${e.membership_id}-${e.work_date}-${e.kind}`}>
                      <TableCell className="pl-6 font-medium">{personLabel(people, e.membership_id)}</TableCell>
                      <TableCell className="tabular-nums">{formatDate(e.work_date)}</TableCell>
                      <TableCell className="pr-6">{e.kind === "missing" ? "No check-in" : "No check-out"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
