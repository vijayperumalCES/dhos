import { z } from "zod";

import { BILLING_MODELS, COST_CATEGORIES, NON_LABOUR_CATEGORIES, type BillingModel, type CostCategory } from "@/lib/domain/finance";

import { NONE, optionalText, requiredText } from "./common";

const tuple = <T extends string>(values: readonly T[]) => values as unknown as [T, ...T[]];

/** A money amount typed as text: digits with up to two decimals (thousands separators are tolerated). */
const money = (label: string, opts: { allowZero?: boolean; max?: number } = {}) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/,/g, ""))
    .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, `${label} must be an amount like 1200 or 1200.50.`))
    .transform(Number)
    .pipe(
      z
        .number()
        .max(opts.max ?? 999_999_999_999, "That is too large.")
        .refine((n) => opts.allowZero || n > 0, `${label} must be more than zero.`),
    );

/** A cost entry may be a credit (negative), so it takes an optional leading minus. */
const signedMoney = (label: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/,/g, ""))
    .pipe(z.string().regex(/^-?\d+(\.\d{1,2})?$/, `${label} must be an amount like 1200 or -50.25.`))
    .transform(Number)
    .pipe(z.number().max(999_999_999_999, "That is too large.").refine((n) => n !== 0, `${label} can't be zero.`));

const date = (label: string) => z.iso.date({ message: `Enter ${label} as YYYY-MM-DD.` });

export const rateLineSchema = z.object({
  roleTitle: requiredText(2, 120, "Role"),
  costRate: money("Cost rate", { allowZero: true, max: 99_999 }),
  billRate: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(money("Bill rate", { allowZero: true, max: 99_999 }).nullable()),
  effectiveFrom: date("the date"),
});
export type RateLineInput = z.input<typeof rateLineSchema>;

export const memberRateSchema = z.object({
  membershipId: z.string().refine((v) => v !== "" && v !== NONE, "Choose a person.").pipe(z.uuid()),
  costRate: money("Cost rate", { allowZero: true, max: 99_999 }),
  effectiveFrom: date("the date"),
});
export type MemberRateInput = z.input<typeof memberRateSchema>;

export const budgetStartSchema = z.object({ name: requiredText(2, 120, "Name") });
export type BudgetStartInput = z.input<typeof budgetStartSchema>;

export const budgetLineSchema = z.object({
  category: z.enum(tuple<CostCategory>(COST_CATEGORIES)),
  amount: money("Amount", { allowZero: true }),
  note: optionalText(500),
});
export type BudgetLineInput = z.input<typeof budgetLineSchema>;

export const costEntrySchema = z.object({
  entryDate: date("the date"),
  category: z.enum(tuple(NON_LABOUR_CATEGORIES)),
  amount: signedMoney("Amount"),
  description: requiredText(2, 300, "Description"),
  vendor: optionalText(120),
  reference: optionalText(80),
});
export type CostEntryInput = z.input<typeof costEntrySchema>;

export const forecastSchema = z.object({
  category: z.enum(tuple(NON_LABOUR_CATEGORIES)),
  /** Any date in the month; the action stores the first of that month. */
  period: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, "Choose the month."),
  amount: money("Amount", { allowZero: true }),
  note: optionalText(300),
});
export type ForecastInput = z.input<typeof forecastSchema>;

export const contractValueSchema = z.object({
  totalValue: money("Value", { allowZero: true }),
  billingModel: z.enum(tuple<BillingModel>(BILLING_MODELS)),
  notes: optionalText(1000),
});
export type ContractValueInput = z.input<typeof contractValueSchema>;

export const revenueLineSchema = z.object({
  description: requiredText(2, 200, "Description"),
  plannedDate: date("the date"),
  amount: money("Amount"),
  contractId: z
    .string()
    .transform((v) => (v === "" || v === NONE ? null : v))
    .pipe(z.uuid().nullable()),
});
export type RevenueLineInput = z.input<typeof revenueLineSchema>;

export const reasonSchema = z.object({ note: requiredText(2, 300, "Reason") });
export const recogniseSchema = z.object({ recognisedOn: date("the date") });
