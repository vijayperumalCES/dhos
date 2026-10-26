import { NextResponse, type NextRequest } from "next/server";

import { requireOrgContext } from "@/lib/auth/org-context";
import { csvResponse, toCsv } from "@/lib/csv";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PERSON = "id, user_profiles(email)";

/** CSV of every project the caller can see (RLS-scoped). `?archived=include` adds archived ones. */
export async function GET(request: NextRequest) {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.canReadProjects) return new NextResponse("Forbidden", { status: 403 });
  const includeArchived = request.nextUrl.searchParams.get("archived") === "include";

  const supabase = await createSupabaseServerClient();
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let query = supabase
      .from("projects")
      .select(
        `code, name, description, status, health, health_reason, health_updated_at, methodology, sponsor_name,
         planned_start_date, target_end_date, actual_end_date, archived_at, client_id,
         client:clients!projects_client_id_organization_id_fkey(name, code),
         manager:organization_memberships!projects_project_manager_id_organization_id_fkey(${PERSON}),
         owner:organization_memberships!projects_delivery_owner_id_organization_id_fkey(${PERSON}),
         team:teams!projects_primary_team_id_organization_id_fkey(name)`,
      )
      .eq("organization_id", ctx.organization.id)
      .order("code")
      .range(from, from + 999);
    if (!includeArchived) query = query.is("archived_at", null);
    const { data, error } = await query;
    if (error) return new NextResponse("Export failed", { status: 500 });
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const csv = toCsv(rows, [
    { header: "code", value: (r) => r.code },
    { header: "name", value: (r) => r.name },
    { header: "status", value: (r) => r.status },
    { header: "health", value: (r) => r.health },
    { header: "health_reason", value: (r) => r.health_reason },
    { header: "health_updated_at", value: (r) => r.health_updated_at },
    { header: "client_code", value: (r) => r.client?.code ?? (r.client_id && !r.client ? "RESTRICTED" : "") },
    { header: "client_name", value: (r) => r.client?.name ?? (r.client_id && !r.client ? "Restricted client" : "") },
    { header: "sponsor", value: (r) => r.sponsor_name },
    { header: "project_manager_email", value: (r) => r.manager?.user_profiles?.email },
    { header: "delivery_owner_email", value: (r) => r.owner?.user_profiles?.email },
    { header: "primary_team", value: (r) => r.team?.name },
    { header: "methodology", value: (r) => r.methodology },
    { header: "planned_start_date", value: (r) => r.planned_start_date },
    { header: "target_end_date", value: (r) => r.target_end_date },
    { header: "actual_end_date", value: (r) => r.actual_end_date },
    { header: "archived_at", value: (r) => r.archived_at },
    { header: "description", value: (r) => r.description },
  ]);

  return csvResponse(csv, `${ctx.organization.slug}-projects`);
}
