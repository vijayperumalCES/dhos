"use server";

import { revalidatePath } from "next/cache";

import { requireOrgContext } from "@/lib/auth/org-context";
import { endOfDayInTimeZone } from "@/lib/domain/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requiredText, uuid } from "@/lib/validation/common";
import {
  actionSchema,
  changeRequestSchema,
  decisionOutcomeSchema,
  decisionSchema,
  escalationSchema,
  evidenceSchema,
  raidItemSchema,
  raidStatusSchema,
} from "@/lib/validation/governance";
import { ACTION_STATUSES, type ActionStatus } from "@/lib/domain/governance";

import { fail, fromPostgrestError, fromZodError, ok, type ActionResult } from "./result";

function revalidate() {
  revalidatePath("/governance", "layout");
  revalidatePath("/dashboard");
}

const NO_PERMISSION = "You don't have permission to change governance records.";

// ---------------------------------------------------------------------------
// RAID
// ---------------------------------------------------------------------------
export async function saveRaidItem(projectId: string, itemId: string | null, input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(projectId).success || (itemId !== null && !uuid.safeParse(itemId).success)) return fail("Invalid request.");
  if (!ctx.permissions.has("governance.manage")) return fail(NO_PERMISSION);
  const parsed = raidItemSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;

  const row = {
    title: v.title,
    description: v.description,
    probability: v.probability,
    impact: v.impact,
    owner_membership_id: v.ownerId,
    due_date: v.dueDate,
    mitigation: v.mitigation,
    contingency: v.contingency,
  };
  const supabase = await createSupabaseServerClient();
  const { error } = itemId
    ? await supabase.from("raid_items").update(row).eq("id", itemId).eq("project_id", projectId)
    : await supabase.from("raid_items").insert({ ...row, type: v.type, project_id: projectId, organization_id: ctx.organization.id });
  if (error) return fromPostgrestError(error);

  revalidate();
  return ok(undefined, itemId ? "Item updated." : "Item added to the register.");
}

export async function setRaidStatus(itemId: string, input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(itemId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("governance.manage")) return fail(NO_PERMISSION);
  const parsed = raidStatusSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const update = parsed.data.note ? { status: parsed.data.status, resolution_note: parsed.data.note } : { status: parsed.data.status };
  const { data, error } = await supabase.from("raid_items").update(update).eq("id", itemId).select("id").maybeSingle();
  if (error) return fromPostgrestError(error);
  if (!data) return fail("That item was not found.");

  revalidate();
  return ok(undefined, "Status updated.");
}

export async function setRaidArchived(itemId: string, archived: boolean): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(itemId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("governance.manage")) return fail(NO_PERMISSION);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("raid_items")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", itemId)
    .select("id")
    .maybeSingle();
  if (error) return fromPostgrestError(error);
  if (!data) return fail("That item was not found.");

  revalidate();
  return ok(undefined, archived ? "Item archived." : "Item restored.");
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------
export async function saveDecision(projectId: string, decisionId: string | null, input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(projectId).success || (decisionId !== null && !uuid.safeParse(decisionId).success)) return fail("Invalid request.");
  if (!ctx.permissions.has("governance.manage")) return fail(NO_PERMISSION);
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const row = {
    title: parsed.data.title,
    context: parsed.data.context,
    decision: parsed.data.decision,
    rationale: parsed.data.rationale,
    consequences: parsed.data.consequences,
  };
  const supabase = await createSupabaseServerClient();
  const { error } = decisionId
    ? await supabase.from("decisions").update(row).eq("id", decisionId).eq("project_id", projectId)
    : await supabase.from("decisions").insert({ ...row, project_id: projectId, organization_id: ctx.organization.id });
  if (error) return fromPostgrestError(error);

  revalidate();
  return ok(undefined, decisionId ? "Decision updated." : "Decision proposed.");
}

export async function recordDecision(decisionId: string, input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(decisionId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("governance.manage")) return fail(NO_PERMISSION);
  const parsed = decisionOutcomeSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("decisions")
    .update({ status: parsed.data.status, decision: parsed.data.decision })
    .eq("id", decisionId)
    .select("id")
    .maybeSingle();
  if (error) return fromPostgrestError(error);
  if (!data) return fail("That decision was not found.");

  revalidate();
  return ok(undefined, parsed.data.status === "accepted" ? "Decision accepted and locked." : "Decision rejected and locked.");
}

export async function supersedeDecision(decisionId: string, replacementId: string): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(decisionId).success || !uuid.safeParse(replacementId).success) return fail("Choose the decision that replaces this one.");
  if (!ctx.permissions.has("governance.manage")) return fail(NO_PERMISSION);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("decisions")
    .update({ status: "superseded", superseded_by_id: replacementId })
    .eq("id", decisionId)
    .select("id")
    .maybeSingle();
  if (error) return fromPostgrestError(error);
  if (!data) return fail("That decision was not found.");

  revalidate();
  return ok(undefined, "Decision superseded.");
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
export async function saveProjectAction(projectId: string, actionId: string | null, input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(projectId).success || (actionId !== null && !uuid.safeParse(actionId).success)) return fail("Invalid request.");
  if (!ctx.permissions.has("governance.manage")) return fail(NO_PERMISSION);
  const parsed = actionSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const row = {
    title: parsed.data.title,
    description: parsed.data.description,
    owner_membership_id: parsed.data.ownerId,
    due_date: parsed.data.dueDate,
    raid_item_id: parsed.data.raidItemId,
    decision_id: parsed.data.decisionId,
  };
  const supabase = await createSupabaseServerClient();
  const { error } = actionId
    ? await supabase.from("project_actions").update(row).eq("id", actionId).eq("project_id", projectId)
    : await supabase.from("project_actions").insert({ ...row, project_id: projectId, organization_id: ctx.organization.id });
  if (error) return fromPostgrestError(error);

  revalidate();
  return ok(undefined, actionId ? "Action updated." : "Action added.");
}

/** Owners can move their own actions along even without governance.manage (RLS decides). */
export async function setActionStatus(actionId: string, status: ActionStatus): Promise<ActionResult> {
  await requireOrgContext();
  if (!uuid.safeParse(actionId).success || !ACTION_STATUSES.includes(status)) return fail("Invalid request.");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("project_actions").update({ status }).eq("id", actionId).select("id").maybeSingle();
  if (error) return fromPostgrestError(error);
  if (!data) return fail("That action was not found, or you can't change it.");

  revalidate();
  return ok(undefined, "Action updated.");
}

export async function deleteProjectAction(actionId: string): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(actionId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("governance.manage")) return fail(NO_PERMISSION);

  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase.from("project_actions").delete({ count: "exact" }).eq("id", actionId);
  if (error) return fromPostgrestError(error);
  if (!count) return fail("That action was not found.");

  revalidate();
  return ok(undefined, "Action deleted. The audit log keeps a record.");
}

// ---------------------------------------------------------------------------
// Escalations
// ---------------------------------------------------------------------------
export async function raiseEscalation(projectId: string, input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(projectId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("governance.manage")) return fail(NO_PERMISSION);
  const parsed = escalationSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("raise_escalation", {
    p_project: projectId,
    p_title: v.title,
    p_description: v.description,
    p_severity: v.severity,
    p_to: v.toId,
    p_respond_by: endOfDayInTimeZone(v.respondBy, ctx.settings.timezone),
    // The generated argument type has no null; the database parameter accepts it.
    p_raid_item: v.raidItemId as string,
    p_evidence: v.evidence.map((e) => ({ kind: e.kind, title: e.title, url: e.url ?? "", note: e.note ?? "" })),
  });
  if (error) return fromPostgrestError(error);

  revalidate();
  return ok(undefined, "Escalation raised.");
}

export async function acknowledgeEscalation(escalationId: string): Promise<ActionResult> {
  await requireOrgContext();
  if (!uuid.safeParse(escalationId).success) return fail("Invalid request.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("acknowledge_escalation", { p_escalation: escalationId });
  if (error) return fromPostgrestError(error);

  revalidate();
  return ok(undefined, "Escalation acknowledged.");
}

export async function resolveEscalation(escalationId: string, note: unknown): Promise<ActionResult> {
  await requireOrgContext();
  if (!uuid.safeParse(escalationId).success) return fail("Invalid request.");
  const parsed = requiredText(2, 2000, "Resolution").safeParse(note);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("resolve_escalation", { p_escalation: escalationId, p_note: parsed.data });
  if (error) return fromPostgrestError(error);

  revalidate();
  return ok(undefined, "Escalation resolved.");
}

export async function addEscalationEvidence(escalationId: string, input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(escalationId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("governance.manage")) return fail(NO_PERMISSION);
  const parsed = evidenceSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { data: esc, error: findError } = await supabase.from("escalations").select("id, project_id").eq("id", escalationId).maybeSingle();
  if (findError) return fromPostgrestError(findError);
  if (!esc) return fail("That escalation was not found.");

  const { error } = await supabase.from("escalation_evidence").insert({
    organization_id: ctx.organization.id,
    project_id: esc.project_id,
    escalation_id: escalationId,
    kind: parsed.data.kind,
    title: parsed.data.title,
    url: parsed.data.url,
    note: parsed.data.note,
  });
  if (error) return fromPostgrestError(error);

  revalidate();
  return ok(undefined, "Evidence added.");
}

// ---------------------------------------------------------------------------
// Change requests
// ---------------------------------------------------------------------------
export async function saveChangeRequest(projectId: string, changeId: string | null, input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(projectId).success || (changeId !== null && !uuid.safeParse(changeId).success)) return fail("Invalid request.");
  if (!ctx.permissions.has("governance.manage")) return fail(NO_PERMISSION);
  const parsed = changeRequestSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;

  const row = {
    title: v.title,
    description: v.description,
    justification: v.justification,
    impact_schedule_days: v.impactScheduleDays,
    impact_effort_hours: v.impactEffortHours,
    impact_scope: v.impactScope,
    impact_risk: v.impactRisk,
  };
  const supabase = await createSupabaseServerClient();
  const { error } = changeId
    ? await supabase.from("change_requests").update(row).eq("id", changeId).eq("project_id", projectId)
    : await supabase.from("change_requests").insert({ ...row, project_id: projectId, organization_id: ctx.organization.id });
  if (error) return fromPostgrestError(error);

  revalidate();
  return ok(undefined, changeId ? "Change request updated." : "Draft saved.");
}

async function changeRpc(
  fn: "submit_change_request" | "withdraw_change_request" | "implement_change_request",
  changeId: string,
  message: string,
): Promise<ActionResult> {
  await requireOrgContext();
  if (!uuid.safeParse(changeId).success) return fail("Invalid request.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(fn, { p_change: changeId });
  if (error) return fromPostgrestError(error);
  revalidate();
  return ok(undefined, message);
}

export async function submitChangeRequest(changeId: string): Promise<ActionResult> {
  return changeRpc("submit_change_request", changeId, "Submitted for a decision.");
}

export async function withdrawChangeRequest(changeId: string): Promise<ActionResult> {
  return changeRpc("withdraw_change_request", changeId, "Change request withdrawn.");
}

export async function implementChangeRequest(changeId: string): Promise<ActionResult> {
  return changeRpc("implement_change_request", changeId, "Marked as implemented.");
}

export async function decideChangeRequest(changeId: string, approve: boolean, note: unknown): Promise<ActionResult> {
  await requireOrgContext();
  if (!uuid.safeParse(changeId).success) return fail("Invalid request.");
  const text = typeof note === "string" ? note.trim() : "";
  if (!approve && !text) return fail("Please correct the highlighted fields.", { note: ["Say why the change is rejected."] });
  if (text.length > 2000) return fail("Please correct the highlighted fields.", { note: ["Must be at most 2000 characters."] });

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("decide_change_request", { p_change: changeId, p_approve: approve, p_note: text || undefined });
  if (error) return fromPostgrestError(error);

  revalidate();
  return ok(undefined, approve ? "Change request approved." : "Change request rejected.");
}
