"use server";

import { revalidatePath } from "next/cache";

import { requireOrgContext } from "@/lib/auth/org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation/common";
import { departmentFormSchema, memberProfileSchema } from "@/lib/validation/organization";

import { fail, fromPostgrestError, fromZodError, ok, type ActionResult } from "./result";

const DUPLICATE = "An active department with that name or code already exists.";

function revalidatePeople() {
  revalidatePath("/admin/departments");
  revalidatePath("/admin/members");
  revalidatePath("/admin/org-chart");
}

export async function saveDepartment(departmentId: string | null, input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("org.members.manage")) return fail("You don't have permission to manage departments.");
  if (departmentId !== null && !uuid.safeParse(departmentId).success) return fail("Invalid department.");
  const parsed = departmentFormSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const row = {
    name: parsed.data.name,
    code: parsed.data.code,
    description: parsed.data.description,
    head_membership_id: parsed.data.headMembershipId,
  };
  const supabase = await createSupabaseServerClient();
  const { error } = departmentId
    ? await supabase.from("departments").update(row).eq("id", departmentId).eq("organization_id", ctx.organization.id)
    : await supabase.from("departments").insert({ ...row, organization_id: ctx.organization.id });
  if (error) return fromPostgrestError(error, { duplicate: DUPLICATE });

  revalidatePeople();
  return ok(undefined, departmentId ? "Department updated." : "Department created.");
}

export async function setDepartmentArchived(departmentId: string, archived: boolean): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(departmentId).success) return fail("Invalid department.");
  if (!ctx.permissions.has("org.members.manage")) return fail("You don't have permission to manage departments.");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("departments")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", departmentId)
    .eq("organization_id", ctx.organization.id)
    .select("id")
    .maybeSingle();
  if (error) return fromPostgrestError(error, { duplicate: DUPLICATE });
  if (!data) return fail("The department was not found.");

  revalidatePeople();
  return ok(undefined, archived ? "Department archived." : "Department restored.");
}

export async function updateMemberProfile(input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("org.members.manage")) return fail("You don't have permission to edit members.");
  const parsed = memberProfileSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  if (parsed.data.managerMembershipId === parsed.data.membershipId) {
    return fail("Please correct the highlighted fields.", { managerMembershipId: ["Someone can't report to themselves."] });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organization_memberships")
    .update({
      job_title: parsed.data.jobTitle,
      department_id: parsed.data.departmentId,
      manager_membership_id: parsed.data.managerMembershipId,
    })
    .eq("id", parsed.data.membershipId)
    .eq("organization_id", ctx.organization.id)
    .select("id")
    .maybeSingle();
  if (error) return fromPostgrestError(error);
  if (!data) return fail("That member was not found.");

  revalidatePeople();
  return ok(undefined, "Member details updated.");
}
