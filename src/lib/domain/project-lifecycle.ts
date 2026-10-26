import type { Database } from "@/lib/supabase/database.types";

export type ProjectStatus = Database["public"]["Enums"]["project_status"];
export type ProjectHealth = Database["public"]["Enums"]["project_health"];
export type ProjectMethodology = Database["public"]["Enums"]["project_methodology"];

export const PROJECT_STATUSES: readonly ProjectStatus[] = [
  "proposed",
  "approved",
  "planning",
  "active",
  "on_hold",
  "completed",
  "cancelled",
];

export const PROJECT_HEALTHS: readonly ProjectHealth[] = ["green", "amber", "red", "not_assessed"];
export const PROJECT_METHODOLOGIES: readonly ProjectMethodology[] = ["scrum", "kanban", "waterfall", "hybrid"];

/**
 * Mirror of public.is_valid_project_transition(). The database trigger is authoritative;
 * this copy drives the UI so users are only offered moves that will succeed.
 */
export const PROJECT_TRANSITIONS: Readonly<Record<ProjectStatus, readonly ProjectStatus[]>> = {
  proposed: ["approved", "cancelled"],
  approved: ["planning", "on_hold", "cancelled"],
  planning: ["active", "on_hold", "cancelled"],
  active: ["on_hold", "completed", "cancelled"],
  on_hold: ["planning", "active", "cancelled"],
  completed: [],
  cancelled: [],
};

/** Transitions that must carry a written reason (enforced again in the RPC). */
export const STATUSES_REQUIRING_REASON: readonly ProjectStatus[] = ["on_hold", "cancelled"];
/** Health ratings that must carry a written reason (enforced again in the RPC). */
export const HEALTHS_REQUIRING_REASON: readonly ProjectHealth[] = ["amber", "red"];

export function allowedTransitions(from: ProjectStatus): readonly ProjectStatus[] {
  return PROJECT_TRANSITIONS[from];
}

export function isValidTransition(from: ProjectStatus, to: ProjectStatus): boolean {
  return PROJECT_TRANSITIONS[from].includes(to);
}

export function isTerminal(status: ProjectStatus): boolean {
  return PROJECT_TRANSITIONS[status].length === 0;
}

/** Statuses in which delivery work is expected to be progressing. */
export const IN_FLIGHT_STATUSES: readonly ProjectStatus[] = ["planning", "active", "on_hold"];

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  proposed: "Proposed",
  approved: "Approved",
  planning: "Planning",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const HEALTH_LABELS: Record<ProjectHealth, string> = {
  green: "Green",
  amber: "Amber",
  red: "Red",
  not_assessed: "Not assessed",
};

export const METHODOLOGY_LABELS: Record<ProjectMethodology, string> = {
  scrum: "Scrum",
  kanban: "Kanban",
  waterfall: "Waterfall",
  hybrid: "Hybrid",
};
