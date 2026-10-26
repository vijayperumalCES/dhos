"use server";

import { revalidatePath } from "next/cache";

import { requireOrgContext } from "@/lib/auth/org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requiredText, uuid } from "@/lib/validation/common";
import { milestoneSchema } from "@/lib/validation/work";

import { fail, fromPostgrestError, fromZodError, ok, type ActionResult } from "./result";

function revalidate(projectId: string) {
  revalidatePath(`/projects/${projectId}/milestones`);
  revalidatePath("/programs", "layout");
  revalidatePath("/dashboard");
}

export async function saveMilestone(projectId: string, milestoneId: string | null, input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(projectId).success || (milestoneId !== null && !uuid.safeParse(milestoneId).success)) return fail("Invalid request.");
  if (!ctx.permissions.has("milestone.manage")) return fail("You don't have permission to manage milestones.");
  const parsed = milestoneSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const row = {
    name: parsed.data.name,
    description: parsed.data.description,
    due_date: parsed.data.dueDate,
    owner_membership_id: parsed.data.ownerId,
  };
  const supabase = await createSupabaseServerClient();
  const { error } = milestoneId
    ? await supabase.from("project_milestones").update(row).eq("id", milestoneId).eq("project_id", projectId)
    : await supabase.from("project_milestones").insert({ ...row, project_id: projectId, organization_id: ctx.organization.id });
  if (error) return fromPostgrestError(error);

  revalidate(projectId);
  return ok(undefined, milestoneId ? "Milestone updated." : "Milestone added.");
}

export async function setMilestoneCompleted(projectId: string, milestoneId: string, completedOn: string | null): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(milestoneId).success) return fail("Invalid request.");
  if (completedOn !== null && !/^\d{4}-\d{2}-\d{2}$/.test(completedOn)) return fail("Invalid date.");
  if (!ctx.permissions.has("milestone.manage")) return fail("You don't have permission to manage milestones.");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("project_milestones")
    .update({ completed_on: completedOn })
    .eq("id", milestoneId)
    .eq("project_id", projectId)
    .select("id")
    .maybeSingle();
  if (error) return fromPostgrestError(error);
  if (!data) return fail("That milestone was not found.");

  revalidate(projectId);
  return ok(undefined, completedOn ? "Milestone marked achieved." : "Milestone reopened.");
}

export async function deleteMilestone(projectId: string, milestoneId: string): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(milestoneId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("milestone.manage")) return fail("You don't have permission to manage milestones.");

  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase.from("project_milestones").delete({ count: "exact" }).eq("id", milestoneId).eq("project_id", projectId);
  if (error) return fromPostgrestError(error);
  if (!count) return fail("That milestone was not found.");

  revalidate(projectId);
  return ok(undefined, "Milestone deleted. The audit log keeps a record.");
}

export async function takeBaseline(projectId: string, name: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(projectId).success) return fail("Invalid project.");
  if (!ctx.permissions.has("milestone.manage")) return fail("You don't have permission to take baselines.");
  const parsed = requiredText(1, 120, "Baseline name").safeParse(name);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("take_project_baseline", { p_project: projectId, p_name: parsed.data });
  if (error) return fromPostgrestError(error);

  revalidate(projectId);
  return ok(undefined, "Baseline saved. Variance is now measured against today's dates.");
}
