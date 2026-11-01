"use server";

import { revalidatePath } from "next/cache";

import { requireOrgContext } from "@/lib/auth/org-context";
import { GATE_STATUSES, RELEASE_STATUSES, type GateStatus, type ReleaseStatus } from "@/lib/domain/governance";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation/common";
import { gateSchema, releaseSchema } from "@/lib/validation/governance";

import { fail, fromPostgrestError, fromZodError, ok, type ActionResult } from "./result";

function revalidate(releaseId?: string) {
  revalidatePath("/releases");
  if (releaseId) revalidatePath(`/releases/${releaseId}`);
  revalidatePath("/governance", "layout");
}

const NO_PERMISSION = "You don't have permission to manage releases.";

export async function saveRelease(projectId: string, releaseId: string | null, input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(projectId).success || (releaseId !== null && !uuid.safeParse(releaseId).success)) return fail("Invalid request.");
  if (!ctx.permissions.has("release.manage")) return fail(NO_PERMISSION);
  const parsed = releaseSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const row = {
    name: parsed.data.name,
    version: parsed.data.version,
    planned_date: parsed.data.plannedDate,
    notes: parsed.data.notes,
    release_manager_membership_id: parsed.data.managerId,
  };
  const supabase = await createSupabaseServerClient();
  const { error } = releaseId
    ? await supabase.from("releases").update(row).eq("id", releaseId).eq("project_id", projectId)
    : await supabase.from("releases").insert({ ...row, project_id: projectId, organization_id: ctx.organization.id });
  if (error) return fromPostgrestError(error, { duplicate: "This project already has a release with that name." });

  revalidate(releaseId ?? undefined);
  return ok(undefined, releaseId ? "Release updated." : "Release planned with the default quality gates.");
}

export async function transitionRelease(releaseId: string, to: ReleaseStatus, note?: string): Promise<ActionResult> {
  await requireOrgContext();
  if (!uuid.safeParse(releaseId).success || !RELEASE_STATUSES.includes(to)) return fail("Invalid request.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("transition_release", { p_release: releaseId, p_to: to, p_note: note?.trim() || undefined });
  if (error) return fromPostgrestError(error);

  revalidate(releaseId);
  const message: Record<ReleaseStatus, string> = {
    planned: "Release moved back to planned.",
    in_review: "Release is in review.",
    approved: "Release approved.",
    released: "Release marked as released.",
    cancelled: "Release cancelled.",
  };
  return ok(undefined, message[to]);
}

export async function recordGateResult(releaseId: string, gateId: string, status: GateStatus, note?: string): Promise<ActionResult> {
  await requireOrgContext();
  if (!uuid.safeParse(releaseId).success || !uuid.safeParse(gateId).success || !GATE_STATUSES.includes(status)) return fail("Invalid request.");
  if ((status === "failed" || status === "waived") && !note?.trim()) {
    return fail("Please correct the highlighted fields.", { note: [status === "waived" ? "Say why the gate is waived." : "Say what failed."] });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_gate_result", { p_gate: gateId, p_status: status, p_note: note?.trim() || undefined });
  if (error) return fromPostgrestError(error);

  revalidate(releaseId);
  return ok(undefined, "Gate updated.");
}

export async function addGate(releaseId: string, input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(releaseId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("release.manage")) return fail(NO_PERMISSION);
  const parsed = gateSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { data: rel, error: findError } = await supabase.from("releases").select("id, project_id").eq("id", releaseId).maybeSingle();
  if (findError) return fromPostgrestError(findError);
  if (!rel) return fail("That release was not found.");

  const { error } = await supabase.from("release_gates").insert({
    organization_id: ctx.organization.id,
    project_id: rel.project_id,
    release_id: releaseId,
    name: parsed.data.name,
    category: parsed.data.category,
    is_required: parsed.data.isRequired,
    position: 100,
  });
  if (error) return fromPostgrestError(error, { duplicate: "This release already has a gate with that name." });

  revalidate(releaseId);
  return ok(undefined, "Gate added.");
}

export async function removeGate(releaseId: string, gateId: string): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(releaseId).success || !uuid.safeParse(gateId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("release.manage")) return fail(NO_PERMISSION);

  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase.from("release_gates").delete({ count: "exact" }).eq("id", gateId).eq("release_id", releaseId);
  if (error) return fromPostgrestError(error);
  if (!count) return fail("That gate was not found, or the release is past review.");

  revalidate(releaseId);
  return ok(undefined, "Gate removed.");
}
