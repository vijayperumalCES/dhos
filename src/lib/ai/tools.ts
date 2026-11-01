import "server-only";

import type { OrgContext } from "@/lib/auth/org-context";
import type { SupabaseServerClient } from "@/lib/supabase/server";

import { indexEvidence, type EvidenceIndex } from "./guard";
import { evidenceHref, TOOL_REQUIRES, type AgentDefinition, type EvidenceRef, type ToolName } from "./registry";
import type { ProjectSnapshot } from "./signals";

/**
 * Tool layer. Every read goes through the caller's own Supabase session, so Row Level Security
 * bounds what an agent can see to exactly what the person running it can see. On top of RLS a tool
 * runs only if the agent's allow-list names it and the caller holds the tool's permission; the rest
 * are reported as limitations. Models never call tools: this fixed plan is the only data access.
 */
const ROW_LIMIT = 1000;
const PORTFOLIO_PROJECT_LIMIT = 150;
const IN_FLIGHT = ["planning", "active", "on_hold"] as const;

export type ToolCallLog = { tool: ToolName; status: "ok" | "skipped" | "truncated"; rows: number; note?: string };

export type LoadedData = {
  snapshots: ProjectSnapshot[];
  evidence: EvidenceIndex;
  toolCalls: ToolCallLog[];
  limitations: string[];
};

function allowed(def: AgentDefinition, tool: ToolName, ctx: OrgContext): boolean {
  if (!def.tools.includes(tool)) return false;
  const needs = TOOL_REQUIRES[tool];
  return !needs || ctx.permissions.any(...needs);
}

const SKIP_TEXT: Record<ToolName, string> = {
  project: "Projects",
  portfolio: "The project portfolio",
  milestones: "Milestones",
  work_items: "Work items",
  raid: "Risks and issues",
  escalations: "Escalations",
};

/** Reads the project (or the in-flight portfolio) and the allowed related records for it. */
export async function loadData(
  supabase: SupabaseServerClient,
  ctx: OrgContext,
  def: AgentDefinition,
  target: { projectId: string } | { portfolio: true },
  today: string,
): Promise<LoadedData> {
  const toolCalls: ToolCallLog[] = [];
  const limitations: string[] = [];
  const refs: EvidenceRef[] = [];
  const org = ctx.organization.id;

  const rootTool: ToolName = "projectId" in target ? "project" : "portfolio";
  if (!allowed(def, rootTool, ctx)) throw new Error("You don't have permission to read projects.");

  let projectQuery = supabase
    .from("projects")
    .select("id, code, name, status, health, health_reason, health_updated_at, target_end_date")
    .eq("organization_id", org)
    .is("archived_at", null);
  projectQuery =
    "projectId" in target
      ? projectQuery.eq("id", target.projectId)
      : projectQuery.in("status", [...IN_FLIGHT]).order("code").limit(PORTFOLIO_PROJECT_LIMIT + 1);
  const projectRes = await projectQuery;
  if (projectRes.error) throw new Error("Projects could not be read.");
  let projects = projectRes.data ?? [];
  if (projects.length === 0) throw new Error("The project was not found or you can't access it.");
  if (!("projectId" in target) && projects.length > PORTFOLIO_PROJECT_LIMIT) {
    projects = projects.slice(0, PORTFOLIO_PROJECT_LIMIT);
    limitations.push(`Only the first ${PORTFOLIO_PROJECT_LIMIT} in-flight projects (by code) were analysed.`);
    toolCalls.push({ tool: rootTool, status: "truncated", rows: projects.length });
  } else {
    toolCalls.push({ tool: rootTool, status: "ok", rows: projects.length });
  }
  const ids = projects.map((p) => p.id);
  for (const p of projects) refs.push({ table: "projects", id: p.id, label: `${p.code} ${p.name}`, href: evidenceHref("projects", { id: p.id }) });

  const note = (tool: ToolName, rows: number) => {
    if (rows >= ROW_LIMIT) {
      toolCalls.push({ tool, status: "truncated", rows });
      limitations.push(`${SKIP_TEXT[tool]} were read up to a limit of ${ROW_LIMIT} rows; there may be more.`);
    } else {
      toolCalls.push({ tool, status: "ok", rows });
    }
  };
  const skipped = (tool: ToolName): null => {
    if (def.tools.includes(tool)) {
      toolCalls.push({ tool, status: "skipped", rows: 0, note: "not permitted" });
      limitations.push(`${SKIP_TEXT[tool]} could not be read with your permissions, so they are not covered.`);
    }
    return null;
  };

  const [milestoneRes, workRes, raidRes, escRes] = await Promise.all([
    allowed(def, "milestones", ctx)
      ? supabase
          .from("project_milestones")
          .select("id, project_id, name, due_date, baseline_due_date, completed_on")
          .eq("organization_id", org)
          .in("project_id", ids)
          .is("completed_on", null)
          .order("due_date")
          .limit(ROW_LIMIT)
      : skipped("milestones"),
    allowed(def, "work_items", ctx)
      ? supabase
          .from("work_items")
          .select("id, project_id, key, title, blocked, due_date, state:workflow_states!work_items_state_id_organization_id_fkey(category)")
          .eq("organization_id", org)
          .in("project_id", ids)
          .is("archived_at", null)
          .or(`blocked.eq.true,due_date.lt.${today}`)
          .order("due_date", { nullsFirst: false })
          .limit(ROW_LIMIT)
      : skipped("work_items"),
    allowed(def, "raid", ctx)
      ? supabase
          .from("raid_items")
          .select("id, project_id, title, type, status, score, due_date")
          .eq("organization_id", org)
          .in("project_id", ids)
          .in("status", ["open", "in_progress"])
          .is("archived_at", null)
          .order("score", { ascending: false, nullsFirst: false })
          .limit(ROW_LIMIT)
      : skipped("raid"),
    allowed(def, "escalations", ctx)
      ? supabase
          .from("escalations")
          .select("id, project_id, title, status, respond_by, severity")
          .eq("organization_id", org)
          .in("project_id", ids)
          .neq("status", "resolved")
          .limit(ROW_LIMIT)
      : skipped("escalations"),
  ]);
  for (const r of [milestoneRes, workRes, raidRes, escRes]) if (r && r.error) throw new Error("Related records could not be read.");

  const milestones = milestoneRes?.data ?? null;
  const work = workRes?.data ?? null;
  const raid = raidRes?.data ?? null;
  const esc = escRes?.data ?? null;
  if (milestones) note("milestones", milestones.length);
  if (work) note("work_items", work.length);
  if (raid) note("raid", raid.length);
  if (esc) note("escalations", esc.length);

  for (const m of milestones ?? []) refs.push({ table: "project_milestones", id: m.id, label: `Milestone: ${m.name}`, href: evidenceHref("project_milestones", { id: m.id, projectId: m.project_id }) });
  for (const w of work ?? []) refs.push({ table: "work_items", id: w.id, label: `${w.key} ${w.title}`, href: evidenceHref("work_items", { id: w.id, projectId: w.project_id, key: w.key }) });
  for (const r of raid ?? []) refs.push({ table: "raid_items", id: r.id, label: `${r.type}: ${r.title}`, href: evidenceHref("raid_items", { id: r.id, projectId: r.project_id }) });
  for (const e of esc ?? []) refs.push({ table: "escalations", id: e.id, label: `Escalation: ${e.title}`, href: evidenceHref("escalations", { id: e.id, projectId: e.project_id }) });

  const snapshots: ProjectSnapshot[] = projects.map((p) => ({
    project: {
      id: p.id,
      code: p.code,
      name: p.name,
      status: p.status,
      health: p.health,
      healthReason: p.health_reason,
      healthUpdatedAt: p.health_updated_at,
      targetEndDate: p.target_end_date,
    },
    milestones: milestones
      ? milestones.filter((m) => m.project_id === p.id).map((m) => ({ id: m.id, name: m.name, dueDate: m.due_date, baselineDueDate: m.baseline_due_date, completedOn: m.completed_on }))
      : null,
    workItems: work
      ? work.filter((w) => w.project_id === p.id).map((w) => ({ id: w.id, key: w.key, title: w.title, blocked: w.blocked, dueDate: w.due_date, done: w.state?.category === "done" }))
      : null,
    raid: raid ? raid.filter((r) => r.project_id === p.id).map((r) => ({ id: r.id, title: r.title, type: r.type, status: r.status, score: r.score, dueDate: r.due_date })) : null,
    escalations: esc ? esc.filter((e) => e.project_id === p.id).map((e) => ({ id: e.id, title: e.title, status: e.status, respondBy: e.respond_by, severity: e.severity })) : null,
  }));

  return { snapshots, evidence: indexEvidence(refs), toolCalls, limitations };
}

/** Reads just the project row, for agents that need only context (requirements). */
export async function loadProjectContext(supabase: SupabaseServerClient, ctx: OrgContext, def: AgentDefinition, projectId: string) {
  if (!allowed(def, "project", ctx)) throw new Error("You don't have permission to read projects.");
  const { data, error } = await supabase
    .from("projects")
    .select("id, code, name")
    .eq("organization_id", ctx.organization.id)
    .eq("id", projectId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new Error("Projects could not be read.");
  if (!data) throw new Error("The project was not found or you can't access it.");
  const toolCalls: ToolCallLog[] = [{ tool: "project", status: "ok", rows: 1 }];
  return { project: data, toolCalls };
}
