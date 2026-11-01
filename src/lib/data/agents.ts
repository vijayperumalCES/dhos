import "server-only";

import type { OrgContext } from "@/lib/auth/org-context";
import { AGENT_KEYS, type AgentKey, type EvidenceRef } from "@/lib/ai/registry";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AgentRow = {
  id: string;
  key: AgentKey;
  enabled: boolean;
  activeVersionId: string | null;
  activeVersion: number | null;
};

/** Settings, and the four agents with their switch and active version. Everything runs under the viewer's RLS. */
export async function getAgentOverview(ctx: OrgContext) {
  const supabase = await createSupabaseServerClient();
  const canRead = ctx.permissions.has("agent.read");
  const [settingsRes, defsRes, versionsRes] = await Promise.all([
    canRead ? supabase.from("agent_org_settings").select("*").eq("organization_id", ctx.organization.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from("agent_definitions").select("id, key, enabled, active_version_id").eq("organization_id", ctx.organization.id),
    canRead ? supabase.from("agent_versions").select("id, version").eq("organization_id", ctx.organization.id) : Promise.resolve({ data: [], error: null }),
  ]);
  if (settingsRes.error) throw new Error(`Failed to load agent settings: ${settingsRes.error.message}`);
  if (defsRes.error) throw new Error(`Failed to load agents: ${defsRes.error.message}`);

  const versionNo = new Map((versionsRes.data ?? []).map((v) => [v.id, v.version]));
  const agents: AgentRow[] = (defsRes.data ?? [])
    .filter((d): d is typeof d & { key: AgentKey } => (AGENT_KEYS as readonly string[]).includes(d.key))
    .map((d) => ({ id: d.id, key: d.key, enabled: d.enabled, activeVersionId: d.active_version_id, activeVersion: d.active_version_id ? (versionNo.get(d.active_version_id) ?? null) : null }))
    .sort((a, b) => AGENT_KEYS.indexOf(a.key) - AGENT_KEYS.indexOf(b.key));
  return { settings: settingsRes.data, agents };
}

export type AgentDetail = Awaited<ReturnType<typeof getAgentDetail>>;

/** Versions (newest first) with their latest evaluation verdict, for the control plane. */
export async function getAgentDetail(ctx: OrgContext, key: AgentKey) {
  const supabase = await createSupabaseServerClient();
  const { data: def, error } = await supabase.from("agent_definitions").select("id, key, enabled, active_version_id").eq("organization_id", ctx.organization.id).eq("key", key).maybeSingle();
  if (error) throw new Error(`Failed to load the agent: ${error.message}`);
  if (!def) return null;

  const [versions, evals] = await Promise.all([
    supabase.from("agent_versions").select("id, version, system_prompt, model, temperature, max_tokens, notes, created_at").eq("agent_id", def.id).order("version", { ascending: false }),
    supabase.from("agent_eval_runs").select("id, version_id, passed, total_cases, passed_cases, results, created_at").eq("agent_id", def.id).order("created_at", { ascending: false }).limit(100),
  ]);
  if (versions.error) throw new Error(`Failed to load versions: ${versions.error.message}`);
  if (evals.error) throw new Error(`Failed to load evaluations: ${evals.error.message}`);

  const latestEval = new Map<string, NonNullable<typeof evals.data>[number]>();
  for (const e of evals.data ?? []) if (!latestEval.has(e.version_id)) latestEval.set(e.version_id, e);
  return {
    def,
    versions: (versions.data ?? []).map((v) => ({ ...v, latestEval: latestEval.get(v.id) ?? null })),
  };
}

export type RunFilters = { agent?: string; status?: string; page?: number };
const PAGE_SIZE = 25;

/** The viewer's own runs (the only runs RLS lets anyone read). */
export async function listRuns(ctx: OrgContext, filters: RunFilters) {
  const supabase = await createSupabaseServerClient();
  const page = Math.max(1, filters.page ?? 1);
  let q = supabase
    .from("agent_executions")
    .select("id, status, project_id, input_tokens, output_tokens, latency_ms, provider, created_at, agent:agent_definitions!agent_executions_agent_id_organization_id_fkey(key), project:projects!agent_executions_project_id_organization_id_fkey(code)", { count: "exact" })
    .eq("organization_id", ctx.organization.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (filters.status === "succeeded" || filters.status === "failed" || filters.status === "running") q = q.eq("status", filters.status);
  const { data, count, error } = await q;
  if (error) throw new Error(`Failed to load runs: ${error.message}`);
  const rows = (data ?? []).filter((r) => !filters.agent || r.agent?.key === filters.agent);
  return { rows, total: count ?? 0, pageSize: PAGE_SIZE, page };
}

export async function getRun(ctx: OrgContext, id: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("agent_executions")
    .select(
      `id, status, input, output, evidence, tool_calls, error, provider, model, input_tokens, output_tokens, estimated_cost, latency_ms, created_at, completed_at, project_id,
       agent:agent_definitions!agent_executions_agent_id_organization_id_fkey(key),
       version:agent_versions!agent_executions_version_id_organization_id_fkey(version),
       project:projects!agent_executions_project_id_organization_id_fkey(code, name)`,
    )
    .eq("organization_id", ctx.organization.id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Failed to load the run: ${error.message}`);
  if (!data) return null;
  const { data: approvals, error: aErr } = await supabase
    .from("agent_approvals")
    .select("id, action_type, summary, payload, status, decision_note, decided_at, result, created_at")
    .eq("execution_id", id)
    .order("created_at");
  if (aErr) throw new Error(`Failed to load proposals: ${aErr.message}`);
  return { run: { ...data, evidence: (data.evidence ?? []) as unknown as EvidenceRef[] }, approvals: approvals ?? [] };
}

export type ApprovalFilter = "pending" | "decided";

/** Proposals the viewer requested or may decide (RLS), with who requested and decided them. */
export async function listApprovals(ctx: OrgContext, filter: ApprovalFilter) {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("agent_approvals")
    .select(
      `id, execution_id, project_id, action_type, summary, payload, status, decision_note, decided_at, result, created_at, requested_by_membership_id, decided_by_membership_id,
       project:projects!agent_approvals_project_id_organization_id_fkey(code, name),
       requester:organization_memberships!agent_approvals_requested_by_membership_id_organization_id_fkey(user_profiles(display_name)),
       decider:organization_memberships!agent_approvals_decided_by_membership_id_organization_id_fkey(user_profiles(display_name))`,
    )
    .eq("organization_id", ctx.organization.id)
    .order("created_at", { ascending: false })
    .limit(100);
  q = filter === "pending" ? q.eq("status", "pending") : q.neq("status", "pending");
  const { data, error } = await q;
  if (error) throw new Error(`Failed to load approvals: ${error.message}`);
  return data ?? [];
}

export async function countPendingApprovals(ctx: OrgContext): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase.from("agent_approvals").select("id", { count: "exact", head: true }).eq("organization_id", ctx.organization.id).eq("status", "pending");
  return count ?? 0;
}

export async function getUsage(ctx: OrgContext, month: Date) {
  const supabase = await createSupabaseServerClient();
  const from = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const { data, error } = await supabase.rpc("agent_usage", { p_org: ctx.organization.id, p_from: from });
  if (error) throw new Error(`Failed to load usage: ${error.message}`);
  return { from, rows: data ?? [] };
}

/** Projects the viewer can run an agent on. */
export async function listRunnableProjects(ctx: OrgContext) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, code, name")
    .eq("organization_id", ctx.organization.id)
    .is("archived_at", null)
    .not("status", "in", "(cancelled)")
    .order("code")
    .limit(500);
  if (error) throw new Error(`Failed to load projects: ${error.message}`);
  return (data ?? []).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }));
}

/** Latest successful brief from the Reporting agent for the dashboard card (the viewer's own run). */
export async function getLatestBrief(ctx: OrgContext) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("agent_executions")
    .select("id, output, created_at, project:projects!agent_executions_project_id_organization_id_fkey(code), agent:agent_definitions!agent_executions_agent_id_organization_id_fkey!inner(key)")
    .eq("organization_id", ctx.organization.id)
    .eq("status", "succeeded")
    .eq("agent.key", "reporting")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const summary = (data.output as { summary?: string } | null)?.summary;
  return summary ? { id: data.id, summary, createdAt: data.created_at, projectCode: data.project?.code ?? null } : null;
}
