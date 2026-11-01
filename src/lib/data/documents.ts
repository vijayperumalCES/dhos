import "server-only";

import type { OrgContext } from "@/lib/auth/org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { sanitizeSearch } from "./search";

const PERSON = "id, user_profiles(display_name)";

export async function listDocuments(ctx: OrgContext, filters: { project?: string; type?: string; visibility?: string; q?: string; archived?: boolean }) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("documents")
    .select(
      `id, project_id, title, doc_type, visibility, description, current_version, updated_at, archived_at,
       project:projects!documents_project_id_organization_id_fkey(id, code, name),
       owner:organization_memberships!documents_owner_membership_id_organization_id_fkey(${PERSON})`,
    )
    .eq("organization_id", ctx.organization.id);
  query = filters.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (filters.project) query = query.eq("project_id", filters.project);
  if (filters.type) query = query.eq("doc_type", filters.type as "charter");
  if (filters.visibility) query = query.eq("visibility", filters.visibility as "internal");
  const q = sanitizeSearch(filters.q);
  if (q) query = query.ilike("title", `%${q}%`);
  const { data, error } = await query.order("updated_at", { ascending: false }).limit(300);
  if (error) throw new Error(`Failed to load documents: ${error.message}`);
  return data ?? [];
}
export type DocumentRow = Awaited<ReturnType<typeof listDocuments>>[number];

export async function getDocument(ctx: OrgContext, documentId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("documents")
    .select(
      `id, project_id, title, doc_type, visibility, description, current_version, created_at, updated_at, archived_at,
       project:projects!documents_project_id_organization_id_fkey(id, code, name),
       owner:organization_memberships!documents_owner_membership_id_organization_id_fkey(${PERSON}),
       versions:document_versions(id, version, content, url, change_note, created_at, created_by)`,
    )
    .eq("organization_id", ctx.organization.id)
    .eq("id", documentId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load the document: ${error.message}`);
  if (!data) return null;
  return { ...data, versions: [...data.versions].sort((a, b) => b.version - a.version) };
}
export type DocumentDetail = NonNullable<Awaited<ReturnType<typeof getDocument>>>;
