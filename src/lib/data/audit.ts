import "server-only";

import type { OrgContext } from "@/lib/auth/org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { resolveUserNames } from "./projects";

export const AUDIT_PAGE_SIZE = 50;

export async function listAuditLogs(
  ctx: OrgContext,
  opts: { entityType?: string; entityId?: string; page?: number; pageSize?: number } = {},
) {
  if (!ctx.permissions.has("audit.read")) return { rows: [], total: 0, page: 1, pageSize: AUDIT_PAGE_SIZE, names: new Map() };
  const supabase = await createSupabaseServerClient();
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? AUDIT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  let query = supabase
    .from("audit_logs")
    .select("id, actor_id, action, entity_type, entity_id, changes, metadata, occurred_at", { count: "exact" })
    .eq("organization_id", ctx.organization.id)
    .order("occurred_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (opts.entityType) query = query.eq("entity_type", opts.entityType);
  if (opts.entityId) query = query.eq("entity_id", opts.entityId);
  const { data, count, error } = await query;
  if (error) throw new Error(`Failed to load audit log: ${error.message}`);
  const rows = data ?? [];
  const names = await resolveUserNames(rows.map((r) => r.actor_id));
  return { rows, total: count ?? 0, page, pageSize, names };
}

export const AUDITED_ENTITY_TYPES = [
  "projects",
  "project_memberships",
  "teams",
  "team_members",
  "clients",
  "organizations",
  "organization_settings",
  "organization_memberships",
  "membership_roles",
  "organization_invitations",
  "role_definitions",
  "departments",
] as const;
