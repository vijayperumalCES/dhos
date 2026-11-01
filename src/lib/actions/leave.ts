"use server";

import { revalidatePath } from "next/cache";

import { requireOrgContext } from "@/lib/auth/org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { optionalText, uuid } from "@/lib/validation/common";
import { leaveRequestSchema, reviewSchema } from "@/lib/validation/workforce";

import { fail, fromPostgrestError, fromZodError, ok, type ActionResult } from "./result";

function revalidate() {
  revalidatePath("/leave");
  revalidatePath("/resources");
  revalidatePath("/dashboard");
}

export async function requestLeave(input: unknown): Promise<ActionResult<{ status: string }>> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("workforce.self")) return fail("You don't have permission to request leave.");
  const parsed = leaveRequestSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { data: id, error } = await supabase.rpc("request_leave", {
    p_org: ctx.organization.id,
    p_leave_type: parsed.data.leaveTypeId,
    p_start: parsed.data.startDate,
    p_end: parsed.data.endDate,
    p_half_day: parsed.data.halfDay,
    p_reason: parsed.data.reason ?? undefined,
  });
  if (error) return fromPostgrestError(error);

  const { data: row } = await supabase.from("leave_requests").select("status").eq("id", id).maybeSingle();
  const status = row?.status ?? "pending";
  revalidate();
  return ok({ status }, status === "approved" ? "Leave recorded." : "Leave requested. Your manager has been asked to review it.");
}

export async function reviewLeave(requestId: string, input: unknown): Promise<ActionResult> {
  await requireOrgContext();
  if (!uuid.safeParse(requestId).success) return fail("Invalid request.");
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("review_leave_request", {
    p_request: requestId,
    p_approve: parsed.data.approve,
    p_note: parsed.data.note ?? undefined,
  });
  if (error) return fromPostgrestError(error);

  revalidate();
  return ok(undefined, parsed.data.approve ? "Leave approved." : "Leave rejected.");
}

export async function cancelLeave(requestId: string, note: unknown): Promise<ActionResult> {
  await requireOrgContext();
  if (!uuid.safeParse(requestId).success) return fail("Invalid request.");
  const parsedNote = optionalText(1000).safeParse(note ?? "");
  if (!parsedNote.success) return fromZodError(parsedNote.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("cancel_leave_request", { p_request: requestId, p_note: parsedNote.data ?? undefined });
  if (error) return fromPostgrestError(error);

  revalidate();
  return ok(undefined, "Leave cancelled.");
}
