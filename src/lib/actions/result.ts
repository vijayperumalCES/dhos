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
      console.error("[stride-ces] unexpected database error", { code: error.code, message: error.message });
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
  no_working_days: "Those dates contain no working days.",
  leave_overlap: "You already have leave requested for some of those days.",
  insufficient_balance: "There isn't enough leave balance left.",
  leave_type_archived: "That leave type is no longer available.",
  request_state: "That request can't be changed in its current state.",
  invalid_dates: "Check the dates.",
  leave_year: "Split leave that crosses the year end into two requests.",
  already_checked_in: "You have already checked in today.",
  not_checked_in: "Check in before checking out.",
  future_date: "That date is in the future.",
  too_old: "That date is too far back to correct.",
  correction_pending: "There is already a pending correction for that day.",
  timesheet_locked: "Recall or reopen the timesheet before changing it.",
  invalid_entry: "That time entry isn't valid.",
  timesheet_state: "That timesheet can't be changed in its current state.",
  timesheet_empty: "Log some time before submitting.",
  future_week: "Timesheets can be started at most one week ahead.",
  range_too_large: "Choose a shorter date range.",
  calendar_archived: "Restore the calendar before making it the default.",
  decision_locked: "A recorded decision can only be superseded by a newer one.",
  decision_transition: "Only an accepted decision can be superseded.",
  invalid_link: "That link isn't valid for this project.",
  invalid_deadline: "Choose a response deadline in the future.",
  evidence_required: "Add at least one piece of evidence.",
  invalid_recipient: "That person can't open governance records on this project.",
  escalation_state: "That escalation can't be changed in its current state.",
  change_locked: "A submitted change request can no longer be edited.",
  change_state: "That change request can't be changed in its current state.",
  incomplete: "Complete the required details first.",
  self_review: "You can't decide your own change request.",
  gates_open: "Every required quality gate needs a pass or a waiver first.",
  release_locked: "A released or cancelled release can no longer be changed.",
  release_transition: "That release can't move to that stage from where it is.",
  document_archived: "Restore the document before adding a version.",
  immutable: "That record can't be changed.",
};

/** RPC keys whose detail text is written for users and is more specific than the generic message. */
const DETAILED_KEYS = new Set([
  "invalid_parent",
  "invalid_sprint",
  "sprint_state",
  "no_working_days",
  "leave_overlap",
  "insufficient_balance",
  "request_state",
  "invalid_dates",
  "already_checked_in",
  "future_date",
  "too_old",
  "timesheet_locked",
  "invalid_entry",
  "timesheet_state",
  "range_too_large",
  "decision_locked",
  "decision_transition",
  "invalid_link",
  "invalid_deadline",
  "evidence_required",
  "invalid_recipient",
  "escalation_state",
  "change_locked",
  "change_state",
  "incomplete",
  "self_review",
  "gates_open",
  "release_locked",
  "release_transition",
  "document_archived",
]);

export function humanizeRpcMessage(message: string): string {
  const [rawKey, ...rest] = message.split(":");
  const key = rawKey.trim();
  const detail = rest.join(":").trim();
  if (detail && DETAILED_KEYS.has(key)) return detail.charAt(0).toUpperCase() + detail.slice(1) + (detail.endsWith(".") ? "" : ".");
  return RPC_MESSAGES[key] ?? message;
}
