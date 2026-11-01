import type { Metadata } from "next";
import Link from "next/link";

import { AccessDenied } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionButton } from "@/components/workforce/review-controls";
import { deleteHoliday, grantAnnualAllowances, setCalendarArchived, setDefaultCalendar } from "@/lib/actions/workforce-settings";
import { requireOrgContext } from "@/lib/auth/org-context";
import { getPeople, listAllBalances, listCalendars, listLeaveTypes, listMemberCalendars } from "@/lib/data/workforce";
import { todayInTimeZone } from "@/lib/domain/time";
import { WEEKDAY_LABELS } from "@/lib/domain/workforce";
import { formatDate } from "@/lib/format";

import { BalanceEditor, CalendarDialog, HolidayForm, LeaveTypeActions, LeaveTypeDialog, MemberCalendarSelect } from "./workforce-controls";

export const metadata: Metadata = { title: "Workforce settings" };

export default async function WorkforceSettingsPage({ searchParams }: PageProps<"/admin/workforce">) {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("hr.manage")) return <AccessDenied what="workforce settings" />;

  const sp = await searchParams;
  const thisYear = Number(todayInTimeZone(new Date(), ctx.settings.timezone).slice(0, 4));
  const year = typeof sp.year === "string" && /^\d{4}$/.test(sp.year) && Math.abs(Number(sp.year) - thisYear) <= 1 ? Number(sp.year) : thisYear;

  const [calendars, types, people, memberCalendars, balances] = await Promise.all([
    listCalendars(ctx, { includeArchived: true }),
    listLeaveTypes(ctx, { includeArchived: true }),
    getPeople(ctx),
    listMemberCalendars(ctx),
    listAllBalances(ctx, year),
  ]);
  const active = calendars.filter((c) => !c.archived_at);
  const defaultCalendar = active.find((c) => c.is_default);
  const tracked = types.filter((t) => !t.archived_at && t.annual_allowance_days !== null);
  const granted = new Map(balances.map((b) => [`${b.membership_id}|${b.leave_type_id}`, b.granted_days]));
  const staff = [...people.values()].filter((p) => memberCalendars.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
  const calendarOptions = [
    { value: "default", label: `Organization default${defaultCalendar ? ` (${defaultCalendar.name})` : ""}` },
    ...active.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Work calendars</CardTitle>
            <CardDescription>Working days, hours per day and holidays. Leave days and capacity are counted against these.</CardDescription>
          </div>
          <CalendarDialog />
        </CardHeader>
        <CardContent className="space-y-4">
          {calendars.map((c) => (
            <div key={c.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    {c.name}
                    {c.is_default && <Badge variant="secondary">Default</Badge>}
                    {c.archived_at && (
                      <Badge variant="outline" className="text-muted-foreground">
                        Archived
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {c.working_days.map((d) => WEEKDAY_LABELS[d - 1]).join(", ")} · {c.hours_per_day} h/day
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!c.archived_at && (
                    <CalendarDialog
                      calendar={{ id: c.id, name: c.name, workingDays: c.working_days, hoursPerDay: String(c.hours_per_day) }}
                    />
                  )}
                  {!c.is_default && !c.archived_at && <ActionButton action={setDefaultCalendar.bind(null, c.id)} label="Make default" />}
                  {!c.is_default && (
                    <ActionButton action={setCalendarArchived.bind(null, c.id, !c.archived_at)} label={c.archived_at ? "Restore" : "Archive"} variant="ghost" />
                  )}
                </div>
              </div>
              {!c.archived_at && (
                <div className="mt-3 space-y-2">
                  {c.holidays.length > 0 && (
                    <ul className="divide-y text-sm">
                      {c.holidays.map((h) => (
                        <li key={h.id} className="flex items-center justify-between gap-2 py-1">
                          <span>
                            <span className="tabular-nums text-muted-foreground">{formatDate(h.holiday_date)}</span> · {h.name}
                          </span>
                          <ActionButton action={deleteHoliday.bind(null, h.id)} label="Remove" variant="ghost" />
                        </li>
                      ))}
                    </ul>
                  )}
                  <HolidayForm calendarId={c.id} />
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="pb-0">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Leave types</CardTitle>
            <CardDescription>Types without an allowance are recorded but not limited. Types that skip approval are recorded straight away.</CardDescription>
          </div>
          <LeaveTypeDialog />
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Approval</TableHead>
                <TableHead className="text-right">Allowance</TableHead>
                <TableHead className="w-12 pr-6">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {types.map((t) => (
                <TableRow key={t.id} className={t.archived_at ? "text-muted-foreground" : undefined}>
                  <TableCell className="pl-6 font-medium">
                    {t.name}
                    {t.archived_at && <span className="ml-2 text-xs">(archived)</span>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{t.code}</TableCell>
                  <TableCell>{t.is_paid ? "Paid" : "Unpaid"}</TableCell>
                  <TableCell>{t.requires_approval ? "Required" : "Not required"}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.annual_allowance_days === null ? "Not tracked" : `${t.annual_allowance_days} days`}</TableCell>
                  <TableCell className="pr-6">
                    <LeaveTypeActions
                      archived={!!t.archived_at}
                      leaveType={{
                        id: t.id,
                        name: t.name,
                        code: t.code,
                        isPaid: t.is_paid,
                        requiresApproval: t.requires_approval,
                        annualAllowanceDays: t.annual_allowance_days === null ? "" : String(t.annual_allowance_days),
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="pb-0">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Balances · {year}</CardTitle>
            <CardDescription>
              Granting adds each tracked type&apos;s allowance for people who don&apos;t have a {year} balance yet. Existing balances are kept.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {[thisYear - 1, thisYear, thisYear + 1].map((y) => (
              <Link
                key={y}
                href={`/admin/workforce?year=${y}`}
                className={`rounded-md px-2 py-1 text-sm ${y === year ? "bg-secondary font-medium" : "text-muted-foreground hover:underline"}`}
              >
                {y}
              </Link>
            ))}
            <ActionButton action={grantAnnualAllowances.bind(null, year)} label={`Grant ${year} allowances`} variant="default" />
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Person</TableHead>
                  {tracked.map((t) => (
                    <TableHead key={t.id} className="text-right">
                      {t.name}
                    </TableHead>
                  ))}
                  <TableHead className="pr-6">Calendar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="pl-6">
                      <div className="font-medium">{p.name}</div>
                      {p.jobTitle && <div className="text-xs text-muted-foreground">{p.jobTitle}</div>}
                    </TableCell>
                    {tracked.map((t) => (
                      <TableCell key={t.id} className="text-right">
                        <BalanceEditor
                          membershipId={p.id}
                          leaveTypeId={t.id}
                          year={year}
                          granted={granted.get(`${p.id}|${t.id}`) ?? null}
                          label={`${t.name} for ${p.name}`}
                        />
                      </TableCell>
                    ))}
                    <TableCell className="pr-6">
                      <MemberCalendarSelect membershipId={p.id} value={memberCalendars.get(p.id) ?? "default"} options={calendarOptions} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
