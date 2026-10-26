"use server";

import { revalidatePath } from "next/cache";

import { requireOrgContext } from "@/lib/auth/org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation/common";
import { workflowStateSchema } from "@/lib/validation/work";

import { fail, fromPostgrestError, fromZodError, ok, type ActionResult } from "./result";

const DUPLICATE = "Another active state already has that name.";

async function guard() {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("workflow.manage")) return { ctx, denied: fail("You don't have permission to configure the workflow.") };
  return { ctx, denied: null };
}

function revalidate() {
  revalidatePath("/admin/workflow");
  revalidatePath("/projects", "layout");
}

export async function saveWorkflowState(stateId: string | null, input: unknown): Promise<ActionResult> {
  const { ctx, denied } = await guard();
  if (denied) return denied;
  if (stateId !== null && !uuid.safeParse(stateId).success) return fail("Invalid state.");
  const parsed = workflowStateSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const row = { name: parsed.data.name, category: parsed.data.category, wip_limit: parsed.data.wipLimit };
  let error;
  if (stateId) {
    ({ error } = await supabase.from("workflow_states").update(row).eq("id", stateId).eq("organization_id", ctx.organization.id));
  } else {
    const { data: last } = await supabase
      .from("workflow_states")
      .select("position")
      .eq("organization_id", ctx.organization.id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    ({ error } = await supabase.from("workflow_states").insert({ ...row, organization_id: ctx.organization.id, position: (last?.position ?? 0) + 10 }));
  }
  if (error) return fromPostgrestError(error, { duplicate: DUPLICATE });

  revalidate();
  return ok(undefined, stateId ? "State updated." : "State added.");
}

/** Swaps the position of a state with its neighbour. */
export async function moveWorkflowState(stateId: string, direction: "up" | "down"): Promise<ActionResult> {
  const { ctx, denied } = await guard();
  if (denied) return denied;
  if (!uuid.safeParse(stateId).success) return fail("Invalid state.");

  const supabase = await createSupabaseServerClient();
  const { data: states } = await supabase
    .from("workflow_states")
    .select("id, position")
    .eq("organization_id", ctx.organization.id)
    .is("archived_at", null)
    .order("position");
  const list = states ?? [];
  const i = list.findIndex((s) => s.id === stateId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return ok(undefined);

  // Renumber everything so positions stay unique even after earlier edits.
  const reordered = [...list];
  [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
  for (const [index, s] of reordered.entries()) {
    const { error } = await supabase.from("workflow_states").update({ position: (index + 1) * 10 }).eq("id", s.id);
    if (error) return fromPostgrestError(error);
  }
  revalidate();
  return ok(undefined);
}

export async function setDefaultWorkflowState(stateId: string): Promise<ActionResult> {
  const { ctx, denied } = await guard();
  if (denied) return denied;
  if (!uuid.safeParse(stateId).success) return fail("Invalid state.");

  const supabase = await createSupabaseServerClient();
  const clear = await supabase.from("workflow_states").update({ is_default: false }).eq("organization_id", ctx.organization.id).eq("is_default", true);
  if (clear.error) return fromPostgrestError(clear.error);
  const set = await supabase.from("workflow_states").update({ is_default: true }).eq("id", stateId).eq("organization_id", ctx.organization.id);
  if (set.error) return fromPostgrestError(set.error);

  revalidate();
  return ok(undefined, "Default state changed. New items start here.");
}

export async function archiveWorkflowState(stateId: string): Promise<ActionResult> {
  const { ctx, denied } = await guard();
  if (denied) return denied;
  if (!uuid.safeParse(stateId).success) return fail("Invalid state.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("workflow_states")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", stateId)
    .eq("organization_id", ctx.organization.id);
  if (error) return fromPostgrestError(error);

  revalidate();
  return ok(undefined, "State archived.");
}

export async function setTransitionAllowed(fromId: string, toId: string, allowed: boolean): Promise<ActionResult> {
  const { ctx, denied } = await guard();
  if (denied) return denied;
  if (!uuid.safeParse(fromId).success || !uuid.safeParse(toId).success || fromId === toId) return fail("Invalid transition.");

  const supabase = await createSupabaseServerClient();
  const { error } = allowed
    ? await supabase.from("workflow_transitions").insert({ organization_id: ctx.organization.id, from_state_id: fromId, to_state_id: toId })
    : await supabase.from("workflow_transitions").delete().eq("from_state_id", fromId).eq("to_state_id", toId);
  if (error && error.code !== "23505") return fromPostgrestError(error);

  revalidate();
  return ok(undefined);
}
