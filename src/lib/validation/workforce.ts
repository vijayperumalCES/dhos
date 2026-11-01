import { z } from "zod";

import { TIME_CATEGORIES, WORK_MODES, isMonday, type TimeCategory, type WorkMode } from "@/lib/domain/workforce";

import { NONE, optionalText, optionalUuid, requiredText } from "./common";

const tuple = <T extends string>(values: readonly T[]) => values as unknown as [T, ...T[]];
const date = (label: string) => z.iso.date({ message: `${label}: use the format YYYY-MM-DD.` });
const time = (label: string) => z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, `${label}: use the format HH:MM.`);

export const leaveRequestSchema = z
  .object({
    leaveTypeId: z.uuid({ message: "Choose a leave type." }),
    startDate: date("Start date"),
    endDate: date("End date"),
    halfDay: z.boolean(),
    reason: optionalText(1000),
  })
  .refine((v) => v.endDate >= v.startDate, { path: ["endDate"], message: "End date must be on or after the start date." })
  .refine((v) => !v.halfDay || v.startDate === v.endDate, { path: ["halfDay"], message: "A half day starts and ends on the same date." })
  .refine((v) => v.startDate.slice(0, 4) === v.endDate.slice(0, 4), {
    path: ["endDate"],
    message: "Split leave that crosses the year end into two requests.",
  });
export type LeaveRequestInput = z.input<typeof leaveRequestSchema>;

/** A rejection always needs a reason; an approval note is optional. */
export const reviewSchema = z
  .object({ approve: z.boolean(), note: optionalText(1000) })
  .refine((v) => v.approve || !!v.note, { path: ["note"], message: "Give a reason when rejecting." });

export const correctionSchema = z
  .object({
    workDate: date("Date"),
    checkIn: time("Check-in"),
    checkOut: time("Check-out"),
    workMode: z.enum(tuple<WorkMode>(WORK_MODES)),
    reason: requiredText(3, 1000, "Reason"),
  })
  .refine((v) => v.checkOut > v.checkIn, { path: ["checkOut"], message: "Check-out must be after check-in." });
export type CorrectionInput = z.input<typeof correctionSchema>;

export const timeEntrySchema = z
  .object({
    entryDate: date("Date"),
    category: z.enum(tuple<TimeCategory>(TIME_CATEGORIES)),
    projectId: optionalUuid,
    workItemId: optionalUuid,
    hours: z
      .string()
      .transform((v) => Number(v.replace(",", ".")))
      .pipe(z.number({ message: "Hours must be a number." }).gt(0, "Log more than 0 hours.").max(24, "At most 24 hours.")),
    note: optionalText(500),
  })
  // Only project work carries a project; a project left selected in the form is dropped.
  .transform((v) => (v.category === "delivery" ? v : { ...v, projectId: null, workItemId: null }))
  .refine((v) => v.category !== "delivery" || v.projectId !== null, { path: ["projectId"], message: "Choose a project." })
  .refine((v) => v.workItemId === null || v.projectId !== null, { path: ["workItemId"], message: "Choose the project first." });
export type TimeEntryInput = z.input<typeof timeEntrySchema>;

export const weekStartSchema = z.string().refine(isMonday, "Weeks start on a Monday.");

export const allocationSchema = z
  .object({
    membershipId: z.uuid({ message: "Choose a person." }),
    projectId: z.uuid({ message: "Choose a project." }),
    startDate: date("Start date"),
    endDate: date("End date"),
    percent: z
      .string()
      .transform((v) => Number(v))
      .pipe(z.number({ message: "Enter a number." }).int("Use a whole number.").min(1, "At least 1%.").max(100, "At most 100%.")),
    role: optionalText(80),
    notes: optionalText(1000),
  })
  .refine((v) => v.endDate >= v.startDate, { path: ["endDate"], message: "End date must be on or after the start date." });
export type AllocationInput = z.input<typeof allocationSchema>;

export const rangeSchema = z
  .object({ from: date("From"), to: date("To") })
  .refine((v) => v.to >= v.from, { path: ["to"], message: "The end must be on or after the start." });

export const calendarSchema = z.object({
  name: requiredText(2, 80, "Name"),
  workingDays: z.array(z.number().int().min(1).max(7)).min(1, "Choose at least one working day.").max(7),
  hoursPerDay: z
    .string()
    .transform((v) => Number(v))
    .pipe(z.number({ message: "Enter a number." }).gt(0, "More than 0 hours.").max(24, "At most 24 hours.")),
});
export type CalendarInput = z.input<typeof calendarSchema>;

export const holidaySchema = z.object({
  calendarId: z.uuid(),
  holidayDate: date("Date"),
  name: requiredText(2, 120, "Name"),
});
export type HolidayInput = z.input<typeof holidaySchema>;

export const leaveTypeSchema = z.object({
  name: requiredText(2, 60, "Name"),
  code: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9_]{2,20}$/, "2–20 letters, digits or underscores.")),
  isPaid: z.boolean(),
  requiresApproval: z.boolean(),
  annualAllowanceDays: z
    .string()
    .transform((v) => (v.trim() === "" ? null : Number(v)))
    .pipe(z.number({ message: "Enter a number." }).min(0, "Can't be negative.").max(365, "At most 365.").nullable()),
});
export type LeaveTypeInput = z.input<typeof leaveTypeSchema>;

export const balanceSchema = z.object({
  membershipId: z.uuid(),
  leaveTypeId: z.uuid(),
  year: z.number().int().min(2000).max(2100),
  days: z
    .string()
    .transform((v) => Number(v))
    .pipe(z.number({ message: "Enter a number." }).min(0, "Can't be negative.").max(365, "At most 365.")),
});

export { NONE };
