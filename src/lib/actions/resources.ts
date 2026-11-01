"use server";

import { revalidatePath } from "next/cache";

import { requireOrgContext } from "@/lib/auth/org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation/common";
import { allocationSchema } from "@/lib/validation/workforce";

import { fail, fromPostgrestError, fromZodError, ok, type ActionResult } from "./result";

export async function saveAllocation(allocationId: string | null, input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (allocationId !== null && !uuid.safeParse(allocationId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("resource.manage")) return fail("You don't have permission to manage allocations.");
  const parsed = allocationSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const { membershipId, projectId, startDate, endDate, percent, role, notes } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = allocationId
    ? await supabase
        .from("resource_allocations")
        .update({ start_date: startDate, end_date: endDate, percent, role, notes })
        .eq("id", allocationId)
    : await supabase.from("resource_allocations").insert({
        organization_id: ctx.organization.id,
        membership_id: membershipId,
        project_id: projectId,
        start_date: startDate,
        end_date: endDate,
        percent,
        role,
        notes,
      });
  if (error) return fromPostgrestError(error);

  revalidatePath("/resources");
  return ok(undefined, allocationId ? "Allocation updated." : "Allocation added.");
}

export async function deleteAllocation(allocationId: string): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(allocationId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("resource.manage")) return fail("You don't have permission to manage allocations.");

  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase.from("resource_allocations").delete({ count: "exact" }).eq("id", allocationId);
  if (error) return fromPostgrestError(error);
  if (!count) return fail("That allocation was not found.");

  revalidatePath("/resources");
  return ok(undefined, "Allocation removed.");
}
