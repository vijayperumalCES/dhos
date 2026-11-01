import { z } from "zod";

import { isEventType } from "@/lib/automation/events";
import { OPERATORS, SEVERITIES, RECIPIENT_KINDS, ruleDefinitionSchema, type Condition, type RuleAction } from "@/lib/automation/rules";
import { PROVIDERS } from "@/lib/automation/adapters";

import { NONE, optionalText, requiredText } from "./common";

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------
export const WEBHOOK_FORMATS = ["generic", "teams", "slack"] as const;
export const WEBHOOK_FORMAT_LABELS: Record<(typeof WEBHOOK_FORMATS)[number], string> = {
  generic: "Signed JSON (generic)",
  teams: "Microsoft Teams (incoming webhook)",
  slack: "Slack (incoming webhook)",
};

export const webhookSchema = z.object({
  name: requiredText(2, 80, "The name"),
  url: z
    .string()
    .trim()
    .max(500, "Keep the URL under 500 characters.")
    .regex(/^https:\/\/\S+$/, "Enter a full URL starting with https://"),
  format: z.enum(WEBHOOK_FORMATS),
  allEvents: z.boolean(),
  eventTypes: z.array(z.string().refine(isEventType)).max(40),
});
export type WebhookInput = z.input<typeof webhookSchema>;

/** `*` subscribes to everything, including events added later. */
export function webhookEventTypes(v: z.output<typeof webhookSchema>): string[] {
  return v.allEvents ? ["*"] : v.eventTypes;
}

// ---------------------------------------------------------------------------
// Workflow rules. The form has a fixed shape (three condition rows, one notify action, one webhook
// action); stored rules are general and the database accepts up to ten conditions and five actions.
// ---------------------------------------------------------------------------
const op = z.enum(OPERATORS);
const value = z.string().trim().max(200);

export const ruleFormSchema = z
  .object({
    name: requiredText(2, 120, "The name"),
    description: optionalText(1000),
    triggerEvent: z.string().refine(isEventType, "Choose an event."),
    c1Field: z.string(),
    c1Op: op,
    c1Value: value,
    c2Field: z.string(),
    c2Op: op,
    c2Value: value,
    c3Field: z.string(),
    c3Op: op,
    c3Value: value,
    notifyEnabled: z.boolean(),
    notifyTo: z.enum(RECIPIENT_KINDS),
    notifyRoleKey: z.string(),
    notifyMembershipId: z.string(),
    notifyTitle: z.string().trim().max(160),
    notifyMessage: z.string().trim().max(500),
    notifySeverity: z.enum(SEVERITIES),
    webhookEndpointId: z.string(),
  })
  .superRefine((v, ctx) => {
    for (const n of [1, 2, 3] as const) {
      const f = v[`c${n}Field` as const];
      if (f && f !== NONE && !v[`c${n}Value` as "c1Value"]) ctx.addIssue({ code: "custom", path: [`c${n}Value`], message: "Enter a value." });
    }
    if (!v.notifyEnabled && (v.webhookEndpointId === "" || v.webhookEndpointId === NONE)) ctx.addIssue({ code: "custom", path: ["notifyTitle"], message: "Add a notification or a webhook." });
    if (v.notifyEnabled && v.notifyTitle.length < 2) ctx.addIssue({ code: "custom", path: ["notifyTitle"], message: "Enter a title." });
    if (v.notifyEnabled && v.notifyTo === "role" && (v.notifyRoleKey === "" || v.notifyRoleKey === NONE)) ctx.addIssue({ code: "custom", path: ["notifyRoleKey"], message: "Choose a role." });
    if (v.notifyEnabled && v.notifyTo === "member" && (v.notifyMembershipId === "" || v.notifyMembershipId === NONE)) ctx.addIssue({ code: "custom", path: ["notifyMembershipId"], message: "Choose a person." });
  });
export type RuleFormInput = z.input<typeof ruleFormSchema>;

export function ruleFormToDefinition(v: z.output<typeof ruleFormSchema>) {
  const conditions: Condition[] = ([1, 2, 3] as const)
    .map((n) => ({ field: v[`c${n}Field` as "c1Field"], op: v[`c${n}Op` as "c1Op"], value: v[`c${n}Value` as "c1Value"] }))
    .filter((c) => c.field !== "" && c.field !== NONE);
  const actions: RuleAction[] = [];
  if (v.notifyEnabled) {
    actions.push({
      type: "notify",
      to: v.notifyTo,
      ...(v.notifyTo === "role" ? { roleKey: v.notifyRoleKey } : {}),
      ...(v.notifyTo === "member" ? { membershipId: v.notifyMembershipId } : {}),
      title: v.notifyTitle,
      ...(v.notifyMessage ? { message: v.notifyMessage } : {}),
      severity: v.notifySeverity,
    });
  }
  if (v.webhookEndpointId && v.webhookEndpointId !== NONE) actions.push({ type: "webhook", endpointId: v.webhookEndpointId });
  return ruleDefinitionSchema.safeParse({ triggerEvent: v.triggerEvent, conditions, actions });
}

/** Fills the form from a stored rule. Rules with more than the form can show still run; the form shows the first of each kind. */
export function definitionToRuleForm(rule: { name: string; description: string | null; trigger_event: string; conditions: unknown; actions: unknown }): RuleFormInput {
  const conditions = (Array.isArray(rule.conditions) ? rule.conditions : []) as Condition[];
  const actions = (Array.isArray(rule.actions) ? rule.actions : []) as RuleAction[];
  const notify = actions.find((a): a is Extract<RuleAction, { type: "notify" }> => a.type === "notify");
  const hook = actions.find((a): a is Extract<RuleAction, { type: "webhook" }> => a.type === "webhook");
  const row = (n: number) => ({ field: conditions[n]?.field ?? NONE, op: conditions[n]?.op ?? "eq", value: conditions[n]?.value ?? "" });
  return {
    name: rule.name,
    description: rule.description ?? "",
    triggerEvent: rule.trigger_event,
    c1Field: row(0).field,
    c1Op: row(0).op,
    c1Value: row(0).value,
    c2Field: row(1).field,
    c2Op: row(1).op,
    c2Value: row(1).value,
    c3Field: row(2).field,
    c3Op: row(2).op,
    c3Value: row(2).value,
    notifyEnabled: Boolean(notify),
    notifyTo: notify?.to ?? "project_manager",
    notifyRoleKey: notify?.roleKey ?? NONE,
    notifyMembershipId: notify?.membershipId ?? NONE,
    notifyTitle: notify?.title ?? "",
    notifyMessage: notify?.message ?? "",
    notifySeverity: notify?.severity ?? "info",
    webhookEndpointId: hook?.endpointId ?? NONE,
  };
}

// ---------------------------------------------------------------------------
// Scheduler, integrations, notification preferences
// ---------------------------------------------------------------------------
export const jobSchema = z.object({
  enabled: z.boolean(),
  intervalMinutes: z
    .string()
    .trim()
    .regex(/^\d{1,5}$/, "Enter a whole number of minutes.")
    .transform(Number)
    .pipe(z.number().min(5, "At least 5 minutes.").max(10080, "At most 7 days (10080 minutes).")),
});
export type JobInput = z.input<typeof jobSchema>;

export const connectionSchema = z.object({
  provider: z.enum(PROVIDERS),
  name: requiredText(2, 80, "The name"),
  target: z
    .string()
    .trim()
    .max(120)
    .regex(/^[\w./:@-]*$/, "Use letters, numbers and . / : @ - only."),
});
export type ConnectionInput = z.input<typeof connectionSchema>;

export const linkSchema = z.object({
  workItemKey: z.string().trim().toUpperCase().regex(/^[A-Z0-9]+(-[A-Z0-9]+)*-\d+$/, "Enter a work item key like NW-12."),
  externalId: z.string().trim().min(1, "Enter the external issue id.").max(120),
});
export type LinkInput = z.input<typeof linkSchema>;

export const NOTIFICATION_CATEGORIES = ["delivery", "governance", "workforce", "ai", "system"] as const;
export const preferencesSchema = z.object({
  prefs: z.array(z.object({ category: z.enum(NOTIFICATION_CATEGORIES), inApp: z.boolean(), email: z.boolean() })).length(NOTIFICATION_CATEGORIES.length),
});
