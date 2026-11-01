import { z } from "zod";

import type { Permission } from "@/lib/domain/permissions";

/**
 * Agent registry: the part of an agent definition that is part of the safety boundary and ships
 * with reviewed releases — purpose, input and output contracts, the tool allow-list and the
 * approval policy. Prompts, model settings, evaluation and the on/off switches live in the
 * database (agent_versions, agent_definitions) so operators can change and roll them back.
 */
export const AGENT_KEYS = ["project_health", "delivery_intelligence", "requirements", "reporting"] as const;
export type AgentKey = (typeof AGENT_KEYS)[number];

export const SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const SEVERITY_RANK: Record<Severity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

/** A record an agent looked at, so a human can verify a claim. Hrefs are built by the tool layer, never by a model. */
export type EvidenceRef = { table: string; id: string; label: string; href: string | null };

export const TOOL_NAMES = ["project", "milestones", "work_items", "raid", "escalations", "portfolio"] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

/** Permissions a caller needs (any of) for a tool, on top of RLS. Null means RLS alone decides. */
export const TOOL_REQUIRES: Record<ToolName, readonly Permission[] | null> = {
  project: ["project.read_all", "project.read_assigned"],
  portfolio: ["project.read_all", "project.read_assigned"],
  milestones: null,
  work_items: ["work.read"],
  raid: ["governance.read"],
  escalations: ["governance.read"],
};

export const ACTION_TYPES = ["create_work_item"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

const evidenceRefInput = z.object({ table: z.string().max(60), id: z.string().max(64) });

export const analysisOutputSchema = z.object({
  summary: z.string().trim().min(1).max(4000),
  findings: z
    .array(
      z.object({
        type: z.string().trim().min(1).max(60),
        severity: z.enum(SEVERITIES),
        title: z.string().trim().min(1).max(200),
        detail: z.string().trim().max(1000),
        evidence: z.array(evidenceRefInput).max(10),
      }),
    )
    .max(25),
  recommendedActions: z.array(z.string().trim().min(1).max(300)).max(10),
  limitations: z.array(z.string().trim().min(1).max(300)).max(10),
});
export type AnalysisOutput = z.infer<typeof analysisOutputSchema>;

export const STORY_TYPES = ["story", "task", "bug"] as const;
export const requirementsOutputSchema = z.object({
  summary: z.string().trim().min(1).max(2000),
  stories: z
    .array(
      z.object({
        title: z.string().trim().min(2).max(300),
        description: z.string().trim().max(2000),
        acceptanceCriteria: z.array(z.string().trim().min(1).max(300)).max(10),
        type: z.enum(STORY_TYPES),
      }),
    )
    .max(15),
  openQuestions: z.array(z.string().trim().min(1).max(300)).max(10),
  limitations: z.array(z.string().trim().min(1).max(300)).max(10),
});
export type RequirementsOutput = z.infer<typeof requirementsOutputSchema>;

/** The proposal an approval carries. Re-validated by the approver's action before anything is written. */
export const createWorkItemPayloadSchema = z.object({
  title: z.string().trim().min(2).max(300),
  description: z.string().trim().max(2000).default(""),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
  type: z.enum(STORY_TYPES).default("story"),
});
export type CreateWorkItemPayload = z.infer<typeof createWorkItemPayloadSchema>;

export type AgentDefinition = {
  key: AgentKey;
  name: string;
  purpose: string;
  scope: "project" | "portfolio" | "project_or_portfolio";
  kind: "analysis" | "requirements";
  tools: readonly ToolName[];
  /** Actions the agent may propose; each goes through an approval. */
  proposes: readonly ActionType[];
  approvalPolicy: string;
  /** What the caller needs, besides the agent.run permission. */
  callerNeeds: string;
  inputSchema: z.ZodType;
  timeoutMs: number;
};

const projectId = z.uuid();

export const AGENTS: Record<AgentKey, AgentDefinition> = {
  project_health: {
    key: "project_health",
    name: "Project Health",
    purpose: "Finds schedule variance, stale updates, blocked and overdue work, high risks and overdue escalations on one project.",
    scope: "project",
    kind: "analysis",
    tools: ["project", "milestones", "work_items", "raid", "escalations"],
    proposes: [],
    approvalPolicy: "Read-only. It proposes nothing; recommendations are advice for a person to act on.",
    callerNeeds: "Read access to the project",
    inputSchema: z.object({ projectId }),
    timeoutMs: 60_000,
  },
  delivery_intelligence: {
    key: "delivery_intelligence",
    name: "Delivery Intelligence",
    purpose: "Ranks where delivery attention is needed across every in-flight project you can see.",
    scope: "portfolio",
    kind: "analysis",
    tools: ["portfolio", "milestones", "work_items", "raid", "escalations"],
    proposes: [],
    approvalPolicy: "Read-only. It proposes nothing.",
    callerNeeds: "Read access to projects; it covers only the ones you can see",
    inputSchema: z.object({}),
    timeoutMs: 90_000,
  },
  requirements: {
    key: "requirements",
    name: "Requirements",
    purpose: "Turns notes or requirements text into draft stories with acceptance criteria and open questions.",
    scope: "project",
    kind: "requirements",
    tools: ["project"],
    proposes: ["create_work_item"],
    approvalPolicy: "Each draft story becomes a proposal. Nothing is created until a different person with agent.approve and work.create on the project approves it.",
    callerNeeds: "Read access to the project",
    inputSchema: z.object({ projectId, text: z.string().trim().min(20, "Paste at least a sentence or two.").max(8000, "Keep it under 8,000 characters.") }),
    timeoutMs: 60_000,
  },
  reporting: {
    key: "reporting",
    name: "Reporting",
    purpose: "Writes a short factual delivery brief for one project, or for the whole portfolio.",
    scope: "project_or_portfolio",
    kind: "analysis",
    tools: ["project", "portfolio", "milestones", "work_items", "raid", "escalations"],
    proposes: [],
    approvalPolicy: "Read-only. It drafts text; sending it anywhere is a human step.",
    callerNeeds: "Read access to the project, or to projects for a portfolio brief",
    inputSchema: z.object({ projectId: z.union([projectId, z.literal("")]).optional() }),
    timeoutMs: 60_000,
  },
};

export function isAgentKey(value: string): value is AgentKey {
  return (AGENT_KEYS as readonly string[]).includes(value);
}

export type AgentInput = Record<string, unknown>;

/** Server-side evidence hrefs, by table. Kept here so tools and tests agree on them. */
export function evidenceHref(table: string, row: { id: string; projectId?: string; key?: string }): string | null {
  switch (table) {
    case "projects":
      return `/projects/${row.id}`;
    case "project_milestones":
      return row.projectId ? `/projects/${row.projectId}/milestones` : null;
    case "work_items":
      return row.projectId && row.key ? `/projects/${row.projectId}/items/${row.key}` : null;
    case "raid_items":
    case "escalations":
      return row.projectId ? `/projects/${row.projectId}/governance` : null;
    default:
      return null;
  }
}
