"use server";

import { revalidatePath } from "next/cache";

import { requireOrgContext } from "@/lib/auth/org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NONE, uuid } from "@/lib/validation/common";
import { sprintSchema } from "@/lib/validation/work";

import { fail, fromPostgrestError, fromZodError, ok, type ActionResult } from "./result";

function revalidate(projectId: string) {
  for (const tab of ["sprints", "backlog", "board"]) revalidatePath(`/projects/${projectId}/${tab}`);
  revalidatePath("/dashboard");
}

export async function saveSprint(projectId: string, sprintId: string | null, input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(projectId).success || (sprintId !== null && !uuid.safeParse(sprintId).success)) return fail("Invalid request.");
  if (!ctx.permissions.has("sprint.manage")) return fail("You don't have permission to manage sprints.");
  const parsed = sprintSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const row = { name: parsed.data.name, goal: parsed.data.goal, start_date: parsed.data.startDate, end_date: parsed.data.endDate };
  const supabase = await createSupabaseServerClient();
  const { data, error } = sprintId
    ? await supabase.from("sprints").update(row).eq("id", sprintId).eq("project_id", projectId).select("id").maybeSingle()
    : await supabase.from("sprints").insert({ ...row, project_id: projectId, organization_id: ctx.organization.id }).select("id").maybeSingle();
  if (error) return fromPostgrestError(error);
  if (!data) return fail("That sprint can no longer be edited.");

  revalidate(projectId);
  return ok(undefined, sprintId ? "Sprint updated." : "Sprint planned.");
}

export async function deleteSprint(projectId: string, sprintId: string): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(sprintId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("sprint.manage")) return fail("You don't have permission to manage sprints.");

  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase.from("sprints").delete({ count: "exact" }).eq("id", sprintId).eq("project_id", projectId);
  if (error) return fromPostgrestError(error);
  if (!count) return fail("Only planned sprints can be deleted.");

  revalidate(projectId);
  return ok(undefined, "Sprint deleted. Its items are back in the backlog.");
}

export async function startSprint(projectId: string, sprintId: string): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(sprintId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("sprint.manage")) return fail("You don't have permission to manage sprints.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("start_sprint", { p_sprint: sprintId });
  if (error) return fromPostgrestError(error);

  revalidate(projectId);
  return ok(undefined, "Sprint started. Its current scope is recorded as the commitment.");
}

export async function completeSprint(projectId: string, sprintId: string, moveTo: string): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(sprintId).success) return fail("Invalid request.");
  if (moveTo !== NONE && !uuid.safeParse(moveTo).success) return fail("Invalid target sprint.");
  if (!ctx.permissions.has("sprint.manage")) return fail("You don't have permission to manage sprints.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("complete_sprint", { p_sprint: sprintId, p_move_to: moveTo === NONE ? undefined : moveTo });
  if (error) return fromPostgrestError(error);

  revalidate(projectId);
  return ok(undefined, moveTo === NONE ? "Sprint completed. Unfinished items returned to the backlog." : "Sprint completed. Unfinished items moved to the next sprint.");
}
