"use server";

import { revalidatePath } from "next/cache";

import { requireOrgContext } from "@/lib/auth/org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation/common";
import { clientFormSchema } from "@/lib/validation/organization";

import { fail, fromPostgrestError, fromZodError, ok, type ActionResult } from "./result";

const DUPLICATE = "An active client with that name or code already exists.";

function toRow(v: ReturnType<typeof clientFormSchema.parse>) {
  return {
    name: v.name,
    code: v.code,
    industry: v.industry,
    website: v.website,
    account_owner_membership_id: v.accountOwnerMembershipId,
    confidentiality: v.confidentiality,
    notes: v.notes,
  };
}

function revalidateClient(id?: string) {
  revalidatePath("/clients");
  if (id) revalidatePath(`/clients/${id}`);
}

export async function createClient(input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("client.manage")) return fail("You don't have permission to manage clients.");
  const parsed = clientFormSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("clients")
    .insert({ ...toRow(parsed.data), organization_id: ctx.organization.id })
    .select("id")
    .single();
  if (error) return fromPostgrestError(error, { duplicate: DUPLICATE });

  revalidateClient();
  return ok({ id: data.id }, "Client created.");
}

export async function updateClient(clientId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(clientId).success) return fail("Invalid client.");
  if (!ctx.permissions.has("client.manage")) return fail("You don't have permission to manage clients.");
  const parsed = clientFormSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("clients")
    .update(toRow(parsed.data))
    .eq("id", clientId)
    .eq("organization_id", ctx.organization.id)
    .select("id")
    .maybeSingle();
  if (error) return fromPostgrestError(error, { duplicate: DUPLICATE });
  if (!data) return fail("The client was not found or you can no longer edit it.");

  revalidateClient(clientId);
  return ok({ id: data.id }, "Client updated.");
}

export async function setClientArchived(clientId: string, archived: boolean): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(clientId).success) return fail("Invalid client.");
  if (!ctx.permissions.has("client.manage")) return fail("You don't have permission to manage clients.");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("clients")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", clientId)
    .eq("organization_id", ctx.organization.id)
    .select("id")
    .maybeSingle();
  if (error) return fromPostgrestError(error, { duplicate: DUPLICATE });
  if (!data) return fail("The client was not found.");

  revalidateClient(clientId);
  return ok(undefined, archived ? "Client archived." : "Client restored.");
}
