"use server";

import { revalidatePath } from "next/cache";

import { requireOrgContext } from "@/lib/auth/org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation/common";
import { programSchema } from "@/lib/validation/work";

import { fail, fromPostgrestError, fromZodError, ok, type ActionResult } from "./result";

const DUPLICATE = "Another program already uses that code.";

export async function saveProgram(programId: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("program.manage")) return fail("You don't have permission to manage programs.");
  if (programId !== null && !uuid.safeParse(programId).success) return fail("Invalid program.");
  const parsed = programSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const row = {
    code: parsed.data.code,
    name: parsed.data.name,
    description: parsed.data.description,
    owner_membership_id: parsed.data.ownerId,
  };
  const supabase = await createSupabaseServerClient();
  const result = programId
    ? await supabase.from("programs").update(row).eq("id", programId).eq("organization_id", ctx.organization.id).select("id").single()
    : await supabase.from("programs").insert({ ...row, organization_id: ctx.organization.id }).select("id").single();
  if (result.error) return fromPostgrestError(result.error, { duplicate: DUPLICATE });

  revalidatePath("/programs");
  revalidatePath(`/programs/${result.data.id}`);
  return ok({ id: result.data.id }, programId ? "Program updated." : "Program created.");
}

export async function setProgramStatus(programId: string, status: "active" | "closed"): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(programId).success || !["active", "closed"].includes(status)) return fail("Invalid request.");
  if (!ctx.permissions.has("program.manage")) return fail("You don't have permission to manage programs.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("programs").update({ status }).eq("id", programId).eq("organization_id", ctx.organization.id);
  if (error) return fromPostgrestError(error);

  revalidatePath("/programs");
  revalidatePath(`/programs/${programId}`);
  return ok(undefined, status === "closed" ? "Program closed." : "Program reopened.");
}
