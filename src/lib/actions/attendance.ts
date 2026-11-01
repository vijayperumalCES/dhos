"use server";

import { revalidatePath } from "next/cache";

import { requireOrgContext } from "@/lib/auth/org-context";
import { WORK_MODES, zonedTimeToIso, type WorkMode } from "@/lib/domain/workforce";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { optionalText, uuid } from "@/lib/validation/common";
import { correctionSchema, reviewSchema } from "@/lib/validation/workforce";

import { fail, fromPostgrestError, fromZodError, ok, type ActionResult } from "./result";

function revalidate() {
  revalidatePath("/attendance");
  revalidatePath("/dashboard");
}

export async function checkIn(mode: unknown, note: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("workforce.self")) return fail("You don't have permission to record attendance.");
  if (!WORK_MODES.includes(mode as WorkMode)) return fail("Choose where you are working.");
  const parsedNote = optionalText(500).safeParse(note ?? "");
  if (!parsedNote.success) return fromZodError(parsedNote.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("check_in", {
    p_org: ctx.organization.id,
    p_mode: mode as WorkMode,
    p_note: parsedNote.data ?? undefined,
  });
  if (error) return fromPostgrestError(error);

  revalidate();
  return ok(undefined, "Checked in.");
}

export async function checkOut(): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("workforce.self")) return fail("You don't have permission to record attendance.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("check_out", { p_org: ctx.organization.id });
  if (error) return fromPostgrestError(error);

  revalidate();
  return ok(undefined, "Checked out.");
}

/** Times are entered as wall-clock times in the organization's time zone. */
export async function requestCorrection(input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("workforce.self")) return fail("You don't have permission to record attendance.");
  const parsed = correctionSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const { workDate, checkIn, checkOut, workMode, reason } = parsed.data;
  const tz = ctx.settings.timezone;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("request_attendance_correction", {
    p_org: ctx.organization.id,
    p_work_date: workDate,
    p_check_in: zonedTimeToIso(workDate, checkIn, tz),
    p_check_out: zonedTimeToIso(workDate, checkOut, tz),
    p_mode: workMode,
    p_reason: reason,
  });
  if (error) return fromPostgrestError(error);

  revalidate();
  return ok(undefined, "Correction sent for approval.");
}

export async function reviewCorrection(correctionId: string, input: unknown): Promise<ActionResult> {
  await requireOrgContext();
  if (!uuid.safeParse(correctionId).success) return fail("Invalid request.");
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("review_attendance_correction", {
    p_correction: correctionId,
    p_approve: parsed.data.approve,
    p_note: parsed.data.note ?? undefined,
  });
  if (error) return fromPostgrestError(error);

  revalidate();
  return ok(undefined, parsed.data.approve ? "Correction approved." : "Correction rejected.");
}

export async function cancelCorrection(correctionId: string): Promise<ActionResult> {
  await requireOrgContext();
  if (!uuid.safeParse(correctionId).success) return fail("Invalid request.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_attendance_correction", { p_correction: correctionId });
  if (error) return fromPostgrestError(error);

  revalidate();
  return ok(undefined, "Correction withdrawn.");
}
