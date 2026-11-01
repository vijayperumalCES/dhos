import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/common/page-header";
import { AccessDenied, EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TimesheetStatusBadge } from "@/components/workforce/badges";
import { ActionButton, ReviewControls } from "@/components/workforce/review-controls";
import { TimesheetGrid } from "@/components/workforce/timesheet-grid";
import { recallTimesheet, submitTimesheet } from "@/lib/actions/timesheets";
import { requireOrgContext } from "@/lib/auth/org-context";
import {
  getPeople,
  getTimesheet,
  getTimesheetCompliance,
  hasDirectReports,
  listHolidays,
  listLoggableWork,
  listSubmittedTimesheets,
  listTimeEntries,
  personLabel,
  reviewableIds,
} from "@/lib/data/workforce";
import { addDaysToDate, todayInTimeZone } from "@/lib/domain/time";
import { canStartWeek, formatHours, isMonday, weekStartOf } from "@/lib/domain/workforce";
import { formatDate } from "@/lib/format";

import { EntryList, TimeEntryDialog } from "./timesheet-controls";

export const metadata: Metadata = { title: "Timesheets" };

export default async function TimesheetsPage({ searchParams }: PageProps<"/timesheets">) {
  const ctx = await requireOrgContext();
  const p = ctx.permissions;
  if (!p.any("workforce.self", "timesheet.read_all", "timesheet.approve")) return <AccessDenied what="timesheets" />;

  const sp = await searchParams;
  const today = todayInTimeZone(new Date(), ctx.settings.timezone);
  const current = weekStartOf(today);
  const requested = typeof sp.week === "string" && isMonday(sp.week) ? sp.week : current;
  const week = canStartWeek(requested, today) ? requested : current;
  const weekEnd = addDaysToDate(week, 6);
  const self = p.has("workforce.self");
  const people = await getPeople(ctx);
  const reviewable = reviewableIds(ctx, people, "timesheet.approve");
  const seesCompliance = p.has("timesheet.read_all") || hasDirectReports(ctx, people);

  const [sheet, holidayRows, work, submitted, compliance] = await Promise.all([
    self ? getTimesheet(ctx, ctx.membershipId, week) : Promise.resolve(null),
    listHolidays(ctx, week, weekEnd),
    self ? listLoggableWork(ctx) : Promise.resolve({ projects: [], workItems: [] }),
    reviewable.size > 0 ? listSubmittedTimesheets(ctx) : Promise.resolve([]),
    seesCompliance ? getTimesheetCompliance(ctx, week) : Promise.resolve([]),
  ]);
  const entries = sheet ? await listTimeEntries(sheet.id) : [];
  const holidays = new Map(holidayRows.map((h) => [h.holiday_date, h.name]));
  const editable = !sheet || sheet.status === "draft" || sheet.status === "rejected";
  const approvals = submitted.filter((t) => reviewable.has(t.membership_id));
  const teamCompliance = compliance.filter((c) => c.membership_id !== ctx.membershipId);
  const weekHref = (w: string) => `/timesheets?week=${w}`;
  const nextWeek = addDaysToDate(week, 7);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Timesheets"
        description="Weekly effort by project, work item or internal category. Submitted weeks lock until approved or returned."
        actions={
          <div className="flex items-center gap-1">
            <Button asChild size="icon" variant="outline" aria-label="Previous week">
              <Link href={weekHref(addDaysToDate(week, -7))}>
                <ChevronLeft className="size-4" />
              </Link>
            </Button>
            <span className="min-w-40 text-center text-sm font-medium tabular-nums">
              {formatDate(week)} – {formatDate(weekEnd)}
            </span>
            {canStartWeek(nextWeek, today) ? (
              <Button asChild size="icon" variant="outline" aria-label="Next week">
                <Link href={weekHref(nextWeek)}>
                  <ChevronRight className="size-4" />
                </Link>
              </Button>
            ) : (
              <Button size="icon" variant="outline" aria-label="Next week" disabled>
                <ChevronRight className="size-4" />
              </Button>
            )}
            {week !== current && (
              <Button asChild size="sm" variant="ghost">
                <Link href="/timesheets">This week</Link>
              </Button>
            )}
          </div>
        }
      />

      {self && (
        <Card className="pb-0">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2">
                My week <TimesheetStatusBadge status={sheet?.status ?? "missing"} />
              </CardTitle>
              <CardDescription>
                {sheet?.status === "rejected" && sheet.review_note
                  ? `Returned: “${sheet.review_note}”`
                  : sheet?.status === "submitted"
                    ? `Submitted ${formatDate(sheet.submitted_at?.slice(0, 10))}. Recall it to make changes.`
                    : sheet?.status === "approved"
                      ? "Approved. This week is closed."
                      : "Log time as you go, then submit at the end of the week."}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {editable && (
                <TimeEntryDialog
                  weekStart={week}
                  defaultDate={today >= week && today <= weekEnd ? today : week}
                  projects={work.projects.map((pr) => ({ value: pr.id, label: `${pr.code} · ${pr.name}` }))}
                  workItems={work.workItems.map((w) => ({ value: w.id, label: `${w.key} ${w.title}`, projectId: w.project_id }))}
                />
              )}
              {sheet && editable && entries.length > 0 && (
                <ActionButton action={submitTimesheet.bind(null, sheet.id)} label="Submit week" pendingLabel="Submitting…" variant="default" />
              )}
              {sheet?.status === "submitted" && <ActionButton action={recallTimesheet.bind(null, sheet.id)} label="Recall" pendingLabel="Recalling…" />}
            </div>
          </CardHeader>
          <CardContent className="space-y-4 px-0">
            <TimesheetGrid weekStart={week} entries={entries} holidays={holidays} />
            {editable && entries.length > 0 && (
              <EntryList
                weekStart={week}
                entries={entries}
                projects={work.projects.map((pr) => ({ value: pr.id, label: `${pr.code} · ${pr.name}` }))}
                workItems={work.workItems.map((w) => ({ value: w.id, label: `${w.key} ${w.title}`, projectId: w.project_id }))}
              />
            )}
          </CardContent>
        </Card>
      )}

      {approvals.length > 0 && (
        <Card className="pb-0">
          <CardHeader>
            <CardTitle>Timesheets to approve</CardTitle>
            <CardDescription>All submitted weeks waiting for you, oldest first.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Person</TableHead>
                  <TableHead>Week</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="pr-6 text-right">Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvals.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="pl-6 font-medium">
                      <Link href={`/timesheets/${t.id}`} className="hover:underline">
                        {personLabel(people, t.membership_id)}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">{formatDate(t.week_start)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatHours(t.total_hours)}</TableCell>
                    <TableCell className="pr-6">
                      <ReviewControls kind="timesheet" id={t.id} subject={`timesheet for ${personLabel(people, t.membership_id)}`} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {seesCompliance && (
        <Card className="pb-0">
          <CardHeader>
            <CardTitle>Team status for this week</CardTitle>
            <CardDescription>
              {teamCompliance.filter((c) => c.status === "missing" || c.status === "draft").length} of {teamCompliance.length} not yet submitted.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {teamCompliance.length === 0 ? (
              <EmptyState className="mx-6 mb-6" title="Nobody to report on" description="People who log time appear here." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Person</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead className="pr-6 text-right">Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamCompliance.map((c) => (
                    <TableRow key={c.membership_id}>
                      <TableCell className="pl-6 font-medium">
                        {c.timesheet_id ? (
                          <Link href={`/timesheets/${c.timesheet_id}`} className="hover:underline">
                            {personLabel(people, c.membership_id)}
                          </Link>
                        ) : (
                          personLabel(people, c.membership_id)
                        )}
                      </TableCell>
                      <TableCell>
                        <TimesheetStatusBadge status={c.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatHours(c.total_hours)}</TableCell>
                      <TableCell className="pr-6 text-right tabular-nums">{c.submitted_at ? formatDate(c.submitted_at.slice(0, 10)) : "—"}</TableCell>
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
