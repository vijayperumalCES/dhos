import type { Database } from "@/lib/supabase/database.types";

import { addDaysToDate, type DateString } from "./time";

export type WorkItemType = Database["public"]["Enums"]["work_item_type"];
export type WorkItemPriority = Database["public"]["Enums"]["work_item_priority"];
export type WorkItemSeverity = Database["public"]["Enums"]["work_item_severity"];
export type WorkflowCategory = Database["public"]["Enums"]["workflow_category"];
export type SprintState = Database["public"]["Enums"]["sprint_state"];
export type DependencyKind = Database["public"]["Enums"]["dependency_kind"];
export type LinkKind = Database["public"]["Enums"]["work_item_link_kind"];

export const WORK_ITEM_TYPES: readonly WorkItemType[] = ["epic", "feature", "story", "task", "subtask", "bug", "incident", "change_request"];
export const PRIORITIES: readonly WorkItemPriority[] = ["critical", "high", "medium", "low"];
export const SEVERITIES: readonly WorkItemSeverity[] = ["s1", "s2", "s3", "s4"];
export const LINK_KINDS: readonly LinkKind[] = ["pull_request", "build", "test_run", "release", "document", "other"];

export const TYPE_LABELS: Record<WorkItemType, string> = {
  epic: "Epic",
  feature: "Feature",
  story: "Story",
  task: "Task",
  subtask: "Sub-task",
  bug: "Bug",
  incident: "Incident",
  change_request: "Change request",
};

export const PRIORITY_LABELS: Record<WorkItemPriority, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
export const SEVERITY_LABELS: Record<WorkItemSeverity, string> = { s1: "S1 – Critical", s2: "S2 – Major", s3: "S3 – Moderate", s4: "S4 – Minor" };
export const CATEGORY_LABELS: Record<WorkflowCategory, string> = { todo: "To do", in_progress: "In progress", done: "Done" };
export const LINK_LABELS: Record<LinkKind, string> = {
  pull_request: "Pull request",
  build: "Build",
  test_run: "Test run",
  release: "Release",
  document: "Document",
  other: "Link",
};

/** Mirror of public.allowed_parent_types(); tests/unit/work.test.ts checks it against SQL. */
export const ALLOWED_PARENTS: Record<WorkItemType, readonly WorkItemType[]> = {
  epic: [],
  feature: ["epic"],
  story: ["epic", "feature"],
  task: ["epic", "feature", "story"],
  subtask: ["story", "task"],
  bug: ["epic", "feature", "story"],
  incident: ["epic"],
  change_request: ["epic"],
};

export function canBeParent(childType: WorkItemType, parentType: WorkItemType): boolean {
  return ALLOWED_PARENTS[childType].includes(parentType);
}

/** Rank for a card dropped between two neighbours (either may be absent). */
export function rankBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return 1024;
  if (before === null) return after! - 1024;
  if (after === null) return before + 1024;
  return (before + after) / 2;
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------
export type MilestoneStatus = "achieved" | "overdue" | "due_soon" | "on_track";

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  achieved: "Achieved",
  overdue: "Overdue",
  due_soon: "Due within 14 days",
  on_track: "Upcoming",
};

export function milestoneStatus(m: { due_date: DateString; completed_on: DateString | null }, today: DateString): MilestoneStatus {
  if (m.completed_on) return "achieved";
  if (m.due_date < today) return "overdue";
  if (m.due_date <= addDaysToDate(today, 14)) return "due_soon";
  return "on_track";
}

/** Positive = later than baseline (slipped), negative = earlier; null without a baseline. */
export function scheduleVarianceDays(m: { due_date: DateString; baseline_due_date: DateString | null }): number | null {
  if (!m.baseline_due_date) return null;
  return Math.round((Date.parse(`${m.due_date}T00:00:00Z`) - Date.parse(`${m.baseline_due_date}T00:00:00Z`)) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Sprints
// ---------------------------------------------------------------------------
export type DailyStat = { day: DateString; scope_points: number; done_points: number };
export type BurndownPoint = { day: DateString; remaining: number | null; ideal: number; scope: number | null };

/**
 * Builds a day-by-day burndown from sparse daily stats. Days without a stats row carry the
 * previous value forward; future days have no actual value. The ideal line falls linearly from
 * the committed scope on the start date to zero on the end date.
 */
export function buildBurndown(
  sprint: { start_date: DateString; end_date: DateString; committed_points: number | null },
  stats: DailyStat[],
  today: DateString,
): BurndownPoint[] {
  const byDay = new Map(stats.map((s) => [s.day, s]));
  const days: DateString[] = [];
  for (let d = sprint.start_date; d <= sprint.end_date; d = addDaysToDate(d, 1)) days.push(d);
  const committed = sprint.committed_points ?? stats[0]?.scope_points ?? 0;
  const span = Math.max(1, days.length - 1);
  let last: DailyStat | undefined;
  return days.map((day, i) => {
    last = byDay.get(day) ?? last;
    const past = day <= today;
    return {
      day,
      ideal: Math.round(committed * (1 - i / span) * 10) / 10,
      remaining: past && last ? Math.max(0, last.scope_points - last.done_points) : null,
      scope: past && last ? last.scope_points : null,
    };
  });
}

/** Average completed points over the most recent completed sprints (default 3). */
export function averageVelocity(completedSprints: { completed_points: number | null; completed_at: string | null }[], window = 3): number | null {
  const recent = completedSprints
    .filter((s) => s.completed_points !== null && s.completed_at)
    .sort((a, b) => b.completed_at!.localeCompare(a.completed_at!))
    .slice(0, window);
  if (recent.length === 0) return null;
  return Math.round((recent.reduce((sum, s) => sum + Number(s.completed_points), 0) / recent.length) * 10) / 10;
}

/** Share of committed points completed; null when nothing was committed. */
export function commitmentReliability(committed: number | null, completed: number | null): number | null {
  if (!committed || completed === null) return null;
  return Math.round((completed / committed) * 100);
}
