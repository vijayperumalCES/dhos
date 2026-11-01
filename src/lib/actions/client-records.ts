"use server";

import { revalidatePath } from "next/cache";

import { requireOrgContext } from "@/lib/auth/org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation/common";
import { contactSchema, contractSchema } from "@/lib/validation/governance";

import { fail, fromPostgrestError, fromZodError, ok, type ActionResult } from "./result";

function revalidate(clientId: string) {
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/governance", "layout");
}

const NO_PERMISSION = "You don't have permission to manage clients.";

export async function saveContact(clientId: string, contactId: string | null, input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(clientId).success || (contactId !== null && !uuid.safeParse(contactId).success)) return fail("Invalid request.");
  if (!ctx.permissions.has("client.manage")) return fail(NO_PERMISSION);
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;

  const supabase = await createSupabaseServerClient();
  // A client has one primary contact: clear the current one first.
  if (v.isPrimary) {
    let clear = supabase.from("client_contacts").update({ is_primary: false }).eq("client_id", clientId).eq("is_primary", true).is("archived_at", null);
    if (contactId) clear = clear.neq("id", contactId);
    const { error } = await clear;
    if (error) return fromPostgrestError(error);
  }

  const row = { name: v.name, job_title: v.jobTitle, email: v.email, phone: v.phone, is_primary: v.isPrimary, notes: v.notes };
  const { error } = contactId
    ? await supabase.from("client_contacts").update(row).eq("id", contactId).eq("client_id", clientId)
    : await supabase.from("client_contacts").insert({ ...row, client_id: clientId, organization_id: ctx.organization.id });
  if (error) return fromPostgrestError(error);

  revalidate(clientId);
  return ok(undefined, contactId ? "Contact updated." : "Contact added.");
}

export async function setContactArchived(clientId: string, contactId: string, archived: boolean): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(clientId).success || !uuid.safeParse(contactId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("client.manage")) return fail(NO_PERMISSION);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("client_contacts")
    .update({ archived_at: archived ? new Date().toISOString() : null, ...(archived ? { is_primary: false } : {}) })
    .eq("id", contactId)
    .eq("client_id", clientId)
    .select("id")
    .maybeSingle();
  if (error) return fromPostgrestError(error, { duplicate: "This client already has a primary contact." });
  if (!data) return fail("That contact was not found.");

  revalidate(clientId);
  return ok(undefined, archived ? "Contact archived." : "Contact restored.");
}

export async function saveContract(clientId: string, contractId: string | null, input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(clientId).success || (contractId !== null && !uuid.safeParse(contractId).success)) return fail("Invalid request.");
  if (!ctx.permissions.has("client.manage")) return fail(NO_PERMISSION);
  const parsed = contractSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;

  const row = {
    title: v.title,
    reference: v.reference,
    contract_type: v.contractType,
    status: v.status,
    start_date: v.startDate,
    end_date: v.endDate,
    renewal_notice_days: v.renewalNoticeDays,
    notes: v.notes,
  };
  const supabase = await createSupabaseServerClient();
  const { error } = contractId
    ? await supabase.from("client_contracts").update(row).eq("id", contractId).eq("client_id", clientId)
    : await supabase.from("client_contracts").insert({ ...row, client_id: clientId, organization_id: ctx.organization.id });
  if (error) return fromPostgrestError(error);

  revalidate(clientId);
  return ok(undefined, contractId ? "Contract updated." : "Contract added.");
}

export async function setContractArchived(clientId: string, contractId: string, archived: boolean): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(clientId).success || !uuid.safeParse(contractId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("client.manage")) return fail(NO_PERMISSION);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("client_contracts")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", contractId)
    .eq("client_id", clientId)
    .select("id")
    .maybeSingle();
  if (error) return fromPostgrestError(error);
  if (!data) return fail("That contract was not found.");

  revalidate(clientId);
  return ok(undefined, archived ? "Contract archived." : "Contract restored.");
}
