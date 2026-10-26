"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { requireOrgContext } from "@/lib/auth/org-context";
import { resolveSiteOrigin } from "@/lib/auth/site-origin";
import { parseCsvRecords } from "@/lib/csv";
import { analyseProjectImport, type ImportAnalysis } from "@/lib/data/project-import";
import { env } from "@/lib/env";
import { sendInvitationEmail } from "@/lib/supabase/email-client";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { inviteMemberSchema } from "@/lib/validation/organization";

import { fail, fromPostgrestError, ok, type ActionResult } from "./result";

const MAX_INVITES = 100;

export async function previewProjectImport(csvText: string): Promise<ActionResult<ImportAnalysis>> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("project.create")) return fail("You don't have permission to create projects.");
  if (typeof csvText !== "string") return fail("Invalid file.");
  return ok(await analyseProjectImport(ctx, csvText));
}

/** All-or-nothing: re-validates on the server and inserts only when every row is valid. */
export async function commitProjectImport(csvText: string): Promise<ActionResult<{ created: number }>> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("project.create")) return fail("You don't have permission to create projects.");
  if (typeof csvText !== "string") return fail("Invalid file.");

  const analysis = await analyseProjectImport(ctx, csvText);
  if (analysis.fatal) return fail(analysis.fatal);
  const invalid = analysis.rows.filter((r) => r.errors.length > 0);
  if (invalid.length) return fail(`${invalid.length} row(s) have errors. Fix them and preview again.`);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("projects")
    .insert(analysis.rows.map((r) => ({ ...r.row!, organization_id: ctx.organization.id })));
  if (error) return fromPostgrestError(error, { duplicate: "One of the project codes is already in use. Nothing was imported." });

  revalidatePath("/projects");
  revalidatePath("/dashboard");
  return ok({ created: analysis.rows.length }, `Imported ${analysis.rows.length} project(s).`);
}

export type InviteImportResult = { line: number; email: string; status: "invited" | "invited_no_email" | "error"; message: string };

/** Bulk invitations from CSV (`email`, optional `roles` separated by `;`, default developer). */
export async function importInvitations(csvText: string): Promise<ActionResult<InviteImportResult[]>> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("org.members.manage")) return fail("You don't have permission to invite members.");
  if (typeof csvText !== "string" || csvText.length > 200_000) return fail("Invalid or oversized file.");

  let records: Record<string, string>[];
  try {
    const parsed = parseCsvRecords(csvText);
    if (!parsed.headers.includes("email")) return fail("The file needs an “email” column.");
    records = parsed.records;
  } catch (e) {
    return fail(`The file isn't valid CSV: ${(e as Error).message}`);
  }
  if (records.length === 0) return fail("The file has no data rows.");
  if (records.length > MAX_INVITES) return fail(`At most ${MAX_INVITES} invitations per import.`);

  const supabase = await createSupabaseServerClient();
  const origin = resolveSiteOrigin(await headers(), env.NEXT_PUBLIC_SITE_URL);
  const results: InviteImportResult[] = [];

  for (const [i, r] of records.entries()) {
    const line = i + 2;
    const parsed = inviteMemberSchema.safeParse({
      email: r.email ?? "",
      roleKeys: (r.roles || "developer").split(/[;|]/).map((k) => k.trim().toLowerCase()).filter(Boolean),
    });
    if (!parsed.success) {
      results.push({ line, email: r.email ?? "", status: "error", message: parsed.error.issues[0].message });
      continue;
    }
    const { data: invitationId, error } = await supabase.rpc("invite_member", {
      p_org: ctx.organization.id,
      p_email: parsed.data.email,
      p_role_keys: parsed.data.roleKeys,
    });
    if (error) {
      const mapped = fromPostgrestError(error, { duplicate: "Already a member." });
      results.push({ line, email: parsed.data.email, status: "error", message: mapped.ok ? "" : mapped.error });
      continue;
    }
    const sent = await sendInvitationEmail(parsed.data.email, origin);
    if (sent.ok) await supabase.rpc("record_invitation_email_sent", { p_invitation: invitationId });
    results.push({
      line,
      email: parsed.data.email,
      status: sent.ok ? "invited" : "invited_no_email",
      message: sent.ok ? "Invited and emailed." : `Invited; email not sent (${sent.reason}).`,
    });
  }

  revalidatePath("/admin/members");
  const invited = results.filter((r) => r.status !== "error").length;
  return ok(results, `${invited} of ${results.length} invitation(s) recorded.`);
}
