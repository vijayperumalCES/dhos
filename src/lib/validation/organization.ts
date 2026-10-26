import { z } from "zod";

import { PERMISSIONS, ROLE_KEY_PATTERN, type Permission } from "@/lib/domain/permissions";
import { isValidTimeZone } from "@/lib/domain/time";

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
  timezone: z.string().trim().min(1).max(64).refine(isValidTimeZone, "Choose a valid time zone."),
  currencyCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Use a three-letter ISO 4217 code, e.g. USD."),
  healthStaleAfterDays: z.coerce.number().int().min(1, "At least 1 day.").max(90, "At most 90 days."),
});

// System and custom role keys share one format; the database checks the key exists in the org.
const roleKeys = z
  .array(z.string().regex(ROLE_KEY_PATTERN, "Invalid role."))
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

export const roleFormSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(ROLE_KEY_PATTERN, "2–49 lowercase letters or underscores, starting with a letter, e.g. account_manager."),
  name: requiredText(2, 80, "Role name"),
  description: z.string().trim().max(300, "At most 300 characters."),
  permissions: z
    .array(z.enum(PERMISSIONS as unknown as [Permission, ...Permission[]]))
    .min(1, "Choose at least one permission."),
});

export const departmentFormSchema = z.object({
  name: requiredText(2, 120, "Department name"),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .transform((v) => (v === "" ? null : v))
    .pipe(z.string().regex(/^[A-Z0-9-]{2,20}$/, "2–20 letters, digits or hyphens.").nullable()),
  description: optionalText(2000),
  headMembershipId: optionalUuid,
});

export const memberProfileSchema = z.object({
  membershipId: z.uuid(),
  jobTitle: optionalText(120),
  departmentId: optionalUuid,
  managerMembershipId: optionalUuid,
});

export type DepartmentFormInput = z.input<typeof departmentFormSchema>;
