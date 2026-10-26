import type { WorkItemDetail } from "@/lib/data/work";
import type { WorkItemType } from "@/lib/domain/work";
import { NONE } from "@/lib/validation/common";
import type { WorkItemFormInput } from "@/lib/validation/work";

export function newItemDefaults(stateId: string, overrides: { type?: WorkItemType; parentId?: string; sprintId?: string } = {}): WorkItemFormInput {
  return {
    type: overrides.type ?? "story",
    title: "",
    description: "",
    priority: "medium",
    severity: NONE,
    stateId,
    parentId: overrides.parentId ?? NONE,
    assigneeId: NONE,
    reviewerId: NONE,
    sprintId: overrides.sprintId ?? NONE,
    teamId: NONE,
    storyPoints: "",
    estimateHours: "",
    startDate: "",
    dueDate: "",
    businessValue: "",
    acceptanceCriteria: "",
    labels: "",
    component: "",
    blocked: false,
    blockedReason: "",
  };
}

export function itemToFormDefaults(item: WorkItemDetail): WorkItemFormInput {
  const s = (v: number | string | null) => (v === null ? "" : String(v));
  return {
    type: item.type,
    title: item.title,
    description: item.description ?? "",
    priority: item.priority,
    severity: item.severity ?? NONE,
    stateId: item.state_id,
    parentId: item.parent_id ?? NONE,
    assigneeId: item.assignee_membership_id ?? NONE,
    reviewerId: item.reviewer_membership_id ?? NONE,
    sprintId: item.sprint && item.sprint.state !== "completed" ? item.sprint.id : NONE,
    teamId: item.team_id ?? NONE,
    storyPoints: s(item.story_points),
    estimateHours: s(item.estimate_hours),
    startDate: item.start_date ?? "",
    dueDate: item.due_date ?? "",
    businessValue: s(item.business_value),
    acceptanceCriteria: item.acceptance_criteria ?? "",
    labels: item.labels.join(", "),
    component: item.component ?? "",
    blocked: item.blocked,
    blockedReason: item.blocked_reason ?? "",
  };
}
