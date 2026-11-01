/**
 * Pure governance rules shared by pages, server actions and tests: RAID scoring and status flow,
 * escalation deadlines, quality-gate readiness, contract expiry, the "red with no recovery
 * action" measure and the executive report in Markdown. The database enforces the same rules;
 * this copy exists so the UI can explain them and tests can pin them.
 */
import { addDaysToDate, type DateString } from "./time";

// ---------------------------------------------------------------------------
// RAID
// ---------------------------------------------------------------------------
export const RAID_TYPES = ["risk", "assumption", "issue", "dependency"] as const;
export type RaidType = (typeof RAID_TYPES)[number];
export const RAID_TYPE_LABELS: Record<RaidType, string> = {
  risk: "Risk",
  assumption: "Assumption",
  issue: "Issue",
  dependency: "Dependency",
};

export const RAID_STATUSES = ["open", "in_progress", "resolved", "accepted", "closed"] as const;
export type RaidStatus = (typeof RAID_STATUSES)[number];
export const RAID_STATUS_LABELS: Record<RaidStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  accepted: "Accepted",
  closed: "Closed",
};

/** Only risks can be accepted; every other type is resolved or closed. */
export function raidStatusOptions(type: RaidType): RaidStatus[] {
  return type === "risk" ? [...RAID_STATUSES] : RAID_STATUSES.filter((s) => s !== "accepted");
}

export const isRaidOpen = (status: RaidStatus) => status === "open" || status === "in_progress";

/** Statuses that need a resolution note (mirrors the database trigger). */
export const raidNeedsNote = (status: RaidStatus) => status === "resolved" || status === "closed" || status === "accepted";

export type RiskRating = "low" | "medium" | "high" | "critical";
export const RISK_RATING_LABELS: Record<RiskRating, string> = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };

/** Score bands on the 5×5 matrix: 1–4 low, 5–9 medium, 10–16 high, 17–25 critical. */
export function riskRating(score: number | null | undefined): RiskRating | null {
  if (score === null || score === undefined) return null;
  if (score >= 17) return "critical";
  if (score >= 10) return "high";
  if (score >= 5) return "medium";
  return "low";
}

export const SCALE_LABELS: Record<number, string> = { 1: "Very low", 2: "Low", 3: "Medium", 4: "High", 5: "Very high" };

export function isPastDue(dueDate: DateString | null | undefined, today: DateString): boolean {
  return !!dueDate && dueDate < today;
}

// ---------------------------------------------------------------------------
// Actions and decisions
// ---------------------------------------------------------------------------
export const ACTION_STATUSES = ["open", "in_progress", "done", "cancelled"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];
export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
  cancelled: "Cancelled",
};
export const isActionOpen = (status: ActionStatus) => status === "open" || status === "in_progress";

export const DECISION_STATUSES = ["proposed", "accepted", "rejected", "superseded"] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];
export const DECISION_STATUS_LABELS: Record<DecisionStatus, string> = {
  proposed: "Proposed",
  accepted: "Accepted",
  rejected: "Rejected",
  superseded: "Superseded",
};
/** Accepted, rejected and superseded decisions are locked (the database enforces it). */
export const isDecisionLocked = (status: DecisionStatus) => status !== "proposed";

// ---------------------------------------------------------------------------
// Escalations
// ---------------------------------------------------------------------------
export const ESCALATION_SEVERITIES = ["medium", "high", "critical"] as const;
export type EscalationSeverity = (typeof ESCALATION_SEVERITIES)[number];
export const ESCALATION_SEVERITY_LABELS: Record<EscalationSeverity, string> = { medium: "Medium", high: "High", critical: "Critical" };

export const ESCALATION_STATUSES = ["open", "acknowledged", "resolved"] as const;
export type EscalationStatus = (typeof ESCALATION_STATUSES)[number];
export const ESCALATION_STATUS_LABELS: Record<EscalationStatus, string> = {
  open: "Awaiting acknowledgement",
  acknowledged: "Acknowledged",
  resolved: "Resolved",
};

export type EscalationTiming = "resolved" | "overdue" | "due_soon" | "on_track";

/** Overdue once the deadline has passed; due soon within 24 hours. Resolved escalations are never overdue. */
export function escalationTiming(e: { status: EscalationStatus; respond_by: string }, now: Date): EscalationTiming {
  if (e.status === "resolved") return "resolved";
  const left = new Date(e.respond_by).getTime() - now.getTime();
  if (left < 0) return "overdue";
  return left < 24 * 3600 * 1000 ? "due_soon" : "on_track";
}

// ---------------------------------------------------------------------------
// Change requests
// ---------------------------------------------------------------------------
export const CHANGE_STATUSES = ["draft", "submitted", "approved", "rejected", "implemented", "withdrawn"] as const;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];
export const CHANGE_STATUS_LABELS: Record<ChangeStatus, string> = {
  draft: "Draft",
  submitted: "Awaiting decision",
  approved: "Approved",
  rejected: "Rejected",
  implemented: "Implemented",
  withdrawn: "Withdrawn",
};

// ---------------------------------------------------------------------------
// Releases and gates
// ---------------------------------------------------------------------------
export const RELEASE_STATUSES = ["planned", "in_review", "approved", "released", "cancelled"] as const;
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];
export const RELEASE_STATUS_LABELS: Record<ReleaseStatus, string> = {
  planned: "Planned",
  in_review: "In review",
  approved: "Approved",
  released: "Released",
  cancelled: "Cancelled",
};

/** Moves the database allows (transition_release); the UI offers only these. */
export const RELEASE_TRANSITIONS: Record<ReleaseStatus, ReleaseStatus[]> = {
  planned: ["in_review", "cancelled"],
  in_review: ["planned", "approved", "cancelled"],
  approved: ["in_review", "released", "cancelled"],
  released: [],
  cancelled: [],
};

export const GATE_STATUSES = ["pending", "passed", "failed", "waived"] as const;
export type GateStatus = (typeof GATE_STATUSES)[number];
export const GATE_STATUS_LABELS: Record<GateStatus, string> = { pending: "Pending", passed: "Passed", failed: "Failed", waived: "Waived" };

export const GATE_CATEGORIES = ["quality", "security", "uat", "operations", "compliance"] as const;
export type GateCategory = (typeof GATE_CATEGORIES)[number];
export const GATE_CATEGORY_LABELS: Record<GateCategory, string> = {
  quality: "Quality",
  security: "Security",
  uat: "UAT",
  operations: "Operations",
  compliance: "Compliance",
};

export type GateSummary = { requiredTotal: number; requiredReady: number; failed: number; pendingRequired: number; canApprove: boolean };

/** A release can be approved only when every required gate is passed or waived. */
export function summarizeGates(gates: { is_required: boolean; status: GateStatus }[]): GateSummary {
  const required = gates.filter((g) => g.is_required);
  const ready = required.filter((g) => g.status === "passed" || g.status === "waived").length;
  return {
    requiredTotal: required.length,
    requiredReady: ready,
    failed: gates.filter((g) => g.status === "failed").length,
    pendingRequired: required.length - ready,
    canApprove: ready === required.length,
  };
}

// ---------------------------------------------------------------------------
// Client contracts
// ---------------------------------------------------------------------------
export const CONTRACT_TYPES = ["msa", "sow", "nda", "support", "other"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];
export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  msa: "Master agreement",
  sow: "Statement of work",
  nda: "NDA",
  support: "Support agreement",
  other: "Other",
};
export const CONTRACT_STATUSES = ["draft", "active", "expired", "terminated"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];
export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  draft: "Draft",
  active: "Active",
  expired: "Expired",
  terminated: "Terminated",
};

export type ContractTiming = { kind: "ended" | "expiring" | "ongoing"; daysLeft: number | null };

const DEFAULT_RENEWAL_WINDOW_DAYS = 60;

/** An active contract is "expiring" once today is inside its notice period (60 days when none is set). */
export function contractTiming(
  c: { status: ContractStatus; end_date: DateString | null; renewal_notice_days: number | null },
  today: DateString,
): ContractTiming {
  if (c.status !== "active" || !c.end_date) return { kind: "ongoing", daysLeft: null };
  const daysLeft = Math.round((Date.parse(`${c.end_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  if (daysLeft < 0) return { kind: "ended", daysLeft };
  const window = Math.max(c.renewal_notice_days ?? 0, DEFAULT_RENEWAL_WINDOW_DAYS);
  return { kind: daysLeft <= window ? "expiring" : "ongoing", daysLeft };
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------
export const DOCUMENT_TYPES = ["charter", "requirements", "specification", "design", "plan", "report", "other"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  charter: "Charter",
  requirements: "Requirements",
  specification: "Specification",
  design: "Design",
  plan: "Plan",
  report: "Report",
  other: "Other",
};
export const DOCUMENT_VISIBILITIES = ["internal", "client"] as const;
export type DocumentVisibility = (typeof DOCUMENT_VISIBILITIES)[number];
export const DOCUMENT_VISIBILITY_LABELS: Record<DocumentVisibility, string> = { internal: "Internal", client: "Shared with client" };

// ---------------------------------------------------------------------------
// Recovery after a project turns red
// ---------------------------------------------------------------------------
export type RedProject = { projectId: string; code: string; name: string; redSince: string };
export type RecoveryEvent = { projectId: string; at: string };
export type RedWithoutRecovery = RedProject & { daysRed: number };

/**
 * Red projects where nothing (an action, escalation or RAID item) has been recorded since the day
 * the project turned red. This is the "time from Red to recorded recovery action" measure: any
 * project listed here has an open interval.
 */
export function redWithoutRecovery(red: RedProject[], events: RecoveryEvent[], now: Date): RedWithoutRecovery[] {
  return red
    .filter((p) => !events.some((e) => e.projectId === p.projectId && new Date(e.at).getTime() >= new Date(p.redSince).getTime()))
    .map((p) => ({ ...p, daysRed: Math.max(0, Math.floor((now.getTime() - new Date(p.redSince).getTime()) / 86400000)) }))
    .sort((a, b) => b.daysRed - a.daysRed);
}

// ---------------------------------------------------------------------------
// Executive report
// ---------------------------------------------------------------------------
export type GovernanceReport = {
  organization: string;
  generatedOn: DateString;
  timezone: string;
  openRisks: { total: number; high: number; critical: number };
  openIssues: number;
  overdueRaid: number;
  overdueActions: number;
  openActions: number;
  escalations: { open: number; overdue: number };
  pendingChanges: number;
  releasesDue: { name: string; project: string; plannedDate: string | null; status: string; gatesReady: string }[];
  topRisks: { project: string; title: string; score: number; owner: string; due: string | null }[];
  openEscalations: { project: string; title: string; severity: string; to: string; respondBy: string; overdue: boolean }[];
  redWithoutRecovery: RedWithoutRecovery[];
  expiringContracts: { client: string; title: string; endDate: string; daysLeft: number }[];
};

const md = (text: string) => text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

/** The executive governance report as Markdown, ready to paste into an email or a status pack. */
export function buildGovernanceReportMarkdown(r: GovernanceReport): string {
  const lines: string[] = [];
  lines.push(`# Delivery governance report — ${md(r.organization)}`, "", `_Generated ${r.generatedOn} (${r.timezone}) from the records visible to the reader._`, "");

  lines.push(
    "## Summary",
    "",
    `- Open risks: **${r.openRisks.total}** (${r.openRisks.critical} critical, ${r.openRisks.high} high)`,
    `- Open issues: **${r.openIssues}**`,
    `- Overdue RAID items: **${r.overdueRaid}**`,
    `- Open actions: **${r.openActions}** (${r.overdueActions} overdue)`,
    `- Open escalations: **${r.escalations.open}** (${r.escalations.overdue} past their deadline)`,
    `- Change requests awaiting a decision: **${r.pendingChanges}**`,
    "",
  );

  if (r.redWithoutRecovery.length) {
    lines.push("## Red projects with no recorded recovery action", "");
    for (const p of r.redWithoutRecovery) lines.push(`- **${md(p.code)}** ${md(p.name)} — red for ${p.daysRed} day${p.daysRed === 1 ? "" : "s"}`);
    lines.push("");
  }

  if (r.topRisks.length) {
    lines.push("## Highest open risks", "", "| Project | Risk | Score | Owner | Due |", "|---|---|---|---|---|");
    for (const k of r.topRisks) lines.push(`| ${md(k.project)} | ${md(k.title)} | ${k.score} | ${md(k.owner)} | ${k.due ?? "—"} |`);
    lines.push("");
  }

  if (r.openEscalations.length) {
    lines.push("## Open escalations", "", "| Project | Escalation | Severity | To | Respond by |", "|---|---|---|---|---|");
    for (const e of r.openEscalations) lines.push(`| ${md(e.project)} | ${md(e.title)} | ${e.severity} | ${md(e.to)} | ${e.respondBy}${e.overdue ? " (overdue)" : ""} |`);
    lines.push("");
  }

  if (r.releasesDue.length) {
    lines.push("## Releases in flight", "", "| Project | Release | Planned | Status | Required gates |", "|---|---|---|---|---|");
    for (const x of r.releasesDue) lines.push(`| ${md(x.project)} | ${md(x.name)} | ${x.plannedDate ?? "—"} | ${x.status} | ${x.gatesReady} |`);
    lines.push("");
  }

  if (r.expiringContracts.length) {
    lines.push("## Contracts nearing their end", "");
    for (const c of r.expiringContracts) lines.push(`- ${md(c.client)} — ${md(c.title)} ends ${c.endDate} (${c.daysLeft} day${c.daysLeft === 1 ? "" : "s"})`);
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

/** Helper for "due within N days" listings. */
export function dueWithin(date: DateString | null | undefined, today: DateString, days: number): boolean {
  return !!date && date >= today && date <= addDaysToDate(today, days);
}
