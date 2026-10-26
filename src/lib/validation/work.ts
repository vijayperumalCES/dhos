import { z } from "zod";

import { LINK_KINDS, PRIORITIES, SEVERITIES, WORK_ITEM_TYPES, type LinkKind, type WorkItemPriority, type WorkItemSeverity, type WorkItemType } from "@/lib/domain/work";

import { NONE, optionalDate, optionalText, optionalUuid, requiredText } from "./common";

const tuple = <T extends string>(values: readonly T[]) => values as unknown as [T, ...T[]];

const optionalNumber = (max: number, label: string) =>
  z
    .string()
    .transform((v) => (v.trim() === "" ? null : Number(v)))
    .pipe(z.number({ message: `${label} must be a number.` }).min(0, "Can't be negative.").max(max, `At most ${max}.`).nullable());

export const workItemSchema = z
  .object({
    type: z.enum(tuple<WorkItemType>(WORK_ITEM_TYPES)),
    title: requiredText(2, 300, "Title"),
    description: optionalText(20000),
    priority: z.enum(tuple<WorkItemPriority>(PRIORITIES)),
    severity: z
      .string()
      .transform((v) => (v === "" || v === NONE ? null : v))
      .pipe(z.enum(tuple<WorkItemSeverity>(SEVERITIES)).nullable()),
    stateId: z.uuid({ message: "Choose a state." }),
    parentId: optionalUuid,
    assigneeId: optionalUuid,
    reviewerId: optionalUuid,
    sprintId: optionalUuid,
    teamId: optionalUuid,
    storyPoints: optionalNumber(999, "Story points"),
    estimateHours: optionalNumber(99999, "Estimate"),
    startDate: optionalDate,
    dueDate: optionalDate,
    businessValue: optionalNumber(100, "Business value"),
    acceptanceCriteria: optionalText(10000),
    labels: z
      .string()
      .transform((v) => [...new Set(v.split(",").map((l) => l.trim().toLowerCase()).filter(Boolean))])
      .pipe(z.array(z.string().max(40, "Labels are at most 40 characters.")).max(20, "At most 20 labels.")),
    component: optionalText(80),
    blocked: z.boolean(),
    blockedReason: optionalText(1000),
  })
  .refine((v) => !v.dueDate || !v.startDate || v.dueDate >= v.startDate, { path: ["dueDate"], message: "Due date must be on or after the start date." })
  .refine((v) => v.severity === null || v.type === "bug" || v.type === "incident", { path: ["severity"], message: "Severity applies to bugs and incidents only." })
  .refine((v) => !v.blocked || !!v.blockedReason, { path: ["blockedReason"], message: "Say what is blocking this item." });

export type WorkItemFormInput = z.input<typeof workItemSchema>;
export type WorkItemFormValues = z.output<typeof workItemSchema>;

export function toWorkItemRow(v: WorkItemFormValues) {
  return {
    type: v.type,
    title: v.title,
    description: v.description,
    priority: v.priority,
    severity: v.severity,
    state_id: v.stateId,
    parent_id: v.parentId,
    assignee_membership_id: v.assigneeId,
    reviewer_membership_id: v.reviewerId,
    sprint_id: v.sprintId,
    team_id: v.teamId,
    story_points: v.storyPoints,
    estimate_hours: v.estimateHours,
    start_date: v.startDate,
    due_date: v.dueDate,
    business_value: v.businessValue,
    acceptance_criteria: v.acceptanceCriteria,
    labels: v.labels,
    component: v.component,
    blocked: v.blocked,
    blocked_reason: v.blocked ? v.blockedReason : null,
  };
}

export const quickAddSchema = z.object({
  projectId: z.uuid(),
  type: z.enum(tuple<WorkItemType>(WORK_ITEM_TYPES)),
  title: requiredText(2, 300, "Title"),
  sprintId: optionalUuid,
  stateId: optionalUuid,
});

export const moveWorkItemSchema = z.object({
  itemId: z.uuid(),
  stateId: z.uuid().optional(),
  sprintId: z.union([z.uuid(), z.literal(NONE)]).optional(),
  rank: z.number().finite().optional(),
});

export const commentSchema = z.object({ itemId: z.uuid(), body: requiredText(1, 10000, "Comment") });

export const linkSchema = z.object({
  itemId: z.uuid(),
  kind: z.enum(tuple<LinkKind>(LINK_KINDS)),
  url: z.url({ protocol: /^https?$/, message: "Enter a full URL starting with http:// or https://" }).max(2000),
  title: optionalText(200),
});

export const dependencySchema = z.object({
  successorId: z.uuid(),
  predecessorKey: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9-]{1,19}-\d+$/, "Use a work item key such as PAY-12."),
  kind: z.enum(["blocks", "relates_to", "duplicates"]),
});

export const sprintSchema = z
  .object({
    name: requiredText(1, 80, "Name"),
    goal: optionalText(1000),
    startDate: z.iso.date({ message: "Choose a start date." }),
    endDate: z.iso.date({ message: "Choose an end date." }),
  })
  .refine((v) => v.endDate >= v.startDate, { path: ["endDate"], message: "End date must be on or after the start date." });

export const milestoneSchema = z.object({
  name: requiredText(2, 160, "Name"),
  description: optionalText(2000),
  dueDate: z.iso.date({ message: "Choose a due date." }),
  ownerId: optionalUuid,
});

export const programSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/, "2–20 characters: letters, digits and hyphens."),
  name: requiredText(2, 160, "Name"),
  description: optionalText(4000),
  ownerId: optionalUuid,
});

export const statusReportSchema = z
  .object({
    projectId: z.uuid(),
    periodStart: z.iso.date(),
    periodEnd: z.iso.date(),
    summary: requiredText(1, 4000, "Summary"),
    highlights: optionalText(4000),
    nextSteps: optionalText(4000),
    decisionsNeeded: optionalText(4000),
  })
  .refine((v) => v.periodEnd >= v.periodStart, { path: ["periodEnd"], message: "Period end must be on or after its start." });

export const workflowStateSchema = z.object({
  name: requiredText(1, 40, "Name"),
  category: z.enum(["todo", "in_progress", "done"]),
  wipLimit: z
    .string()
    .transform((v) => (v.trim() === "" ? null : Number(v)))
    .pipe(z.number().int("Whole numbers only.").min(1).max(999).nullable()),
});

export const workFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  type: z.enum(tuple<WorkItemType>(WORK_ITEM_TYPES)).optional().catch(undefined),
  state: z.uuid().optional().catch(undefined),
  assignee: z.union([z.uuid(), z.literal("me"), z.literal("unassigned")]).optional().catch(undefined),
  sprint: z.union([z.uuid(), z.literal("backlog")]).optional().catch(undefined),
  priority: z.enum(tuple<WorkItemPriority>(PRIORITIES)).optional().catch(undefined),
  blocked: z.literal("yes").optional().catch(undefined),
  archived: z.literal("only").optional().catch(undefined),
});

export type WorkFilters = z.output<typeof workFiltersSchema>;
