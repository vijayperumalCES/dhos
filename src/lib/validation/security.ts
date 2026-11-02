import { z } from "zod";

import { requiredText } from "./common";

export const grantRequestSchema = z.object({
  membershipId: z.uuid("Choose a member."),
  roleKey: z.string().trim().min(1, "Choose a role."),
  reason: requiredText(3, 500, "The reason"),
});
export type GrantRequestInput = z.input<typeof grantRequestSchema>;

export const decisionSchema = z.object({
  note: z
    .string()
    .trim()
    .max(500, "Keep the note under 500 characters.")
    .optional()
    .transform((v) => (v ? v : null)),
});
export type DecisionInput = z.input<typeof decisionSchema>;

export const controlsSchema = z.object({
  dualApproval: z.boolean(),
  requireMfa: z.boolean(),
});
export type ControlsInput = z.input<typeof controlsSchema>;

export const legalHoldSchema = z.object({
  reason: requiredText(3, 500, "The reason"),
});
export type LegalHoldInput = z.input<typeof legalHoldSchema>;

const days = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, `${label} must be a whole number of days.`)
    .transform(Number)
    .pipe(z.number().int().min(7, `${label} must be at least 7 days.`).max(3650, `${label} must be at most 3650 days (ten years).`));

export const retentionSchema = z.object({
  outboxDays: days("Events and deliveries"),
  notificationDays: days("Read notifications"),
  logDays: days("Job and sync logs"),
});
export type RetentionInput = z.input<typeof retentionSchema>;
