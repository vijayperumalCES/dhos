"use server";

import { revalidatePath } from "next/cache";

import { requireOrgContext, type OrgContext } from "@/lib/auth/org-context";
import { addDaysToDate } from "@/lib/domain/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation/common";
import { reviewSchema, timeEntrySchema, weekStartSchema } from "@/lib/validation/workforce";

import { fail, fromPostgrestError, fromZodError, ok, type ActionResult } from "./result";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function revalidate() {
  revalidatePath("/timesheets");
  revalidatePath("/resources");
}

/** Returns the caller's timesheet for the week, creating a draft on first use. */
async function ensureTimesheet(supabase: Supabase, ctx: OrgContext, weekStart: string) {
  const find = () =>
    supabase
      .from("timesheets")
      .select("id")
      .eq("organization_id", ctx.organization.id)
      .eq("membership_id", ctx.membershipId)
      .eq("week_start", weekStart)
      .maybeSingle();

  const existing = await find();
  if (existing.error) return { error: existing.error };
  if (existing.data) return { id: existing.data.id };

  const inserted = await supabase
    .from("timesheets")
    .insert({ organization_id: ctx.organization.id, week_start: weekStart } as never)
    .select("id")
    .single();
  if (!inserted.error) return { id: inserted.data.id };
  // Another tab created it first.
  if (inserted.error.code === "23505") {
    const again = await find();
    if (again.data) return { id: again.data.id };
  }
  return { error: inserted.error };
}

export async function saveTimeEntry(weekStart: string, entryId: string | null, input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!weekStartSchema.safeParse(weekStart).success || (entryId !== null && !uuid.safeParse(entryId).success)) return fail("Invalid request.");
  if (!ctx.permissions.has("workforce.self")) return fail("You don't have permission to log time.");
  const parsed = timeEntrySchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const { entryDate, category, projectId, workItemId, hours, note } = parsed.data;
  if (entryDate < weekStart || entryDate > addDaysToDate(weekStart, 6)) {
    return fail("Please correct the highlighted fields.", { entryDate: ["Choose a day in this week."] });
  }

  const row = { entry_date: entryDate, category, project_id: projectId, work_item_id: workItemId, hours, note };
  const supabase = await createSupabaseServerClient();
  if (entryId) {
    const { data, error } = await supabase.from("time_entries").update(row).eq("id", entryId).select("id").maybeSingle();
    if (error) return fromPostgrestError(error);
    if (!data) return fail("That entry was not found.");
  } else {
    const sheet = await ensureTimesheet(supabase, ctx, weekStart);
    if (sheet.error) return fromPostgrestError(sheet.error);
    const { error } = await supabase
      .from("time_entries")
      .insert({ ...row, organization_id: ctx.organization.id, timesheet_id: sheet.id! });
    if (error) return fromPostgrestError(error);
  }

  revalidate();
  return ok(undefined, entryId ? "Entry updated." : "Time logged.");
}

export async function deleteTimeEntry(entryId: string): Promise<ActionResult> {
  await requireOrgContext();
  if (!uuid.safeParse(entryId).success) return fail("Invalid request.");

  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase.from("time_entries").delete({ count: "exact" }).eq("id", entryId);
  if (error) return fromPostgrestError(error);
  if (!count) return fail("That entry was not found.");

  revalidate();
  return ok(undefined, "Entry removed.");
}

export async function submitTimesheet(timesheetId: string): Promise<ActionResult> {
  await requireOrgContext();
  if (!uuid.safeParse(timesheetId).success) return fail("Invalid request.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("submit_timesheet", { p_timesheet: timesheetId });
  if (error) return fromPostgrestError(error);

  revalidate();
  return ok(undefined, "Timesheet submitted for approval.");
}

export async function recallTimesheet(timesheetId: string): Promise<ActionResult> {
  await requireOrgContext();
  if (!uuid.safeParse(timesheetId).success) return fail("Invalid request.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("recall_timesheet", { p_timesheet: timesheetId });
  if (error) return fromPostgrestError(error);

  revalidate();
  return ok(undefined, "Timesheet recalled. You can edit it again.");
}

export async function reviewTimesheet(timesheetId: string, input: unknown): Promise<ActionResult> {
  await requireOrgContext();
  if (!uuid.safeParse(timesheetId).success) return fail("Invalid request.");
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("review_timesheet", {
    p_timesheet: timesheetId,
    p_approve: parsed.data.approve,
    p_note: parsed.data.note ?? undefined,
  });
  if (error) return fromPostgrestError(error);

  revalidate();
  return ok(undefined, parsed.data.approve ? "Timesheet approved." : "Timesheet returned for changes.");
}
