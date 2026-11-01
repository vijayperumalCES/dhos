"use server";

import { revalidatePath } from "next/cache";

import { requireOrgContext } from "@/lib/auth/org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation/common";
import { balanceSchema, calendarSchema, holidaySchema, leaveTypeSchema } from "@/lib/validation/workforce";

import { fail, fromPostgrestError, fromZodError, ok, type ActionResult } from "./result";

const DENIED = "You don't have permission to manage workforce settings.";

function revalidate() {
  revalidatePath("/admin/workforce");
  revalidatePath("/leave");
  revalidatePath("/resources");
}

export async function saveCalendar(calendarId: string | null, input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (calendarId !== null && !uuid.safeParse(calendarId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("hr.manage")) return fail(DENIED);
  const parsed = calendarSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const row = {
    name: parsed.data.name,
    working_days: [...new Set(parsed.data.workingDays)].sort(),
    hours_per_day: parsed.data.hoursPerDay,
  };
  const supabase = await createSupabaseServerClient();
  const { error } = calendarId
    ? await supabase.from("work_calendars").update(row).eq("id", calendarId)
    : await supabase.from("work_calendars").insert({ ...row, organization_id: ctx.organization.id });
  if (error) return fromPostgrestError(error, { duplicate: "A calendar with that name already exists." });

  revalidate();
  return ok(undefined, calendarId ? "Calendar updated." : "Calendar added.");
}

export async function setDefaultCalendar(calendarId: string): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(calendarId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("hr.manage")) return fail(DENIED);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_default_calendar", { p_calendar: calendarId });
  if (error) return fromPostgrestError(error);

  revalidate();
  return ok(undefined, "Default calendar changed.");
}

export async function setCalendarArchived(calendarId: string, archived: boolean): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(calendarId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("hr.manage")) return fail(DENIED);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("work_calendars")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", calendarId)
    .eq("is_default", false)
    .select("id")
    .maybeSingle();
  if (error) return fromPostgrestError(error, { duplicate: "An active calendar already has that name." });
  if (!data) return fail("The default calendar can't be archived. Make another calendar the default first.");

  revalidate();
  return ok(undefined, archived ? "Calendar archived." : "Calendar restored.");
}

export async function addHoliday(input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("hr.manage")) return fail(DENIED);
  const parsed = holidaySchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("holidays").insert({
    organization_id: ctx.organization.id,
    calendar_id: parsed.data.calendarId,
    holiday_date: parsed.data.holidayDate,
    name: parsed.data.name,
  });
  if (error) return fromPostgrestError(error, { duplicate: "That calendar already has a holiday on that date." });

  revalidate();
  return ok(undefined, "Holiday added.");
}

export async function deleteHoliday(holidayId: string): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(holidayId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("hr.manage")) return fail(DENIED);

  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase.from("holidays").delete({ count: "exact" }).eq("id", holidayId);
  if (error) return fromPostgrestError(error);
  if (!count) return fail("That holiday was not found.");

  revalidate();
  return ok(undefined, "Holiday removed.");
}

export async function saveLeaveType(leaveTypeId: string | null, input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (leaveTypeId !== null && !uuid.safeParse(leaveTypeId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("hr.manage")) return fail(DENIED);
  const parsed = leaveTypeSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const row = {
    name: parsed.data.name,
    is_paid: parsed.data.isPaid,
    requires_approval: parsed.data.requiresApproval,
    annual_allowance_days: parsed.data.annualAllowanceDays,
  };
  const supabase = await createSupabaseServerClient();
  // The code is the stable identifier for reports and is fixed once created.
  const { error } = leaveTypeId
    ? await supabase.from("leave_types").update(row).eq("id", leaveTypeId)
    : await supabase.from("leave_types").insert({ ...row, code: parsed.data.code, organization_id: ctx.organization.id });
  if (error) return fromPostgrestError(error, { duplicate: "A leave type with that code already exists." });

  revalidate();
  return ok(undefined, leaveTypeId ? "Leave type updated." : "Leave type added.");
}

export async function setLeaveTypeArchived(leaveTypeId: string, archived: boolean): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(leaveTypeId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("hr.manage")) return fail(DENIED);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("leave_types")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", leaveTypeId)
    .select("id")
    .maybeSingle();
  if (error) return fromPostgrestError(error);
  if (!data) return fail("That leave type was not found.");

  revalidate();
  return ok(undefined, archived ? "Leave type archived. Existing requests keep it." : "Leave type restored.");
}

export async function setLeaveBalance(input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("hr.manage")) return fail(DENIED);
  const parsed = balanceSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_leave_balance", {
    p_membership: parsed.data.membershipId,
    p_leave_type: parsed.data.leaveTypeId,
    p_year: parsed.data.year,
    p_days: parsed.data.days,
  });
  if (error) return fromPostgrestError(error);

  revalidate();
  return ok(undefined, "Balance updated.");
}

export async function grantAnnualAllowances(year: unknown): Promise<ActionResult<{ granted: number }>> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("hr.manage")) return fail(DENIED);
  if (typeof year !== "number" || !Number.isInteger(year) || year < 2000 || year > 2100) return fail("Choose a valid year.");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("grant_annual_leave_allowances", { p_org: ctx.organization.id, p_year: year });
  if (error) return fromPostgrestError(error);

  revalidate();
  const granted = data ?? 0;
  return ok({ granted }, granted ? `Granted ${granted} new balances for ${year}.` : `Everyone already has ${year} balances.`);
}

export async function setMemberCalendar(membershipId: string, calendarId: string | null): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(membershipId).success || (calendarId !== null && !uuid.safeParse(calendarId).success)) return fail("Invalid request.");
  if (!ctx.permissions.has("hr.manage")) return fail(DENIED);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_member_calendar", { p_membership: membershipId, p_calendar: calendarId as string });
  if (error) return fromPostgrestError(error);

  revalidate();
  return ok(undefined, calendarId ? "Calendar assigned." : "Now using the default calendar.");
}
