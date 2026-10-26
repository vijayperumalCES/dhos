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
      console.error("[stride] unexpected database error", { code: error.code, message: error.message });
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
  system_role: "System roles can't be changed. Create a custom role instead.",
  role_in_use: "Remove this role from all members before deleting it.",
  reserved_role_key: "That key is used by a system role. Choose another.",
  permissions_required: "A role needs at least one permission.",
  reporting_cycle: "That change would make someone report to themselves.",
  invalid_parent: "That parent isn't allowed for this item type.",
  invalid_sprint: "That sprint can't take this item.",
  dependency_cycle: "Those items would block each other.",
  sprint_state: "That sprint action isn't possible in the sprint's current state.",
  default_state: "Choose another default state first.",
  state_in_use: "Move its work items to another state first.",
  category_required: "Keep at least one active state in each category.",
};

/** RPC keys whose detail text is written for users and is more specific than the generic message. */
const DETAILED_KEYS = new Set(["invalid_parent", "invalid_sprint", "sprint_state"]);

export function humanizeRpcMessage(message: string): string {
  const [rawKey, ...rest] = message.split(":");
  const key = rawKey.trim();
  const detail = rest.join(":").trim();
  if (detail && DETAILED_KEYS.has(key)) return detail.charAt(0).toUpperCase() + detail.slice(1) + (detail.endsWith(".") ? "" : ".");
  return RPC_MESSAGES[key] ?? message;
}
