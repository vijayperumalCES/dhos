import type { PostgrestError } from "@supabase/supabase-js";
import type { z } from "zod";

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(error: string, fieldErrors?: Record<string, string[]>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

export function fromZodError(error: z.ZodError): ActionResult<never> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fail("Please correct the highlighted fields.", fieldErrors);
}

/**
 * Translates database errors into messages safe to show users. Raw messages from the
 * database are only surfaced for our own RPC exceptions (SQLSTATE P0001), whose text we
 * control; everything else maps to a generic description.
 */
export function fromPostgrestError(error: PostgrestError, context?: { duplicate?: string }): ActionResult<never> {
  switch (error.code) {
    case "42501":
      return fail("You don't have permission to do that.");
    case "23505":
      return fail(context?.duplicate ?? "A record with the same unique value already exists.");
    case "23503":
      return fail("A referenced record does not exist in this organization.");
    case "23514":
    case "22023":
    case "22P02":
      return fail("One of the values is not valid.");
    case "PGRST116":
      return fail("The record was not found or you no longer have access to it.");
    case "P0001":
      return fail(humanizeRpcMessage(error.message));
    default:
      console.error("[dhos] unexpected database error", { code: error.code, message: error.message });
      return fail("Something went wrong while saving. Please try again.");
  }
}

const RPC_MESSAGES: Record<string, string> = {
  invalid_transition: "That lifecycle transition is not allowed.",
  reason_required: "A reason is required for this change.",
  archived: "Restore the project before changing its status.",
  last_admin: "The organization must keep at least one active administrator.",
  cannot_suspend_self: "You cannot suspend your own membership.",
  rate_limited: "Too many requests. Please wait and try again.",
};

export function humanizeRpcMessage(message: string): string {
  const key = message.split(":")[0].trim();
  return RPC_MESSAGES[key] ?? message;
}
