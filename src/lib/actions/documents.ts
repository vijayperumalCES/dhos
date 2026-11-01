"use server";

import { revalidatePath } from "next/cache";

import { requireOrgContext } from "@/lib/auth/org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation/common";
import { documentMetaSchema, documentSchema, documentVersionSchema } from "@/lib/validation/governance";

import { fail, fromPostgrestError, fromZodError, ok, type ActionResult } from "./result";

function revalidate(documentId?: string) {
  revalidatePath("/documents");
  if (documentId) revalidatePath(`/documents/${documentId}`);
}

const NO_PERMISSION = "You don't have permission to manage documents.";

export async function createDocument(projectId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(projectId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("document.manage")) return fail(NO_PERMISSION);
  const parsed = documentSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_document", {
    p_project: projectId,
    p_title: v.title,
    p_type: v.docType,
    p_visibility: v.visibility,
    p_description: v.description ?? "",
    p_content: v.content ?? "",
    p_url: v.url ?? "",
    p_note: v.note ?? undefined,
  });
  if (error) return fromPostgrestError(error);

  revalidate();
  return ok({ id: data }, "Document created as version 1.");
}

export async function addDocumentVersion(documentId: string, input: unknown): Promise<ActionResult<{ version: number }>> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(documentId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("document.manage")) return fail(NO_PERMISSION);
  const parsed = documentVersionSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("add_document_version", {
    p_document: documentId,
    p_content: parsed.data.content ?? "",
    p_url: parsed.data.url ?? "",
    p_note: parsed.data.note ?? undefined,
  });
  if (error) return fromPostgrestError(error);

  revalidate(documentId);
  return ok({ version: data }, `Saved as version ${data}.`);
}

export async function updateDocumentDetails(documentId: string, input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(documentId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("document.manage")) return fail(NO_PERMISSION);
  const parsed = documentMetaSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("documents")
    .update({ title: parsed.data.title, doc_type: parsed.data.docType, visibility: parsed.data.visibility, description: parsed.data.description })
    .eq("id", documentId)
    .select("id")
    .maybeSingle();
  if (error) return fromPostgrestError(error);
  if (!data) return fail("That document was not found.");

  revalidate(documentId);
  return ok(undefined, "Document updated.");
}

export async function setDocumentArchived(documentId: string, archived: boolean): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(documentId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("document.manage")) return fail(NO_PERMISSION);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("documents")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", documentId)
    .select("id")
    .maybeSingle();
  if (error) return fromPostgrestError(error);
  if (!data) return fail("That document was not found.");

  revalidate(documentId);
  return ok(undefined, archived ? "Document archived." : "Document restored.");
}
