import "server-only";

import { cache } from "react";

import type { OrgContext } from "@/lib/auth/org-context";
import { addDaysToDate, type DateString } from "@/lib/domain/time";
import type { RequestStatus, TimesheetStatus } from "@/lib/domain/workforce";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { listMembers } from "./members";

// ---------------------------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------------------------

export type Person = { id: string; name: string; jobTitle: string | null; managerId: string | null; departmentName: string | null };

/**
 * Names and reporting lines for the organization. Workforce tables carry only membership ids;
 * names come from the directory, which every internal role can read (org.members.read).
 */
export const getPeople = cache(async (ctx: OrgContext): Promise<Map<string, Person>> => {
  const members = await listMembers(ctx);
  const map = new Map<string, Person>(
    members.map((m) => [
      m.id,
      { id: m.id, name: m.displayName, jobTitle: m.jobTitle, managerId: m.managerMembershipId, departmentName: m.departmentName },
    ]),
  );
  if (!map.has(ctx.membershipId)) {
    map.set(ctx.membershipId, { id: ctx.membershipId, name: ctx.user.displayName, jobTitle: null, managerId: null, departmentName: null });
  }
  return map;
});

export function personLabel(people: Map<string, Person>, id: string | null | undefined): string {
  return (id && people.get(id)?.name) || "Unknown member";
}

/** Members whose requests the caller can review: direct reports, or everyone else with the given permission. */
export function reviewableIds(ctx: OrgContext, people: Map<string, Person>, overridePermission: "hr.manage" | "timesheet.approve"): Set<string> {
  const all = ctx.permissions.has(overridePermission);
  return new Set(
    [...people.values()].filter((p) => p.id !== ctx.membershipId && (all || p.managerId === ctx.membershipId)).map((p) => p.id),
  );
}

export function hasDirectReports(ctx: OrgContext, people: Map<string, Person>): boolean {
  return [...people.values()].some((p) => p.managerId === ctx.membershipId);
}

// ---------------------------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------------------------

export async function listAttendance(ctx: OrgContext, opts: { membershipId?: string; from: DateString; to: DateString }) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("attendance_records")
    .select("id, membership_id, work_date, check_in_at, check_out_at, work_mode, note, source")
    .eq("organization_id", ctx.organization.id)
    .gte("work_date", opts.from)
    .lte("work_date", opts.to)
    .order("work_date", { ascending: false });
  if (opts.membershipId) query = query.eq("membership_id", opts.membershipId);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load attendance: ${error.message}`);
  return data ?? [];
}

export async function listCorrections(ctx: OrgContext, opts: { status?: RequestStatus; membershipId?: string; limit?: number }) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("attendance_corrections")
    .select("id, membership_id, work_date, check_in_at, check_out_at, work_mode, reason, status, reviewer_id, reviewed_at, review_note, created_at")
    .eq("organization_id", ctx.organization.id)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.status) query = query.eq("status", opts.status);
  if (opts.membershipId) query = query.eq("membership_id", opts.membershipId);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load attendance corrections: ${error.message}`);
  return data ?? [];
}

export async function listAttendanceExceptions(ctx: OrgContext, from: DateString, to: DateString) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("attendance_exceptions", { p_org: ctx.organization.id, p_from: from, p_to: to });
  if (error) throw new Error(`Failed to load attendance exceptions: ${error.message}`);
  return (data ?? []) as { membership_id: string; work_date: string; kind: "missing" | "incomplete" }[];
}

// ---------------------------------------------------------------------------------------------
// Leave
// ---------------------------------------------------------------------------------------------

export async function listLeaveTypes(ctx: OrgContext, opts: { includeArchived?: boolean } = {}) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("leave_types")
    .select("id, name, code, is_paid, requires_approval, annual_allowance_days, position, archived_at")
    .eq("organization_id", ctx.organization.id)
    .order("position")
    .order("name");
  if (!opts.includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load leave types: ${error.message}`);
  return data ?? [];
}

export type LeaveRequestRow = {
  id: string;
  membership_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  half_day: boolean;
  days: number;
  reason: string | null;
  status: RequestStatus;
  reviewer_id: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
};

export async function listLeaveRequests(
  ctx: OrgContext,
  opts: { membershipId?: string; status?: RequestStatus[]; from?: DateString; to?: DateString; limit?: number },
): Promise<LeaveRequestRow[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("leave_requests")
    .select("id, membership_id, leave_type_id, start_date, end_date, half_day, days, reason, status, reviewer_id, reviewed_at, review_note, created_at")
    .eq("organization_id", ctx.organization.id)
    .order("start_date", { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.membershipId) query = query.eq("membership_id", opts.membershipId);
  if (opts.status) query = query.in("status", opts.status);
  if (opts.from) query = query.gte("end_date", opts.from);
  if (opts.to) query = query.lte("start_date", opts.to);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load leave requests: ${error.message}`);
  return (data ?? []).map((r) => ({ ...r, days: Number(r.days) }));
}

export type BalanceRow = {
  leaveTypeId: string;
  name: string;
  code: string;
  granted: number | null;
  used: number;
  pending: number;
  remaining: number | null;
};

/** Balances for one member and year: granted from leave_balances, used/pending from requests. */
export async function getLeaveBalances(ctx: OrgContext, membershipId: string, year: number): Promise<BalanceRow[]> {
  const supabase = await createSupabaseServerClient();
  const [types, balances, requests] = await Promise.all([
    listLeaveTypes(ctx),
    supabase.from("leave_balances").select("leave_type_id, granted_days").eq("membership_id", membershipId).eq("year", year),
    listLeaveRequests(ctx, { membershipId, status: ["approved", "pending"], from: `${year}-01-01`, to: `${year}-12-31`, limit: 500 }),
  ]);
  if (balances.error) throw new Error(`Failed to load leave balances: ${balances.error.message}`);
  const granted = new Map((balances.data ?? []).map((b) => [b.leave_type_id, Number(b.granted_days)]));
  return types.map((t) => {
    const mine = requests.filter((r) => r.leave_type_id === t.id && r.start_date.startsWith(String(year)));
    const used = mine.filter((r) => r.status === "approved").reduce((s, r) => s + r.days, 0);
    const pending = mine.filter((r) => r.status === "pending").reduce((s, r) => s + r.days, 0);
    const tracked = t.annual_allowance_days !== null;
    const g = tracked ? (granted.get(t.id) ?? 0) : null;
    return { leaveTypeId: t.id, name: t.name, code: t.code, granted: g, used, pending, remaining: g === null ? null : g - used - pending };
  });
}

export async function listAllBalances(ctx: OrgContext, year: number) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("leave_balances")
    .select("membership_id, leave_type_id, granted_days")
    .eq("organization_id", ctx.organization.id)
    .eq("year", year);
  if (error) throw new Error(`Failed to load leave balances: ${error.message}`);
  return (data ?? []).map((b) => ({ ...b, granted_days: Number(b.granted_days) }));
}

export type AvailabilityRow = { membership_id: string | null; day: string; kind: "leave" | "holiday"; half_day: boolean; label: string };

export async function getTeamAvailability(ctx: OrgContext, from: DateString, to: DateString): Promise<AvailabilityRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("team_availability", { p_org: ctx.organization.id, p_from: from, p_to: to });
  if (error) throw new Error(`Failed to load availability: ${error.message}`);
  return (data ?? []) as AvailabilityRow[];
}

export async function getLeaveConflicts(requestIds: string[]) {
  if (requestIds.length === 0) return new Map<string, { project_name: string; milestone_name: string; due_date: string }[]>();
  const supabase = await createSupabaseServerClient();
  const results = await Promise.all(requestIds.map((id) => supabase.rpc("leave_milestone_conflicts", { p_request: id })));
  return new Map(
    requestIds.map((id, i) => [id, (results[i].data ?? []) as { project_name: string; milestone_name: string; due_date: string }[]]),
  );
}

// ---------------------------------------------------------------------------------------------
// Calendars
// ---------------------------------------------------------------------------------------------

export async function listCalendars(ctx: OrgContext, opts: { includeArchived?: boolean } = {}) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("work_calendars")
    .select("id, name, working_days, hours_per_day, is_default, archived_at, holidays(id, holiday_date, name)")
    .eq("organization_id", ctx.organization.id)
    .order("is_default", { ascending: false })
    .order("name");
  if (!opts.includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load calendars: ${error.message}`);
  return (data ?? []).map((c) => ({
    ...c,
    hours_per_day: Number(c.hours_per_day),
    holidays: [...c.holidays].sort((a, b) => a.holiday_date.localeCompare(b.holiday_date)),
  }));
}

export async function listMemberCalendars(ctx: OrgContext) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("id, work_calendar_id")
    .eq("organization_id", ctx.organization.id)
    .eq("status", "active");
  if (error) throw new Error(`Failed to load member calendars: ${error.message}`);
  return new Map((data ?? []).map((m) => [m.id, m.work_calendar_id]));
}

/** Holidays of the default calendar in a range (used for timesheet and leave calendars). */
export async function listHolidays(ctx: OrgContext, from: DateString, to: DateString) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("holidays")
    .select("holiday_date, name, work_calendars!inner(is_default)")
    .eq("organization_id", ctx.organization.id)
    .eq("work_calendars.is_default", true)
    .gte("holiday_date", from)
    .lte("holiday_date", to)
    .order("holiday_date");
  if (error) throw new Error(`Failed to load holidays: ${error.message}`);
  return (data ?? []).map(({ holiday_date, name }) => ({ holiday_date, name }));
}

// ---------------------------------------------------------------------------------------------
// Timesheets
// ---------------------------------------------------------------------------------------------

export type TimeEntryRow = {
  id: string;
  entry_date: string;
  category: "delivery" | "internal" | "training" | "presales";
  project_id: string | null;
  work_item_id: string | null;
  hours: number;
  note: string | null;
  project: { code: string; name: string } | null;
  work_item: { key: string; title: string } | null;
};

export async function getTimesheet(ctx: OrgContext, membershipId: string, weekStart: DateString) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("timesheets")
    .select("id, membership_id, week_start, status, submitted_at, reviewer_id, reviewed_at, review_note")
    .eq("membership_id", membershipId)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error) throw new Error(`Failed to load timesheet: ${error.message}`);
  return data;
}

export async function getTimesheetById(timesheetId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("timesheets")
    .select("id, membership_id, week_start, status, submitted_at, reviewer_id, reviewed_at, review_note")
    .eq("id", timesheetId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load timesheet: ${error.message}`);
  return data;
}

export async function listTimeEntries(timesheetId: string): Promise<TimeEntryRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("time_entries")
    .select("id, entry_date, category, project_id, work_item_id, hours, note, project:projects(code, name), work_item:work_items(key, title)")
    .eq("timesheet_id", timesheetId)
    .order("entry_date")
    .order("created_at");
  if (error) throw new Error(`Failed to load time entries: ${error.message}`);
  return (data ?? []).map((e) => ({ ...e, hours: Number(e.hours) }));
}

export type ComplianceRow = { membership_id: string; timesheet_id: string | null; status: TimesheetStatus; total_hours: number; submitted_at: string | null };

export async function getTimesheetCompliance(ctx: OrgContext, weekStart: DateString): Promise<ComplianceRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("timesheet_compliance", { p_org: ctx.organization.id, p_week_start: weekStart });
  if (error) throw new Error(`Failed to load timesheet compliance: ${error.message}`);
  return ((data ?? []) as ComplianceRow[]).map((r) => ({ ...r, total_hours: Number(r.total_hours) }));
}

export async function listSubmittedTimesheets(ctx: OrgContext) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("timesheets")
    .select("id, membership_id, week_start, submitted_at, time_entries(hours)")
    .eq("organization_id", ctx.organization.id)
    .eq("status", "submitted")
    .order("week_start");
  if (error) throw new Error(`Failed to load submitted timesheets: ${error.message}`);
  return (data ?? []).map(({ time_entries, ...t }) => ({ ...t, total_hours: time_entries.reduce((s, e) => s + Number(e.hours), 0) }));
}

/** Projects and open work items the caller can log time against. */
export async function listLoggableWork(ctx: OrgContext) {
  const supabase = await createSupabaseServerClient();
  const [projects, items] = await Promise.all([
    supabase.from("projects").select("id, code, name").eq("organization_id", ctx.organization.id).is("archived_at", null).order("code"),
    ctx.permissions.has("work.read")
      ? supabase
          .from("work_items")
          .select("id, key, title, project_id")
          .eq("organization_id", ctx.organization.id)
          .eq("assignee_membership_id", ctx.membershipId)
          .is("archived_at", null)
          .order("key")
          .limit(200)
      : Promise.resolve({ data: [] as { id: string; key: string; title: string; project_id: string }[], error: null }),
  ]);
  if (projects.error) throw new Error(`Failed to load projects: ${projects.error.message}`);
  if (items.error) throw new Error(`Failed to load work items: ${items.error.message}`);
  return { projects: projects.data ?? [], workItems: items.data ?? [] };
}

// ---------------------------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------------------------

export type CapacityRow = {
  membership_id: string;
  calendar_days: number;
  working_days: number;
  holiday_days: number;
  leave_days: number;
  hours_per_day: number;
  capacity_hours: number;
  allocated_hours: number;
  peak_allocation_percent: number;
  logged_hours: number;
};

export async function getCapacityOverview(ctx: OrgContext, from: DateString, to: DateString): Promise<CapacityRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("capacity_overview", { p_org: ctx.organization.id, p_from: from, p_to: to });
  if (error) throw new Error(`Failed to load capacity: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    membership_id: String(r.membership_id),
    calendar_days: Number(r.calendar_days),
    working_days: Number(r.working_days),
    holiday_days: Number(r.holiday_days),
    leave_days: Number(r.leave_days),
    hours_per_day: Number(r.hours_per_day),
    capacity_hours: Number(r.capacity_hours),
    allocated_hours: Number(r.allocated_hours),
    peak_allocation_percent: Number(r.peak_allocation_percent),
    logged_hours: Number(r.logged_hours),
  }));
}

export async function listAllocations(ctx: OrgContext, opts: { from: DateString; to: DateString; membershipId?: string; projectId?: string }) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("resource_allocations")
    .select("id, membership_id, project_id, start_date, end_date, percent, role, notes, project:projects(code, name)")
    .eq("organization_id", ctx.organization.id)
    .lte("start_date", opts.to)
    .gte("end_date", opts.from)
    .order("start_date");
  if (opts.membershipId) query = query.eq("membership_id", opts.membershipId);
  if (opts.projectId) query = query.eq("project_id", opts.projectId);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load allocations: ${error.message}`);
  return data ?? [];
}

/** Default planning window: today through the end of the 8th week. */
export function defaultPlanningRange(today: DateString) {
  return { from: today, to: addDaysToDate(today, 55) };
}
