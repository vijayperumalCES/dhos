import { z } from "zod";

import { isEventType } from "./events";

/**
 * Workflow rule model: when <event> and <conditions> then <actions>.
 * Conditions are evaluated here (by the dispatcher and by dry runs); actions are executed by
 * private.apply_rule in the database so a rule runs at most once per event.
 */
export const OPERATORS = ["eq", "neq", "in", "gte", "lte", "contains"] as const;
export type Operator = (typeof OPERATORS)[number];
export const OPERATOR_LABELS: Record<Operator, string> = {
  eq: "is",
  neq: "is not",
  in: "is one of (comma separated)",
  gte: "is at least",
  lte: "is at most",
  contains: "contains",
};

export const conditionSchema = z.object({
  field: z.string().regex(/^[a-z_]{1,40}$/, "Choose a field."),
  op: z.enum(OPERATORS),
  value: z.string().trim().min(1, "Enter a value.").max(200),
});
export type Condition = z.infer<typeof conditionSchema>;

export const RECIPIENT_KINDS = ["project_manager", "delivery_owner", "assignee", "role", "member"] as const;
export type RecipientKind = (typeof RECIPIENT_KINDS)[number];
export const RECIPIENT_LABELS: Record<RecipientKind, string> = {
  project_manager: "The project manager",
  delivery_owner: "The delivery owner",
  assignee: "The assignee (events that have one)",
  role: "Everyone with a role",
  member: "One person",
};

export const SEVERITIES = ["info", "warning", "critical"] as const;

export const notifyActionSchema = z.object({
  type: z.literal("notify"),
  to: z.enum(RECIPIENT_KINDS),
  roleKey: z.string().regex(/^[a-z][a-z_]{1,48}$/).optional(),
  membershipId: z.uuid().optional(),
  title: z.string().trim().min(2, "Enter a title.").max(160),
  message: z.string().trim().max(500).optional(),
  severity: z.enum(SEVERITIES).default("info"),
});
export const webhookActionSchema = z.object({ type: z.literal("webhook"), endpointId: z.uuid() });
export const actionSchema = z.discriminatedUnion("type", [notifyActionSchema, webhookActionSchema]);
export type RuleAction = z.infer<typeof actionSchema>;

export const ruleDefinitionSchema = z
  .object({
    triggerEvent: z.string().refine(isEventType, "Choose an event."),
    conditions: z.array(conditionSchema).max(10),
    actions: z.array(actionSchema).min(1, "Add at least one action.").max(5),
  })
  .superRefine((def, ctx) => {
    def.actions.forEach((a, i) => {
      if (a.type !== "notify") return;
      if (a.to === "role" && !a.roleKey) ctx.addIssue({ code: "custom", path: ["actions", i, "roleKey"], message: "Choose a role." });
      if (a.to === "member" && !a.membershipId) ctx.addIssue({ code: "custom", path: ["actions", i, "membershipId"], message: "Choose a person." });
    });
  });

/** Payload values arrive as JSON; compare as numbers when both sides are numeric, else as text. */
function compare(actual: unknown, op: Operator, expected: string): boolean {
  if (actual === undefined || actual === null) return op === "neq";
  const a = String(actual);
  switch (op) {
    case "eq":
      return a === expected;
    case "neq":
      return a !== expected;
    case "in":
      return expected.split(",").map((v) => v.trim()).includes(a);
    case "contains":
      return a.toLowerCase().includes(expected.toLowerCase());
    case "gte":
    case "lte": {
      const x = Number(a);
      const y = Number(expected);
      if (Number.isNaN(x) || Number.isNaN(y)) return false;
      return op === "gte" ? x >= y : x <= y;
    }
  }
}

/** All conditions must hold (AND). An empty list matches every event of the trigger type. */
export function evaluateConditions(conditions: readonly Condition[], payload: Record<string, unknown>): boolean {
  return conditions.every((c) => compare(payload[c.field], c.op, c.value));
}

/** Stored conditions are jsonb; anything that fails the schema never matches rather than throwing. */
export function parseConditions(raw: unknown): Condition[] | null {
  const parsed = z.array(conditionSchema).safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export type DryRunEvent = { id: string; eventType: string; createdAt: string; payload: Record<string, unknown> };

/** Which of the recent events a rule would have matched. Pure: nothing is sent or recorded. */
export function dryRun(def: { triggerEvent: string; conditions: Condition[] }, events: readonly DryRunEvent[]) {
  const relevant = events.filter((e) => e.eventType === def.triggerEvent);
  const matched = relevant.filter((e) => evaluateConditions(def.conditions, e.payload));
  return { considered: relevant.length, matched };
}

export function describeRule(def: { triggerEvent: string; conditions: Condition[]; actions: RuleAction[] }, labels: { event: string }): string {
  const when = def.conditions.length
    ? ` and ${def.conditions.map((c) => `${c.field} ${OPERATOR_LABELS[c.op].replace(" (comma separated)", "")} ${c.value}`).join(" and ")}`
    : "";
  const then = def.actions.map((a) => (a.type === "notify" ? `notify ${RECIPIENT_LABELS[a.to].toLowerCase()}` : "call a webhook")).join(", ");
  return `When “${labels.event}”${when}, ${then}.`;
}
