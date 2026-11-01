import { addDaysToDate } from "@/lib/domain/time";

import { SEVERITY_RANK, type Severity } from "./registry";

/**
 * Deterministic delivery signals. These — not a model — decide which problems exist, so a finding
 * always corresponds to rows that were read, and tests can pin exact behaviour. A model (or the
 * built-in narrator) only words them. `null` in a snapshot means the tool was unavailable to the
 * caller, which is reported as a limitation instead of being read as "nothing wrong".
 */
export type ProjectSnapshot = {
  project: {
    id: string;
    code: string;
    name: string;
    status: string;
    health: string;
    healthReason: string | null;
    healthUpdatedAt: string | null;
    targetEndDate: string | null;
  };
  milestones: { id: string; name: string; dueDate: string; baselineDueDate: string | null; completedOn: string | null }[] | null;
  workItems: { id: string; key: string; title: string; blocked: boolean; dueDate: string | null; done: boolean }[] | null;
  raid: { id: string; title: string; type: string; status: string; score: number | null; dueDate: string | null }[] | null;
  escalations: { id: string; title: string; status: string; respondBy: string; severity: string }[] | null;
};

export type SignalEvidence = { table: string; id: string };
export type Signal = { type: string; severity: Severity; title: string; detail: string; evidence: SignalEvidence[]; projectId: string };

export type SignalContext = { today: string; now: Date; staleAfterDays: number };

const OPEN_RAID = new Set(["open", "in_progress"]);
const CLOSED_PROJECT = new Set(["completed", "cancelled", "proposed", "approved"]);

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function computeProjectSignals(s: ProjectSnapshot, ctx: SignalContext): Signal[] {
  const out: Signal[] = [];
  const p = s.project;
  const push = (type: string, severity: Severity, title: string, detail: string, evidence: SignalEvidence[]) =>
    out.push({ type, severity, title, detail, evidence, projectId: p.id });
  const self: SignalEvidence = { table: "projects", id: p.id };

  if (p.health === "red") push("health_red", "high", `${p.code} is rated red`, p.healthReason ? `Reason on record: ${p.healthReason}` : "No reason is recorded for the red rating.", [self]);
  else if (p.health === "amber") push("health_amber", "medium", `${p.code} is rated amber`, p.healthReason ? `Reason on record: ${p.healthReason}` : "No reason is recorded for the amber rating.", [self]);

  if (!CLOSED_PROJECT.has(p.status)) {
    if (p.healthUpdatedAt) {
      const age = daysBetween(p.healthUpdatedAt.slice(0, 10), ctx.today);
      if (age > ctx.staleAfterDays) push("stale_health", "medium", `${p.code} health not updated for ${age} days`, `The health rating was last set ${age} days ago; the staleness threshold is ${ctx.staleAfterDays} days.`, [self]);
    } else {
      push("stale_health", "low", `${p.code} has never been assessed`, "No health rating has been recorded for this project.", [self]);
    }
    if (p.targetEndDate && p.targetEndDate < ctx.today && p.status === "active") {
      push("past_target_end", "high", `${p.code} is past its target end date`, `The target end date was ${p.targetEndDate}, ${daysBetween(p.targetEndDate, ctx.today)} days ago, and the project is still active.`, [self]);
    }
  }

  for (const m of s.milestones ?? []) {
    if (!m.completedOn && m.dueDate < ctx.today) {
      const late = daysBetween(m.dueDate, ctx.today);
      push("overdue_milestone", late > 7 ? "high" : "medium", `Milestone “${m.name}” is ${late} days overdue`, `Due ${m.dueDate} and not completed.`, [{ table: "project_milestones", id: m.id }]);
    } else if (!m.completedOn && m.baselineDueDate && m.dueDate > m.baselineDueDate) {
      const slip = daysBetween(m.baselineDueDate, m.dueDate);
      push("slipped_milestone", slip > 14 ? "medium" : "low", `Milestone “${m.name}” has slipped ${slip} days`, `Baseline ${m.baselineDueDate}, now ${m.dueDate}.`, [{ table: "project_milestones", id: m.id }]);
    }
  }

  if (s.workItems) {
    const blocked = s.workItems.filter((w) => w.blocked && !w.done);
    if (blocked.length > 0) {
      push("blocked_work", blocked.length >= 3 ? "high" : "medium", `${blocked.length} work item${blocked.length === 1 ? " is" : "s are"} blocked`, blocked.slice(0, 5).map((w) => `${w.key} ${w.title}`).join("; "), blocked.slice(0, 10).map((w) => ({ table: "work_items", id: w.id })));
    }
    const overdue = s.workItems.filter((w) => !w.done && w.dueDate && w.dueDate < ctx.today);
    if (overdue.length > 0) {
      push("overdue_work", overdue.length >= 5 ? "high" : "medium", `${overdue.length} open work item${overdue.length === 1 ? " is" : "s are"} past due`, overdue.slice(0, 5).map((w) => `${w.key} (due ${w.dueDate})`).join("; "), overdue.slice(0, 10).map((w) => ({ table: "work_items", id: w.id })));
    }
  }

  for (const r of s.raid ?? []) {
    if (!OPEN_RAID.has(r.status)) continue;
    if ((r.score ?? 0) >= 15) push("high_raid", "high", `High-scoring ${r.type}: ${r.title}`, `Score ${r.score} and still ${r.status.replace("_", " ")}.`, [{ table: "raid_items", id: r.id }]);
    if (r.dueDate && r.dueDate < ctx.today) push("overdue_raid", "medium", `${r.type[0].toUpperCase()}${r.type.slice(1)} past its due date: ${r.title}`, `Due ${r.dueDate}.`, [{ table: "raid_items", id: r.id }]);
  }

  for (const e of s.escalations ?? []) {
    if (e.status !== "resolved" && Date.parse(e.respondBy) < ctx.now.getTime()) {
      push("overdue_escalation", e.severity === "critical" ? "critical" : "high", `Escalation overdue: ${e.title}`, `A ${e.severity} escalation passed its response deadline (${e.respondBy.slice(0, 10)}) and is ${e.status}.`, [{ table: "escalations", id: e.id }]);
    }
  }

  if (p.health === "red" && (s.escalations?.every((e) => e.status === "resolved") ?? false) && (s.raid?.every((r) => !OPEN_RAID.has(r.status)) ?? false)) {
    push("red_without_recovery", "high", `${p.code} is red with no open risk, issue or escalation`, "A red project normally has a recorded recovery action; none is open.", [self]);
  }

  return out.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}

/** Portfolio view: every in-flight project's signals, most severe first, plus a count of projects with no findings. */
export function computePortfolioSignals(snapshots: ProjectSnapshot[], ctx: SignalContext): { signals: Signal[]; cleanProjects: number } {
  const all: Signal[] = [];
  let clean = 0;
  for (const s of snapshots) {
    const sig = computeProjectSignals(s, ctx);
    if (sig.length === 0) clean += 1;
    all.push(...sig);
  }
  return { signals: all.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]), cleanProjects: clean };
}

export function soonDate(today: string, days: number): string {
  return addDaysToDate(today, days);
}

export function highestSeverity(signals: Signal[]): Severity {
  return signals.reduce<Severity>((acc, s) => (SEVERITY_RANK[s.severity] > SEVERITY_RANK[acc] ? s.severity : acc), "info");
}
