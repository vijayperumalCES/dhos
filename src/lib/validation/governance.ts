import { z } from "zod";

import {
  ACTION_STATUSES,
  CONTRACT_STATUSES,
  CONTRACT_TYPES,
  DECISION_STATUSES,
  DOCUMENT_TYPES,
  DOCUMENT_VISIBILITIES,
  ESCALATION_SEVERITIES,
  GATE_CATEGORIES,
  RAID_STATUSES,
  RAID_TYPES,
  raidNeedsNote,
  type ActionStatus,
  type ContractStatus,
  type ContractType,
  type DecisionStatus,
  type DocumentType,
  type DocumentVisibility,
  type EscalationSeverity,
  type GateCategory,
  type RaidStatus,
  type RaidType,
} from "@/lib/domain/governance";

import { NONE, optionalDate, optionalText, optionalUrl, optionalUuid, requiredText } from "./common";

const tuple = <T extends string>(values: readonly T[]) => values as unknown as [T, ...T[]];

const scale = (label: string) =>
  z
    .string()
    .transform((v) => (v.trim() === "" || v === NONE ? null : Number(v)))
    .pipe(z.number({ message: `${label} must be 1 to 5.` }).int().min(1, `${label} must be 1 to 5.`).max(5, `${label} must be 1 to 5.`).nullable());

const optionalInt = (min: number, max: number, label: string) =>
  z
    .string()
    .transform((v) => (v.trim() === "" ? null : Number(v)))
    .pipe(z.number({ message: `${label} must be a whole number.` }).int(`${label} must be a whole number.`).min(min, `At least ${min}.`).max(max, `At most ${max}.`).nullable());

const optionalHours = z
  .string()
  .transform((v) => (v.trim() === "" ? null : Number(v)))
  .pipe(z.number({ message: "Effort must be a number." }).min(0, "Can't be negative.").max(999999, "That is too large.").nullable());

export const raidItemSchema = z
  .object({
    type: z.enum(tuple<RaidType>(RAID_TYPES)),
    title: requiredText(2, 200, "Title"),
    description: optionalText(4000),
    probability: scale("Probability"),
    impact: scale("Impact"),
    ownerId: optionalUuid,
    dueDate: optionalDate,
    mitigation: optionalText(4000),
    contingency: optionalText(4000),
  })
  .refine((v) => v.type !== "risk" || (v.probability !== null && v.impact !== null), { path: ["probability"], message: "Rate both probability and impact for a risk." })
  .transform((v) => ({
    ...v,
    // Probability belongs to risks and impact to risks and issues (database check constraints).
    probability: v.type === "risk" ? v.probability : null,
    impact: v.type === "risk" || v.type === "issue" ? v.impact : null,
  }));
export type RaidItemInput = z.input<typeof raidItemSchema>;

export const raidStatusSchema = z
  .object({
    status: z.enum(tuple<RaidStatus>(RAID_STATUSES)),
    note: optionalText(2000),
  })
  .refine((v) => !raidNeedsNote(v.status) || !!v.note, { path: ["note"], message: "Say how this was resolved, closed or accepted." });
export type RaidStatusInput = z.input<typeof raidStatusSchema>;

export const decisionSchema = z.object({
  title: requiredText(2, 200, "Title"),
  context: optionalText(4000),
  decision: optionalText(4000),
  rationale: optionalText(4000),
  consequences: optionalText(4000),
});
export type DecisionInput = z.input<typeof decisionSchema>;

export const decisionOutcomeSchema = z.object({
  status: z.enum(["accepted", "rejected"]),
  decision: requiredText(2, 4000, "The decision"),
});

export const actionSchema = z.object({
  title: requiredText(2, 200, "Title"),
  description: optionalText(4000),
  ownerId: z.uuid({ message: "Choose an owner." }),
  dueDate: z.iso.date({ message: "Choose a due date." }),
  raidItemId: optionalUuid,
  decisionId: optionalUuid,
});
export type ActionInput = z.input<typeof actionSchema>;

const evidenceItem = z
  .object({
    kind: z.enum(["link", "note"]),
    title: requiredText(2, 200, "Evidence title"),
    url: optionalUrl,
    note: optionalText(2000),
  })
  .refine((v) => v.kind !== "link" || !!v.url, { path: ["url"], message: "Enter the link." })
  .refine((v) => v.kind !== "note" || !!v.note, { path: ["note"], message: "Write the note." });

export const escalationSchema = z.object({
  title: requiredText(2, 200, "Title"),
  description: requiredText(2, 4000, "Description"),
  severity: z.enum(tuple<EscalationSeverity>(ESCALATION_SEVERITIES)),
  toId: z.uuid({ message: "Choose who it is escalated to." }),
  respondBy: z.iso.date({ message: "Choose a response deadline." }),
  raidItemId: optionalUuid,
  evidence: z.array(evidenceItem).min(1, "Add at least one piece of evidence.").max(10, "At most 10 pieces of evidence."),
});
export type EscalationInput = z.input<typeof escalationSchema>;

export const evidenceSchema = evidenceItem;
export type EvidenceInput = z.input<typeof evidenceItem>;

export const changeRequestSchema = z.object({
  title: requiredText(2, 200, "Title"),
  description: optionalText(4000),
  justification: optionalText(4000),
  impactScheduleDays: optionalInt(-365, 3650, "Schedule impact"),
  impactEffortHours: optionalHours,
  impactScope: optionalText(2000),
  impactRisk: optionalText(2000),
});
export type ChangeRequestInput = z.input<typeof changeRequestSchema>;

export const releaseSchema = z.object({
  name: requiredText(2, 120, "Name"),
  version: optionalText(40),
  plannedDate: optionalDate,
  managerId: optionalUuid,
  notes: optionalText(4000),
});
export type ReleaseInput = z.input<typeof releaseSchema>;

export const gateSchema = z.object({
  name: requiredText(2, 120, "Gate name"),
  category: z.enum(tuple<GateCategory>(GATE_CATEGORIES)),
  isRequired: z.boolean(),
});
export type GateInput = z.input<typeof gateSchema>;

export const contactSchema = z.object({
  name: requiredText(2, 120, "Name"),
  jobTitle: optionalText(120),
  email: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.email({ message: "Enter a valid email address." }).nullable()),
  phone: optionalText(40),
  isPrimary: z.boolean(),
  notes: optionalText(1000),
});
export type ContactInput = z.input<typeof contactSchema>;

export const contractSchema = z
  .object({
    title: requiredText(2, 160, "Title"),
    reference: optionalText(60),
    contractType: z.enum(tuple<ContractType>(CONTRACT_TYPES)),
    status: z.enum(tuple<ContractStatus>(CONTRACT_STATUSES)),
    startDate: optionalDate,
    endDate: optionalDate,
    renewalNoticeDays: optionalInt(0, 730, "Notice period"),
    notes: optionalText(2000),
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, { path: ["endDate"], message: "The end date must be on or after the start date." });
export type ContractInput = z.input<typeof contractSchema>;

export const documentSchema = z
  .object({
    title: requiredText(2, 160, "Title"),
    docType: z.enum(tuple<DocumentType>(DOCUMENT_TYPES)),
    visibility: z.enum(tuple<DocumentVisibility>(DOCUMENT_VISIBILITIES)),
    description: optionalText(1000),
    content: optionalText(200000),
    url: optionalUrl,
    note: optionalText(500),
  })
  .refine((v) => !!v.content || !!v.url, { path: ["content"], message: "Write the content or link to it." });
export type DocumentInput = z.input<typeof documentSchema>;

export const documentVersionSchema = z
  .object({
    content: optionalText(200000),
    url: optionalUrl,
    note: optionalText(500),
  })
  .refine((v) => !!v.content || !!v.url, { path: ["content"], message: "Write the content or link to it." });
export type DocumentVersionInput = z.input<typeof documentVersionSchema>;

export const documentMetaSchema = z.object({
  title: requiredText(2, 160, "Title"),
  docType: z.enum(tuple<DocumentType>(DOCUMENT_TYPES)),
  visibility: z.enum(tuple<DocumentVisibility>(DOCUMENT_VISIBILITIES)),
  description: optionalText(1000),
});

/** Governance list filters, parsed from search params. */
export const governanceFilterSchema = z.object({
  project: z.uuid().optional().catch(undefined),
  status: z.string().max(30).optional().catch(undefined),
  type: z.string().max(30).optional().catch(undefined),
  owner: z.uuid().optional().catch(undefined),
  q: z.string().max(100).optional().catch(undefined),
});
export type GovernanceFilters = z.infer<typeof governanceFilterSchema>;

export type { ActionStatus, DecisionStatus };
export { ACTION_STATUSES, DECISION_STATUSES };
