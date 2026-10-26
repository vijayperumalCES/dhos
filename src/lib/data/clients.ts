import "server-only";

import type { OrgContext } from "@/lib/auth/org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { sanitizeSearch } from "./search";

export async function listClients(ctx: OrgContext, opts: { q?: string; archived?: "include" | "only" } = {}) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("clients")
    .select(
      "id, name, code, industry, confidentiality, archived_at, owner:organization_memberships!clients_account_owner_membership_id_organization_id_fkey(id, user_profiles(display_name)), projects(count)",
    )
    .eq("organization_id", ctx.organization.id)
    .order("name");
  if (opts.archived === "only") query = query.not("archived_at", "is", null);
  else if (opts.archived !== "include") query = query.is("archived_at", null);
  const q = sanitizeSearch(opts.q);
  if (q) query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load clients: ${error.message}`);
  return data ?? [];
}

export async function getClient(ctx: OrgContext, clientId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*, owner:organization_memberships!clients_account_owner_membership_id_organization_id_fkey(id, user_profiles(display_name))")
    .eq("organization_id", ctx.organization.id)
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load client: ${error.message}`);
  return data;
}

export async function getClientProjects(ctx: OrgContext, clientId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("projects")
    .select("id, code, name, status, health")
    .eq("organization_id", ctx.organization.id)
    .eq("client_id", clientId)
    .is("archived_at", null)
    .order("code");
  return data ?? [];
}
