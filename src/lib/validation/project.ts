import { z } from "zod";

import {
  HEALTHS_REQUIRING_REASON,
  PROJECT_HEALTHS,
  PROJECT_METHODOLOGIES,
  PROJECT_STATUSES,
  STATUSES_REQUIRING_REASON,
  type ProjectHealth,
  type ProjectStatus,
} from "@/lib/domain/project-lifecycle";

import { optionalDate, optionalText, optionalUuid, requiredText } from "./common";

export const projectFormSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/, "2–20 characters: letters, digits and hyphens, e.g. PAY-01."),
    name: requiredText(2, 160, "Name"),
    description: optionalText(4000),
    clientId: optionalUuid,
    programId: optionalUuid,
    sponsorName: optionalText(120),
    projectManagerId: optionalUuid,
    deliveryOwnerId: optionalUuid,
    primaryTeamId: optionalUuid,
    methodology: z.enum(PROJECT_METHODOLOGIES as [string, ...string[]]),
    plannedStartDate: optionalDate,
    targetEndDate: optionalDate,
    objectives: optionalText(4000),
    scopeSummary: optionalText(4000),
    assumptions: optionalText(4000),
    projectConstraints: optionalText(4000),
  })
  .refine((v) => !v.plannedStartDate || !v.targetEndDate || v.targetEndDate >= v.plannedStartDate, {
    path: ["targetEndDate"],
    message: "Target end date must be on or after the planned start date.",
  });

export type ProjectFormInput = z.input<typeof projectFormSchema>;
export type ProjectFormValues = z.output<typeof projectFormSchema>;

export function toProjectRow(v: ProjectFormValues) {
  return {
    code: v.code,
    name: v.name,
    description: v.description,
    client_id: v.clientId,
    program_id: v.programId,
    sponsor_name: v.sponsorName,
    project_manager_id: v.projectManagerId,
    delivery_owner_id: v.deliveryOwnerId,
    primary_team_id: v.primaryTeamId,
    methodology: v.methodology as "scrum" | "kanban" | "waterfall" | "hybrid",
    planned_start_date: v.plannedStartDate,
    target_end_date: v.targetEndDate,
    objectives: v.objectives,
    scope_summary: v.scopeSummary,
    assumptions: v.assumptions,
    project_constraints: v.projectConstraints,
  };
}

export const statusTransitionSchema = z
  .object({
    projectId: z.uuid(),
    toStatus: z.enum(PROJECT_STATUSES as [ProjectStatus, ...ProjectStatus[]]),
    reason: optionalText(1000),
  })
  .refine((v) => !STATUSES_REQUIRING_REASON.includes(v.toStatus) || !!v.reason, {
    path: ["reason"],
    message: "Give a reason for this change.",
  });

export const healthUpdateSchema = z
  .object({
    projectId: z.uuid(),
    health: z.enum(PROJECT_HEALTHS as [ProjectHealth, ...ProjectHealth[]]),
    reason: optionalText(1000),
  })
  .refine((v) => !HEALTHS_REQUIRING_REASON.includes(v.health) || !!v.reason, {
    path: ["reason"],
    message: "Explain why the project is Amber or Red.",
  });

export const projectMemberSchema = z.object({
  projectId: z.uuid(),
  membershipId: z.uuid({ message: "Choose a person." }),
  projectRole: requiredText(1, 80, "Role"),
  allocationPercent: z
    .string()
    .transform((v) => (v.trim() === "" ? null : Number(v)))
    .pipe(z.number().int("Whole numbers only.").min(0).max(100, "0–100").nullable()),
});

export const projectListFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(["in_flight", "all", ...PROJECT_STATUSES] as [string, ...string[]]).optional().catch(undefined),
  health: z.enum(PROJECT_HEALTHS as [string, ...string[]]).optional().catch(undefined),
  client: z.uuid().optional().catch(undefined),
  manager: z.uuid().optional().catch(undefined),
  team: z.uuid().optional().catch(undefined),
  archived: z.enum(["include", "only"]).optional().catch(undefined),
  sort: z.enum(["name", "code", "target_end_date", "health", "status", "updated_at"]).optional().catch(undefined),
  dir: z.enum(["asc", "desc"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
});

export type ProjectListFilters = z.output<typeof projectListFiltersSchema>;
