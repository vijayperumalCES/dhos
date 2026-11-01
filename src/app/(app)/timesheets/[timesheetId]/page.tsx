import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TimesheetStatusBadge } from "@/components/workforce/badges";
import { ReviewControls } from "@/components/workforce/review-controls";
import { TimesheetGrid } from "@/components/workforce/timesheet-grid";
import { requireOrgContext } from "@/lib/auth/org-context";
import { getPeople, getTimesheetById, listHolidays, listTimeEntries, personLabel, reviewableIds } from "@/lib/data/workforce";
import { addDaysToDate } from "@/lib/domain/time";
import { formatDate, formatDateTime } from "@/lib/format";
import { uuid } from "@/lib/validation/common";

export const metadata: Metadata = { title: "Timesheet" };

export default async function TimesheetDetailPage({ params }: PageProps<"/timesheets/[timesheetId]">) {
  const { timesheetId } = await params;
  if (!uuid.safeParse(timesheetId).success) notFound();
  const ctx = await requireOrgContext();
  // RLS decides visibility: the owner, their manager and timesheet.read_all holders.
  const sheet = await getTimesheetById(timesheetId);
  if (!sheet) notFound();

  const people = await getPeople(ctx);
  const weekEnd = addDaysToDate(sheet.week_start, 6);
  const [entries, holidayRows] = await Promise.all([listTimeEntries(sheet.id), listHolidays(ctx, sheet.week_start, weekEnd)]);
  const name = personLabel(people, sheet.membership_id);
  const canReview = sheet.status === "submitted" && reviewableIds(ctx, people, "timesheet.approve").has(sheet.membership_id);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={`${name} · week of ${formatDate(sheet.week_start)}`}
        breadcrumbs={[{ label: "Timesheets", href: `/timesheets?week=${sheet.week_start}` }, { label: name }]}
        meta={<TimesheetStatusBadge status={sheet.status} />}
        actions={canReview && <ReviewControls kind="timesheet" id={sheet.id} subject={`timesheet for ${name}`} />}
      />
      <Card className="pb-0">
        <CardHeader>
          <CardTitle>
            {formatDate(sheet.week_start)} – {formatDate(weekEnd)}
          </CardTitle>
          <CardDescription>
            {sheet.submitted_at ? `Submitted ${formatDateTime(sheet.submitted_at, ctx.settings.timezone)}` : "Not submitted yet"}
            {sheet.reviewed_at &&
              ` · reviewed by ${personLabel(people, sheet.reviewer_id)} ${formatDateTime(sheet.reviewed_at, ctx.settings.timezone)}`}
            {sheet.review_note && ` · “${sheet.review_note}”`}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <TimesheetGrid weekStart={sheet.week_start} entries={entries} holidays={new Map(holidayRows.map((h) => [h.holiday_date, h.name]))} />
        </CardContent>
      </Card>
    </div>
  );
}
