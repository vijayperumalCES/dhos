"use server";

import { revalidatePath } from "next/cache";

import { requireOrgContext } from "@/lib/auth/org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation/common";
import { roleFormSchema } from "@/lib/validation/organization";

import { fail, fromPostgrestError, fromZodError, ok, type ActionResult } from "./result";

const DUPLICATE = "A role with that key already exists in this organization.";

function revalidateRoles() {
  revalidatePath("/admin/roles");
  revalidatePath("/admin/members");
}

export async function createRole(input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("org.roles.manage")) return fail("You don't have permission to manage roles.");
  const parsed = roleFormSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_role", {
    p_org: ctx.organization.id,
    p_key: parsed.data.key,
    p_name: parsed.data.name,
    p_description: parsed.data.description,
    p_permissions: parsed.data.permissions,
  });
  if (error) return fromPostgrestError(error, { duplicate: DUPLICATE });

  revalidateRoles();
  return ok({ id: data }, `Role “${parsed.data.name}” created.`);
}

export async function updateRole(roleId: string, input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(roleId).success) return fail("Invalid role.");
  if (!ctx.permissions.has("org.roles.manage")) return fail("You don't have permission to manage roles.");
  const parsed = roleFormSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_role", {
    p_role: roleId,
    p_name: parsed.data.name,
    p_description: parsed.data.description,
    p_permissions: parsed.data.permissions,
  });
  if (error) return fromPostgrestError(error);

  revalidatePath("/", "layout"); // members holding the role see new permissions on next load
  return ok(undefined, "Role updated.");
}

export async function deleteRole(roleId: string): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(roleId).success) return fail("Invalid role.");
  if (!ctx.permissions.has("org.roles.manage")) return fail("You don't have permission to manage roles.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_role", { p_role: roleId });
  if (error) return fromPostgrestError(error);

  revalidateRoles();
  return ok(undefined, "Role deleted.");
}
