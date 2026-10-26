import "server-only";

import type { OrgContext } from "@/lib/auth/org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { sanitizeSearch } from "./search";

export async function listTeams(ctx: OrgContext, opts: { q?: string; archived?: "include" | "only" } = {}) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("teams")
    .select(
      "id, name, description, archived_at, updated_at, lead:organization_memberships!teams_lead_membership_id_organization_id_fkey(id, user_profiles(display_name)), team_members(count)",
    )
    .eq("organization_id", ctx.organization.id)
    .order("name");
  if (opts.archived === "only") query = query.not("archived_at", "is", null);
  else if (opts.archived !== "include") query = query.is("archived_at", null);
  const q = sanitizeSearch(opts.q);
  if (q) query = query.ilike("name", `%${q}%`);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load teams: ${error.message}`);
  return data ?? [];
}

export async function getTeam(ctx: OrgContext, teamId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("teams")
    .select(
      "*, lead:organization_memberships!teams_lead_membership_id_organization_id_fkey(id, user_profiles(display_name))",
    )
    .eq("organization_id", ctx.organization.id)
    .eq("id", teamId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load team: ${error.message}`);
  return data;
}

export async function getTeamMembers(teamId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("team_members")
    .select("membership_id, team_role, joined_at, member:organization_memberships(id, job_title, status, user_profiles(display_name, email))")
    .eq("team_id", teamId)
    .order("joined_at");
  if (error) throw new Error(`Failed to load team members: ${error.message}`);
  return data ?? [];
}

export async function getTeamProjects(ctx: OrgContext, teamId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("projects")
    .select("id, code, name, status, health")
    .eq("organization_id", ctx.organization.id)
    .eq("primary_team_id", teamId)
    .is("archived_at", null)
    .order("code");
  return data ?? [];
}
