"use server";

import { revalidatePath } from "next/cache";

import { requireOrgContext } from "@/lib/auth/org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  healthUpdateSchema,
  projectFormSchema,
  projectMemberSchema,
  statusTransitionSchema,
  toProjectRow,
} from "@/lib/validation/project";
import { uuid } from "@/lib/validation/common";

import { fail, fromPostgrestError, fromZodError, ok, type ActionResult } from "./result";

const DUPLICATE_CODE = "Another project in this organization already uses that code.";

function revalidateProject(id?: string) {
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/projects/${id}`);
}

export async function createProject(input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("project.create")) return fail("You don't have permission to create projects.");
  const parsed = projectFormSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({ ...toProjectRow(parsed.data), organization_id: ctx.organization.id })
    .select("id")
    .single();
  if (error) return fromPostgrestError(error, { duplicate: DUPLICATE_CODE });

  revalidateProject();
  return ok({ id: data.id }, "Project created.");
}

export async function updateProject(projectId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(projectId).success) return fail("Invalid project.");
  if (!ctx.permissions.has("project.update")) return fail("You don't have permission to edit projects.");
  const parsed = projectFormSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .update(toProjectRow(parsed.data))
    .eq("id", projectId)
    .eq("organization_id", ctx.organization.id)
    .select("id")
    .maybeSingle();
  if (error) return fromPostgrestError(error, { duplicate: DUPLICATE_CODE });
  if (!data) return fail("The project was not found or you can no longer edit it.");

  revalidateProject(projectId);
  return ok({ id: data.id }, "Project updated.");
}

export async function transitionProjectStatus(input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("project.change_status")) return fail("You don't have permission to change project status.");
  const parsed = statusTransitionSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("transition_project_status", {
    p_project: parsed.data.projectId,
    p_to: parsed.data.toStatus,
    p_reason: parsed.data.reason ?? undefined,
  });
  if (error) return fromPostgrestError(error);

  revalidateProject(parsed.data.projectId);
  return ok(undefined, "Status updated.");
}

export async function setProjectHealth(input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("project.change_status")) return fail("You don't have permission to set project health.");
  const parsed = healthUpdateSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_project_health", {
    p_project: parsed.data.projectId,
    p_health: parsed.data.health,
    p_reason: parsed.data.reason ?? "",
  });
  if (error) return fromPostgrestError(error);

  revalidateProject(parsed.data.projectId);
  return ok(undefined, "Health updated.");
}

export async function setProjectArchived(projectId: string, archived: boolean): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(projectId).success) return fail("Invalid project.");
  if (!ctx.permissions.has("project.archive")) return fail("You don't have permission to archive projects.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_project_archived", { p_project: projectId, p_archived: archived });
  if (error) return fromPostgrestError(error);

  revalidateProject(projectId);
  return ok(undefined, archived ? "Project archived." : "Project restored.");
}

export async function addProjectMember(input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("project.members.manage")) return fail("You don't have permission to manage project members.");
  const parsed = projectMemberSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("project_memberships").insert({
    organization_id: ctx.organization.id,
    project_id: parsed.data.projectId,
    membership_id: parsed.data.membershipId,
    project_role: parsed.data.projectRole,
    allocation_percent: parsed.data.allocationPercent,
  });
  if (error) return fromPostgrestError(error, { duplicate: "That person is already on this project." });

  revalidateProject(parsed.data.projectId);
  return ok(undefined, "Member added.");
}

export async function removeProjectMember(projectId: string, membershipId: string): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(membershipId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("project.members.manage")) return fail("You don't have permission to manage project members.");

  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from("project_memberships")
    .delete({ count: "exact" })
    .eq("project_id", projectId)
    .eq("membership_id", membershipId);
  if (error) return fromPostgrestError(error);
  if (!count) return fail("That member could not be removed.");

  revalidateProject(projectId);
  return ok(undefined, "Member removed.");
}
