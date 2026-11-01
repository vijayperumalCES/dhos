import "server-only";

import type { OrgContext } from "@/lib/auth/org-context";
import {
  buildGovernanceReportMarkdown,
  contractTiming,
  escalationTiming,
  isPastDue,
  redWithoutRecovery,
  riskRating,
  summarizeGates,
  type ContractStatus,
  type EscalationStatus,
  type GateStatus,
  type GovernanceReport,
} from "@/lib/domain/governance";
import { todayInTimeZone } from "@/lib/domain/time";
import { personName } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { GovernanceFilters } from "@/lib/validation/governance";

import { sanitizeSearch } from "./search";

const PERSON = "id, user_profiles(display_name)";
// Literal strings, not a helper function: the Supabase client derives result types from the select string.
const PROJECT = {
  raid_items: "project:projects!raid_items_project_id_organization_id_fkey(id, code, name)",
  project_actions: "project:projects!project_actions_project_id_organization_id_fkey(id, code, name)",
  decisions: "project:projects!decisions_project_id_organization_id_fkey(id, code, name)",
  escalations: "project:projects!escalations_project_id_organization_id_fkey(id, code, name)",
  change_requests: "project:projects!change_requests_project_id_organization_id_fkey(id, code, name)",
  releases: "project:projects!releases_project_id_organization_id_fkey(id, code, name)",
} as const;
const LIST_LIMIT = 500;

/** Projects a governance record can be filed against: the ones the viewer can see and that are not archived. */
export async function listGovernanceProjects(ctx: OrgContext) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, code, name")
    .eq("organization_id", ctx.organization.id)
    .is("archived_at", null)
    .order("code");
  if (error) throw new Error(`Failed to load projects: ${error.message}`);
  return (data ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }));
}

export async function listRaidItems(ctx: OrgContext, filters: GovernanceFilters & { archived?: boolean }) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("raid_items")
    .select(
      `id, project_id, type, title, description, status, probability, impact, score, due_date, mitigation, contingency, resolution_note,
       resolved_at, created_at, updated_at, archived_at, owner_membership_id,
       ${PROJECT.raid_items},
       owner:organization_memberships!raid_items_owner_membership_id_organization_id_fkey(${PERSON})`,
    )
    .eq("organization_id", ctx.organization.id);
  query = filters.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (filters.project) query = query.eq("project_id", filters.project);
  if (filters.type) query = query.eq("type", filters.type as "risk");
  if (filters.owner) query = query.eq("owner_membership_id", filters.owner);
  if (filters.status === "open") query = query.in("status", ["open", "in_progress"]);
  else if (filters.status === "closed") query = query.in("status", ["resolved", "accepted", "closed"]);
  else if (filters.status) query = query.eq("status", filters.status as "open");
  const q = sanitizeSearch(filters.q);
  if (q) query = query.ilike("title", `%${q}%`);
  const { data, error } = await query
    .order("score", { ascending: false, nullsFirst: false })
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(LIST_LIMIT);
  if (error) throw new Error(`Failed to load the RAID register: ${error.message}`);
  return data ?? [];
}
export type RaidRow = Awaited<ReturnType<typeof listRaidItems>>[number];

export async function listProjectActions(ctx: OrgContext, filters: GovernanceFilters & { mine?: boolean }) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("project_actions")
    .select(
      `id, project_id, title, description, status, due_date, completed_at, created_at, owner_membership_id, raid_item_id, decision_id,
       ${PROJECT.project_actions},
       owner:organization_memberships!project_actions_owner_membership_id_organization_id_fkey(${PERSON}),
       raid:raid_items!project_actions_raid_item_id_project_id_organization_id_fkey(id, title),
       decision:decisions!project_actions_decision_id_project_id_organization_id_fkey(id, title)`,
    )
    .eq("organization_id", ctx.organization.id);
  if (filters.project) query = query.eq("project_id", filters.project);
  if (filters.mine) query = query.eq("owner_membership_id", ctx.membershipId);
  else if (filters.owner) query = query.eq("owner_membership_id", filters.owner);
  if (filters.status === "open") query = query.in("status", ["open", "in_progress"]);
  else if (filters.status === "closed") query = query.in("status", ["done", "cancelled"]);
  else if (filters.status) query = query.eq("status", filters.status as "open");
  const q = sanitizeSearch(filters.q);
  if (q) query = query.ilike("title", `%${q}%`);
  const { data, error } = await query.order("due_date", { ascending: true }).limit(LIST_LIMIT);
  if (error) throw new Error(`Failed to load actions: ${error.message}`);
  return data ?? [];
}
export type ActionRow = Awaited<ReturnType<typeof listProjectActions>>[number];

export async function listDecisions(ctx: OrgContext, filters: GovernanceFilters) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("decisions")
    .select(
      `id, project_id, title, context, decision, rationale, consequences, status, decided_on, superseded_by_id, created_at,
       ${PROJECT.decisions},
       decider:organization_memberships!decisions_decided_by_membership_id_organization_id_fkey(${PERSON})`,
    )
    .eq("organization_id", ctx.organization.id);
  if (filters.project) query = query.eq("project_id", filters.project);
  if (filters.status) query = query.eq("status", filters.status as "proposed");
  const q = sanitizeSearch(filters.q);
  if (q) query = query.ilike("title", `%${q}%`);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(LIST_LIMIT);
  if (error) throw new Error(`Failed to load decisions: ${error.message}`);
  return data ?? [];
}
export type DecisionRow = Awaited<ReturnType<typeof listDecisions>>[number];

export async function listEscalations(ctx: OrgContext, filters: GovernanceFilters) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("escalations")
    .select(
      `id, project_id, title, description, severity, status, respond_by, acknowledged_at, resolved_at, resolution_note, created_at,
       escalated_to_membership_id, raid_item_id,
       ${PROJECT.escalations},
       escalated_to:organization_memberships!escalations_escalated_to_membership_id_organization_id_fkey(${PERSON}),
       raised_by:organization_memberships!escalations_raised_by_membership_id_organization_id_fkey(${PERSON}),
       raid:raid_items!escalations_raid_item_id_project_id_organization_id_fkey(id, title),
       evidence:escalation_evidence(id, kind, title, url, note, created_at)`,
    )
    .eq("organization_id", ctx.organization.id);
  if (filters.project) query = query.eq("project_id", filters.project);
  if (filters.status === "open") query = query.in("status", ["open", "acknowledged"]);
  else if (filters.status) query = query.eq("status", filters.status as "open");
  const q = sanitizeSearch(filters.q);
  if (q) query = query.ilike("title", `%${q}%`);
  const { data, error } = await query.order("respond_by", { ascending: true }).limit(LIST_LIMIT);
  if (error) throw new Error(`Failed to load escalations: ${error.message}`);
  return data ?? [];
}
export type EscalationRow = Awaited<ReturnType<typeof listEscalations>>[number];

export async function listChangeRequests(ctx: OrgContext, filters: GovernanceFilters) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("change_requests")
    .select(
      `id, project_id, title, description, justification, impact_schedule_days, impact_effort_hours, impact_scope, impact_risk, status,
       submitted_at, decided_at, decision_note, implemented_at, created_at, requested_by_membership_id,
       ${PROJECT.change_requests},
       requester:organization_memberships!change_requests_requested_by_membership_id_organization_id_fkey(${PERSON}),
       decider:organization_memberships!change_requests_decided_by_membership_id_organization_id_fkey(${PERSON})`,
    )
    .eq("organization_id", ctx.organization.id);
  if (filters.project) query = query.eq("project_id", filters.project);
  if (filters.status === "open") query = query.in("status", ["draft", "submitted"]);
  else if (filters.status) query = query.eq("status", filters.status as "draft");
  const q = sanitizeSearch(filters.q);
  if (q) query = query.ilike("title", `%${q}%`);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(LIST_LIMIT);
  if (error) throw new Error(`Failed to load change requests: ${error.message}`);
  return data ?? [];
}
export type ChangeRequestRow = Awaited<ReturnType<typeof listChangeRequests>>[number];

/** Counts for the project Governance tab, from the rows the viewer can see. */
export async function getProjectGovernanceCounts(projectId: string) {
  const supabase = await createSupabaseServerClient();
  const head = { count: "exact", head: true } as const;
  const [risks, issues, actions, escalations, changes, decisions] = await Promise.all([
    supabase.from("raid_items").select("id", head).eq("project_id", projectId).eq("type", "risk").in("status", ["open", "in_progress"]).is("archived_at", null),
    supabase.from("raid_items").select("id", head).eq("project_id", projectId).eq("type", "issue").in("status", ["open", "in_progress"]).is("archived_at", null),
    supabase.from("project_actions").select("id", head).eq("project_id", projectId).in("status", ["open", "in_progress"]),
    supabase.from("escalations").select("id", head).eq("project_id", projectId).in("status", ["open", "acknowledged"]),
    supabase.from("change_requests").select("id", head).eq("project_id", projectId).eq("status", "submitted"),
    supabase.from("decisions").select("id", head).eq("project_id", projectId).eq("status", "proposed"),
  ]);
  return {
    openRisks: risks.count ?? 0,
    openIssues: issues.count ?? 0,
    openActions: actions.count ?? 0,
    openEscalations: escalations.count ?? 0,
    pendingChanges: changes.count ?? 0,
    proposedDecisions: decisions.count ?? 0,
  };
}

/**
 * The executive governance report. Everything is read through the viewer's own session, so the
 * report can never contain a record the viewer couldn't open on its own page.
 */
export async function getGovernanceReport(ctx: OrgContext, now = new Date()): Promise<GovernanceReport> {
  const supabase = await createSupabaseServerClient();
  const org = ctx.organization.id;
  const today = todayInTimeZone(now, ctx.settings.timezone);
  const canReleases = ctx.permissions.has("release.read");
  const canContracts = ctx.permissions.has("client.read");

  const [raid, actions, escalations, changes, releases, redProjects, contracts] = await Promise.all([
    supabase
      .from("raid_items")
      .select(
        `id, type, title, score, due_date, project_id,
         ${PROJECT.raid_items},
         owner:organization_memberships!raid_items_owner_membership_id_organization_id_fkey(${PERSON})`,
      )
      .eq("organization_id", org)
      .is("archived_at", null)
      .in("status", ["open", "in_progress"]),
    supabase.from("project_actions").select("id, due_date").eq("organization_id", org).in("status", ["open", "in_progress"]),
    supabase
      .from("escalations")
      .select(
        `id, title, severity, status, respond_by,
         ${PROJECT.escalations},
         to:organization_memberships!escalations_escalated_to_membership_id_organization_id_fkey(${PERSON})`,
      )
      .eq("organization_id", org)
      .in("status", ["open", "acknowledged"]),
    supabase.from("change_requests").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("status", "submitted"),
    canReleases
      ? supabase
          .from("releases")
          .select(
            `id, name, status, planned_date,
             ${PROJECT.releases},
             gates:release_gates(is_required, status)`,
          )
          .eq("organization_id", org)
          .in("status", ["planned", "in_review", "approved"])
          .order("planned_date", { ascending: true, nullsFirst: false })
          .limit(20)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("projects")
      .select("id, code, name")
      .eq("organization_id", org)
      .eq("health", "red")
      .is("archived_at", null)
      .not("status", "in", "(completed,cancelled)"),
    canContracts
      ? supabase
          .from("client_contracts")
          .select("id, title, end_date, status, renewal_notice_days, client:clients!client_contracts_client_id_organization_id_fkey(name)")
          .eq("organization_id", org)
          .eq("status", "active")
          .is("archived_at", null)
          .not("end_date", "is", null)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [raid, actions, escalations, changes, releases, redProjects, contracts]) {
    if (r.error) throw new Error(`Failed to build the governance report: ${r.error.message}`);
  }

  // Red projects: when did each turn red, and has anything been recorded since?
  const red = redProjects.data ?? [];
  let recovering: ReturnType<typeof redWithoutRecovery> = [];
  if (red.length) {
    const ids = red.map((p) => p.id);
    const [history, a, e, r] = await Promise.all([
      supabase
        .from("project_status_history")
        .select("project_id, changed_at")
        .in("project_id", ids)
        .eq("change_type", "health")
        .eq("to_health", "red")
        .order("changed_at", { ascending: false }),
      supabase.from("project_actions").select("project_id, created_at").in("project_id", ids),
      supabase.from("escalations").select("project_id, created_at").in("project_id", ids),
      supabase.from("raid_items").select("project_id, created_at").in("project_id", ids),
    ]);
    for (const x of [history, a, e, r]) if (x.error) throw new Error(`Failed to build the governance report: ${x.error.message}`);
    const redSince = new Map<string, string>();
    for (const h of history.data ?? []) if (!redSince.has(h.project_id)) redSince.set(h.project_id, h.changed_at);
    recovering = redWithoutRecovery(
      red.filter((p) => redSince.has(p.id)).map((p) => ({ projectId: p.id, code: p.code, name: p.name, redSince: redSince.get(p.id)! })),
      [...(a.data ?? []), ...(e.data ?? []), ...(r.data ?? [])].map((x) => ({ projectId: x.project_id, at: x.created_at })),
      now,
    );
  }

  const raidRows = raid.data ?? [];
  const risks = raidRows.filter((x) => x.type === "risk");
  const rating = (x: { score: number | null }) => riskRating(x.score);
  const escRows = (escalations.data ?? []).map((x) => ({ ...x, timing: escalationTiming({ status: x.status as EscalationStatus, respond_by: x.respond_by }, now) }));
  const dateOf = (iso: string) => todayInTimeZone(new Date(iso), ctx.settings.timezone);

  return {
    organization: ctx.organization.name,
    generatedOn: today,
    timezone: ctx.settings.timezone,
    openRisks: { total: risks.length, high: risks.filter((x) => rating(x) === "high").length, critical: risks.filter((x) => rating(x) === "critical").length },
    openIssues: raidRows.filter((x) => x.type === "issue").length,
    overdueRaid: raidRows.filter((x) => isPastDue(x.due_date, today)).length,
    openActions: (actions.data ?? []).length,
    overdueActions: (actions.data ?? []).filter((x) => isPastDue(x.due_date, today)).length,
    escalations: { open: escRows.length, overdue: escRows.filter((x) => x.timing === "overdue").length },
    pendingChanges: changes.count ?? 0,
    releasesDue: (releases.data ?? []).map((x) => {
      const g = summarizeGates(x.gates as { is_required: boolean; status: GateStatus }[]);
      return {
        name: x.name,
        project: x.project?.code ?? "—",
        plannedDate: x.planned_date,
        status: x.status.replace("_", " "),
        gatesReady: `${g.requiredReady}/${g.requiredTotal}`,
      };
    }),
    topRisks: [...risks]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 5)
      .map((x) => ({ project: x.project?.code ?? "—", title: x.title, score: x.score ?? 0, owner: personName(x.owner), due: x.due_date })),
    openEscalations: escRows
      .sort((a, b) => a.respond_by.localeCompare(b.respond_by))
      .slice(0, 10)
      .map((x) => ({
        project: x.project?.code ?? "—",
        title: x.title,
        severity: x.severity,
        to: personName(x.to),
        respondBy: dateOf(x.respond_by),
        overdue: x.timing === "overdue",
      })),
    redWithoutRecovery: recovering,
    expiringContracts: (contracts.data ?? [])
      .map((c) => ({ c, t: contractTiming({ status: c.status as ContractStatus, end_date: c.end_date, renewal_notice_days: c.renewal_notice_days }, today) }))
      .filter((x) => x.t.kind === "expiring")
      .sort((a, b) => (a.t.daysLeft ?? 0) - (b.t.daysLeft ?? 0))
      .map((x) => ({ client: x.c.client?.name ?? "Restricted client", title: x.c.title, endDate: x.c.end_date!, daysLeft: x.t.daysLeft ?? 0 })),
  };
}

export async function getGovernanceReportMarkdown(ctx: OrgContext) {
  return buildGovernanceReportMarkdown(await getGovernanceReport(ctx));
}
