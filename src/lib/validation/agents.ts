import { z } from "zod";

import { NONE, optionalText, requiredText } from "./common";

/** Form values are strings; empty means "not set". Prices are per million tokens. */
const optionalPrice = (label: string) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .pipe(
      z
        .string()
        .regex(/^\d+(\.\d{1,4})?$/, `${label} must be a number like 3 or 15.5.`)
        .transform(Number)
        .pipe(z.number().max(1_000_000, "That is too large."))
        .nullable(),
    );

export const PROVIDERS = ["builtin", "anthropic"] as const;
export const PROVIDER_LABELS: Record<(typeof PROVIDERS)[number], string> = {
  builtin: "Built-in (rule-based, free)",
  anthropic: "Anthropic Claude",
};

export const agentSettingsSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(PROVIDERS),
  model: optionalText(100),
  monthlyTokenCap: z
    .string()
    .trim()
    .regex(/^\d{1,10}$/, "Enter a whole number of tokens.")
    .transform(Number)
    .pipe(z.number().max(1_000_000_000, "That is too large.")),
  inputPrice: optionalPrice("Input price"),
  outputPrice: optionalPrice("Output price"),
});
export type AgentSettingsInput = z.input<typeof agentSettingsSchema>;

export const agentVersionSchema = z.object({
  systemPrompt: requiredText(20, 8000, "The prompt"),
  model: optionalText(100),
  temperature: z
    .string()
    .trim()
    .regex(/^(0(\.\d{1,2})?|1(\.0{1,2})?)$/, "Enter a number from 0 to 1.")
    .transform(Number),
  maxTokens: z
    .string()
    .trim()
    .regex(/^\d{3,4}$/, "Enter a whole number from 256 to 8000.")
    .transform(Number)
    .pipe(z.number().min(256, "At least 256.").max(8000, "At most 8000.")),
  notes: optionalText(500),
});
export type AgentVersionInput = z.input<typeof agentVersionSchema>;

export const runInputSchema = z.object({
  projectId: z.string().transform((v) => (v === "" || v === NONE ? "" : v)),
  text: z.string().optional(),
});
export type RunInput = z.input<typeof runInputSchema>;

export const decisionNoteSchema = z.object({ note: z.string().trim().max(1000, "Keep it under 1,000 characters.") });
