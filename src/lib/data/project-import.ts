import "server-only";

import type { OrgContext } from "@/lib/auth/org-context";
import { parseCsvRecords } from "@/lib/csv";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NONE } from "@/lib/validation/common";
import { projectFormSchema, toProjectRow } from "@/lib/validation/project";

import { listMembers } from "./members";

export const PROJECT_IMPORT_MAX_ROWS = 500;
export const PROJECT_IMPORT_MAX_BYTES = 1_000_000;

export const PROJECT_IMPORT_COLUMNS = [
  "code",
  "name",
  "description",
  "client",
  "sponsor",
  "project_manager_email",
  "delivery_owner_email",
  "primary_team",
  "methodology",
  "planned_start_date",
  "target_end_date",
  "objectives",
  "scope",
  "assumptions",
  "constraints",
] as const;

export type ImportRowResult = {
  line: number;
  code: string;
  name: string;
  errors: string[];
  row?: ReturnType<typeof toProjectRow>;
};

export type ImportAnalysis = { fatal?: string; rows: ImportRowResult[] };

/**
 * Validates a project CSV against the same Zod schema as the form, resolving client codes or
 * names, member emails and team names within the caller's organization. Every reference must
 * resolve — nothing is silently dropped.
 */
export async function analyseProjectImport(ctx: OrgContext, csvText: string): Promise<ImportAnalysis> {
  if (csvText.length > PROJECT_IMPORT_MAX_BYTES) return { fatal: "The file is larger than 1 MB.", rows: [] };

  let parsed: ReturnType<typeof parseCsvRecords>;
  try {
    parsed = parseCsvRecords(csvText);
  } catch (e) {
    return { fatal: `The file isn't valid CSV: ${(e as Error).message}`, rows: [] };
  }
  const { headers, records } = parsed;
  const missing = ["code", "name"].filter((h) => !headers.includes(h));
  if (missing.length) return { fatal: `Missing required column(s): ${missing.join(", ")}.`, rows: [] };
  const unknown = headers.filter((h) => !(PROJECT_IMPORT_COLUMNS as readonly string[]).includes(h));
  if (unknown.length) return { fatal: `Unknown column(s): ${unknown.join(", ")}. Download the template for the expected columns.`, rows: [] };
  if (records.length === 0) return { fatal: "The file has no data rows.", rows: [] };
  if (records.length > PROJECT_IMPORT_MAX_ROWS) return { fatal: `At most ${PROJECT_IMPORT_MAX_ROWS} rows per import.`, rows: [] };

  const supabase = await createSupabaseServerClient();
  const [members, clients, teams, existing] = await Promise.all([
    listMembers(ctx),
    supabase.from("clients").select("id, name, code").eq("organization_id", ctx.organization.id).is("archived_at", null),
    supabase.from("teams").select("id, name").eq("organization_id", ctx.organization.id).is("archived_at", null),
    supabase.from("projects").select("code").eq("organization_id", ctx.organization.id),
  ]);
  const memberByEmail = new Map(members.map((m) => [m.email.toLowerCase(), m.id]));
  const clientByKey = new Map<string, string>();
  for (const c of clients.data ?? []) {
    clientByKey.set(c.name.toLowerCase(), c.id);
    if (c.code) clientByKey.set(c.code.toLowerCase(), c.id);
  }
  const teamByName = new Map((teams.data ?? []).map((t) => [t.name.toLowerCase(), t.id]));
  // Codes are unique per organization including projects the caller cannot see; the insert
  // will still reject those, but most clashes are caught here.
  const takenCodes = new Set((existing.data ?? []).map((p) => p.code));
  const seen = new Set<string>();

  const rows = records.map((r, i): ImportRowResult => {
    const errors: string[] = [];
    const ref = (value: string, map: Map<string, string>, label: string) => {
      if (!value) return NONE;
      const id = map.get(value.toLowerCase());
      if (!id) errors.push(`${label} “${value}” was not found.`);
      return id ?? NONE;
    };
    const input = {
      code: r.code ?? "",
      name: r.name ?? "",
      description: r.description ?? "",
      clientId: ref(r.client ?? "", clientByKey, "Client"),
      sponsorName: r.sponsor ?? "",
      projectManagerId: ref(r.project_manager_email ?? "", memberByEmail, "Project manager"),
      deliveryOwnerId: ref(r.delivery_owner_email ?? "", memberByEmail, "Delivery owner"),
      primaryTeamId: ref(r.primary_team ?? "", teamByName, "Team"),
      methodology: (r.methodology || "scrum").toLowerCase(),
      plannedStartDate: r.planned_start_date ?? "",
      targetEndDate: r.target_end_date ?? "",
      objectives: r.objectives ?? "",
      scopeSummary: r.scope ?? "",
      assumptions: r.assumptions ?? "",
      projectConstraints: r.constraints ?? "",
    };
    const result = projectFormSchema.safeParse(input);
    if (!result.success) {
      for (const issue of result.error.issues) errors.push(`${issue.path.join(".") || "row"}: ${issue.message}`);
    }
    const code = result.success ? result.data.code : input.code.toUpperCase();
    if (code && takenCodes.has(code)) errors.push(`Code ${code} is already used by another project.`);
    if (code && seen.has(code)) errors.push(`Code ${code} appears more than once in this file.`);
    seen.add(code);
    return {
      line: i + 2, // header is line 1
      code,
      name: input.name,
      errors,
      row: result.success && errors.length === 0 ? toProjectRow(result.data) : undefined,
    };
  });

  return { rows };
}
