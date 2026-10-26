"use server";

import { revalidatePath } from "next/cache";

import { requireOrgContext } from "@/lib/auth/org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation/common";
import { teamFormSchema, teamMemberSchema } from "@/lib/validation/organization";

import { fail, fromPostgrestError, fromZodError, ok, type ActionResult } from "./result";

const DUPLICATE_NAME = "An active team with that name already exists.";

function revalidateTeam(id?: string) {
  revalidatePath("/teams");
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/teams/${id}`);
}

export async function createTeam(input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("team.manage")) return fail("You don't have permission to manage teams.");
  const parsed = teamFormSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("teams")
    .insert({
      organization_id: ctx.organization.id,
      name: parsed.data.name,
      description: parsed.data.description,
      lead_membership_id: parsed.data.leadMembershipId,
    })
    .select("id")
    .single();
  if (error) return fromPostgrestError(error, { duplicate: DUPLICATE_NAME });

  revalidateTeam();
  return ok({ id: data.id }, "Team created.");
}

export async function updateTeam(teamId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(teamId).success) return fail("Invalid team.");
  if (!ctx.permissions.has("team.manage")) return fail("You don't have permission to manage teams.");
  const parsed = teamFormSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("teams")
    .update({
      name: parsed.data.name,
      description: parsed.data.description,
      lead_membership_id: parsed.data.leadMembershipId,
    })
    .eq("id", teamId)
    .eq("organization_id", ctx.organization.id)
    .select("id")
    .maybeSingle();
  if (error) return fromPostgrestError(error, { duplicate: DUPLICATE_NAME });
  if (!data) return fail("The team was not found or you can no longer edit it.");

  revalidateTeam(teamId);
  return ok({ id: data.id }, "Team updated.");
}

export async function setTeamArchived(teamId: string, archived: boolean): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(teamId).success) return fail("Invalid team.");
  if (!ctx.permissions.has("team.manage")) return fail("You don't have permission to manage teams.");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("teams")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", teamId)
    .eq("organization_id", ctx.organization.id)
    .select("id")
    .maybeSingle();
  if (error) {
    return fromPostgrestError(error, { duplicate: "An active team already uses this name. Rename one of them first." });
  }
  if (!data) return fail("The team was not found.");

  revalidateTeam(teamId);
  return ok(undefined, archived ? "Team archived." : "Team restored.");
}

export async function addTeamMember(input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("team.manage")) return fail("You don't have permission to manage teams.");
  const parsed = teamMemberSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("team_members").insert({
    organization_id: ctx.organization.id,
    team_id: parsed.data.teamId,
    membership_id: parsed.data.membershipId,
    team_role: parsed.data.teamRole,
  });
  if (error) return fromPostgrestError(error, { duplicate: "That person is already on this team." });

  revalidateTeam(parsed.data.teamId);
  return ok(undefined, "Member added.");
}

export async function removeTeamMember(teamId: string, membershipId: string): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(teamId).success || !uuid.safeParse(membershipId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("team.manage")) return fail("You don't have permission to manage teams.");

  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from("team_members")
    .delete({ count: "exact" })
    .eq("team_id", teamId)
    .eq("membership_id", membershipId);
  if (error) return fromPostgrestError(error);
  if (!count) return fail("That member could not be removed.");

  revalidateTeam(teamId);
  return ok(undefined, "Member removed.");
}
