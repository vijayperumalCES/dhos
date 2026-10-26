"use server";

import { revalidatePath } from "next/cache";

import { requireOrgContext } from "@/lib/auth/org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NONE, uuid } from "@/lib/validation/common";
import {
  commentSchema,
  dependencySchema,
  linkSchema,
  moveWorkItemSchema,
  quickAddSchema,
  toWorkItemRow,
  workItemSchema,
} from "@/lib/validation/work";

import { fail, fromPostgrestError, fromZodError, ok, type ActionResult } from "./result";

function revalidateProjectWork(projectId: string, key?: string) {
  for (const tab of ["backlog", "board", "sprints"]) revalidatePath(`/projects/${projectId}/${tab}`);
  if (key) revalidatePath(`/projects/${projectId}/items/${key}`);
  revalidatePath("/work");
  revalidatePath("/dashboard");
}

async function itemProject(itemId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("work_items").select("id, project_id, key").eq("id", itemId).maybeSingle();
  return data;
}

export async function createWorkItem(projectId: string, input: unknown): Promise<ActionResult<{ key: string }>> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(projectId).success) return fail("Invalid project.");
  if (!ctx.permissions.has("work.create")) return fail("You don't have permission to create work items.");
  const parsed = workItemSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("work_items")
    .insert({ ...toWorkItemRow(parsed.data), project_id: projectId, organization_id: ctx.organization.id })
    .select("key")
    .single();
  if (error) return fromPostgrestError(error);

  revalidateProjectWork(projectId);
  return ok({ key: data.key }, `${data.key} created.`);
}

export async function updateWorkItem(itemId: string, input: unknown): Promise<ActionResult<{ key: string }>> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(itemId).success) return fail("Invalid work item.");
  if (!ctx.permissions.has("work.update")) return fail("You don't have permission to edit work items.");
  const parsed = workItemSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("work_items")
    .update(toWorkItemRow(parsed.data))
    .eq("id", itemId)
    .select("key, project_id")
    .maybeSingle();
  if (error) return fromPostgrestError(error);
  if (!data) return fail("The item was not found, is archived, or you can no longer edit it.");

  revalidateProjectWork(data.project_id, data.key);
  return ok({ key: data.key }, `${data.key} updated.`);
}

/** Title-only creation from the backlog or a board column. */
export async function quickAddWorkItem(input: unknown): Promise<ActionResult<{ key: string }>> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("work.create")) return fail("You don't have permission to create work items.");
  const parsed = quickAddSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  let stateId = parsed.data.stateId;
  if (!stateId) {
    const { data: state } = await supabase
      .from("workflow_states")
      .select("id")
      .eq("organization_id", ctx.organization.id)
      .eq("is_default", true)
      .single();
    stateId = state?.id ?? null;
  }
  if (!stateId) return fail("No default workflow state is configured.");

  const { data, error } = await supabase
    .from("work_items")
    .insert({
      organization_id: ctx.organization.id,
      project_id: parsed.data.projectId,
      type: parsed.data.type,
      title: parsed.data.title,
      sprint_id: parsed.data.sprintId,
      state_id: stateId,
    })
    .select("key")
    .single();
  if (error) return fromPostgrestError(error);

  revalidateProjectWork(parsed.data.projectId);
  return ok({ key: data.key }, `${data.key} created.`);
}

/** Board and backlog moves: any combination of state, sprint and rank. */
export async function moveWorkItem(input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("work.update")) return fail("You don't have permission to move work items.");
  const parsed = moveWorkItemSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const patch: { state_id?: string; sprint_id?: string | null; rank?: number } = {};
  if (parsed.data.stateId) patch.state_id = parsed.data.stateId;
  if (parsed.data.sprintId !== undefined) patch.sprint_id = parsed.data.sprintId === NONE ? null : parsed.data.sprintId;
  if (parsed.data.rank !== undefined) patch.rank = parsed.data.rank;
  if (Object.keys(patch).length === 0) return ok(undefined);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("work_items").update(patch).eq("id", parsed.data.itemId).select("project_id, key").maybeSingle();
  if (error) return fromPostgrestError(error);
  if (!data) return fail("The item was not found, is archived, or you can no longer edit it.");

  revalidateProjectWork(data.project_id, data.key);
  return ok(undefined);
}

export async function setWorkItemArchived(itemId: string, archived: boolean): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(itemId).success) return fail("Invalid work item.");
  if (!ctx.permissions.has("work.archive")) return fail("You don't have permission to archive work items.");

  const item = await itemProject(itemId);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_work_item_archived", { p_item: itemId, p_archived: archived });
  if (error) return fromPostgrestError(error);

  if (item) revalidateProjectWork(item.project_id, item.key);
  return ok(undefined, archived ? "Item archived." : "Item restored.");
}

export async function addComment(input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("work.read")) return fail("You don't have access to this item.");
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("work_item_comments")
    .insert({ organization_id: ctx.organization.id, work_item_id: parsed.data.itemId, body: parsed.data.body });
  if (error) return fromPostgrestError(error);

  const item = await itemProject(parsed.data.itemId);
  if (item) revalidatePath(`/projects/${item.project_id}/items/${item.key}`);
  return ok(undefined, "Comment added.");
}

export async function deleteComment(commentId: string): Promise<ActionResult> {
  await requireOrgContext();
  if (!uuid.safeParse(commentId).success) return fail("Invalid comment.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("work_item_comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", commentId)
    .select("work_item_id")
    .maybeSingle();
  if (error) return fromPostgrestError(error);
  if (!data) return fail("You can only delete your own comments.");

  const item = await itemProject(data.work_item_id);
  if (item) revalidatePath(`/projects/${item.project_id}/items/${item.key}`);
  return ok(undefined, "Comment deleted.");
}

export async function addLink(input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("work.update")) return fail("You don't have permission to edit this item.");
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("work_item_links").insert({
    organization_id: ctx.organization.id,
    work_item_id: parsed.data.itemId,
    kind: parsed.data.kind,
    url: parsed.data.url,
    title: parsed.data.title,
  });
  if (error) return fromPostgrestError(error);

  const item = await itemProject(parsed.data.itemId);
  if (item) revalidatePath(`/projects/${item.project_id}/items/${item.key}`);
  return ok(undefined, "Link added.");
}

export async function removeLink(linkId: string): Promise<ActionResult> {
  await requireOrgContext();
  if (!uuid.safeParse(linkId).success) return fail("Invalid link.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("work_item_links").delete().eq("id", linkId).select("work_item_id").maybeSingle();
  if (error) return fromPostgrestError(error);
  if (!data) return fail("That link could not be removed.");

  const item = await itemProject(data.work_item_id);
  if (item) revalidatePath(`/projects/${item.project_id}/items/${item.key}`);
  return ok(undefined, "Link removed.");
}

export async function addDependency(input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("work.update")) return fail("You don't have permission to edit this item.");
  const parsed = dependencySchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { data: predecessor } = await supabase
    .from("work_items")
    .select("id")
    .eq("organization_id", ctx.organization.id)
    .eq("key", parsed.data.predecessorKey)
    .maybeSingle();
  if (!predecessor) return fail("Please correct the highlighted fields.", { predecessorKey: [`No visible item has the key ${parsed.data.predecessorKey}.`] });
  if (predecessor.id === parsed.data.successorId) return fail("Please correct the highlighted fields.", { predecessorKey: ["An item can't depend on itself."] });

  const { error } = await supabase.from("work_item_dependencies").insert({
    organization_id: ctx.organization.id,
    predecessor_id: predecessor.id,
    successor_id: parsed.data.successorId,
    kind: parsed.data.kind,
  });
  if (error) return fromPostgrestError(error, { duplicate: "That dependency already exists." });

  const item = await itemProject(parsed.data.successorId);
  if (item) revalidateProjectWork(item.project_id, item.key);
  return ok(undefined, "Dependency added.");
}

export async function removeDependency(predecessorId: string, successorId: string, kind: "blocks" | "relates_to" | "duplicates"): Promise<ActionResult> {
  await requireOrgContext();
  if (!uuid.safeParse(predecessorId).success || !uuid.safeParse(successorId).success) return fail("Invalid request.");
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from("work_item_dependencies")
    .delete({ count: "exact" })
    .eq("predecessor_id", predecessorId)
    .eq("successor_id", successorId)
    .eq("kind", kind);
  if (error) return fromPostgrestError(error);
  if (!count) return fail("That dependency could not be removed.");

  const item = await itemProject(successorId);
  if (item) revalidateProjectWork(item.project_id, item.key);
  return ok(undefined, "Dependency removed.");
}
