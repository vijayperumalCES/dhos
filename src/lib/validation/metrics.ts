import { z } from "zod";

import { isMonday, metricByKey } from "@/lib/domain/delivery-metrics";

import { uuid } from "./common";

/**
 * One week of metric values as typed: text per metric, blank meaning "no value" (which clears an
 * earlier one, so the automatic value shows again where the system has one).
 */
export const metricEntriesSchema = z
  .object({
    projectId: uuid,
    week: z.string().refine(isMonday, "Choose a Monday."),
    values: z.record(z.string(), z.string().trim()),
  })
  .superRefine((v, ctx) => {
    for (const [key, text] of Object.entries(v.values)) {
      const def = metricByKey(key);
      if (!def || def.agg === "computed") {
        ctx.addIssue({ code: "custom", path: ["values", key], message: "This metric cannot be entered." });
        continue;
      }
      if (text === "") continue;
      const n = Number(text);
      if (!Number.isFinite(n)) ctx.addIssue({ code: "custom", path: ["values", key], message: "Enter a number." });
      else if (n < def.lo || n > def.hi) ctx.addIssue({ code: "custom", path: ["values", key], message: `Enter a value from ${def.lo} to ${def.hi}.` });
    }
  })
  .transform((v) => ({
    projectId: v.projectId,
    week: v.week,
    values: Object.fromEntries(Object.entries(v.values).map(([k, t]) => [k, t === "" ? null : Number(t)])) as Record<string, number | null>,
  }));
export type MetricEntriesInput = z.input<typeof metricEntriesSchema>;

/** Addresses separated by commas, semicolons, spaces or new lines. */
export const reportSettingsSchema = z.object({
  projectId: uuid,
  weekly: z.boolean(),
  monthly: z.boolean(),
  recipients: z
    .string()
    .transform((t) => [...new Set(t.split(/[\s,;]+/).map((a) => a.trim().toLowerCase()).filter(Boolean))])
    .pipe(z.array(z.email("Check the email addresses.")).max(20, "At most 20 addresses.")),
});
export type ReportSettingsInput = z.input<typeof reportSettingsSchema>;
