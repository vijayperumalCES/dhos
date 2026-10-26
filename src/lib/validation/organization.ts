import { z } from "zod";

import { ROLE_KEYS, type RoleKey } from "@/lib/domain/permissions";

import { optionalText, optionalUrl, optionalUuid, requiredText } from "./common";

export const createOrganizationSchema = z.object({
  name: requiredText(2, 120, "Organization name"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,46})[a-z0-9]$/, "3–48 lowercase letters, digits or hyphens; no leading/trailing hyphen."),
});

export const organizationSettingsSchema = z.object({
  name: requiredText(2, 120, "Organization name"),
  timezone: z.string().trim().min(1).max(64),
  currencyCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Use a three-letter ISO 4217 code, e.g. USD."),
  healthStaleAfterDays: z.coerce.number().int().min(1, "At least 1 day.").max(90, "At most 90 days."),
});

const roleKeys = z
  .array(z.enum(ROLE_KEYS as unknown as [RoleKey, ...RoleKey[]]))
  .min(1, "Choose at least one role.")
  .max(10);

export const inviteMemberSchema = z.object({
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
  roleKeys,
});

export const setMemberRolesSchema = z.object({
  membershipId: z.uuid(),
  roleKeys,
});

export const teamFormSchema = z.object({
  name: requiredText(2, 120, "Team name"),
  description: optionalText(2000),
  leadMembershipId: optionalUuid,
});

export const teamMemberSchema = z.object({
  teamId: z.uuid(),
  membershipId: z.uuid({ message: "Choose a person." }),
  teamRole: optionalText(80),
});

export const clientFormSchema = z.object({
  name: requiredText(2, 160, "Client name"),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.string().regex(/^[A-Z0-9-]{2,20}$/, "2–20 letters, digits or hyphens.").nullable()),
  industry: optionalText(80),
  website: optionalUrl,
  accountOwnerMembershipId: optionalUuid,
  confidentiality: z.enum(["standard", "confidential"]),
  notes: optionalText(4000),
});

export type TeamFormInput = z.input<typeof teamFormSchema>;
export type ClientFormInput = z.input<typeof clientFormSchema>;
