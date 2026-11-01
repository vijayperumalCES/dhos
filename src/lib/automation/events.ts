/**
 * Catalogue of domain events written to the outbox by database triggers
 * (supabase/migrations/20261105000100_automation.sql). The database is authoritative about when an
 * event is emitted; this mirror gives the UI labels and the payload fields a rule can test.
 */
export const EVENT_CATEGORIES = ["delivery", "governance", "workforce", "ai", "system"] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  delivery: "Delivery",
  governance: "Governance",
  workforce: "Workforce",
  ai: "AI agents",
  system: "System and rules",
};

export type EventField = { key: string; label: string; values?: readonly string[] };
type EventDef = { label: string; category: EventCategory; fields: readonly EventField[] };

const HEALTH = ["not_assessed", "green", "amber", "red"] as const;
const PROJECT_STATUS = ["proposed", "approved", "planning", "active", "on_hold", "completed", "cancelled"] as const;

export const EVENTS = {
  "project.health_changed": {
    label: "Project health changed",
    category: "delivery",
    fields: [
      { key: "code", label: "Project code" },
      { key: "from", label: "Health before", values: HEALTH },
      { key: "to", label: "Health after", values: HEALTH },
    ],
  },
  "project.status_changed": {
    label: "Project status changed",
    category: "delivery",
    fields: [
      { key: "code", label: "Project code" },
      { key: "from", label: "Status before", values: PROJECT_STATUS },
      { key: "to", label: "Status after", values: PROJECT_STATUS },
    ],
  },
  "work_item.blocked": { label: "Work item blocked", category: "delivery", fields: [{ key: "key", label: "Item key" }] },
  "work_item.assigned": { label: "Work item assigned", category: "delivery", fields: [{ key: "key", label: "Item key" }] },
  "raid.created": {
    label: "RAID item created",
    category: "governance",
    fields: [
      { key: "type", label: "Type", values: ["risk", "assumption", "issue", "dependency"] },
      { key: "score", label: "Score (probability × impact)" },
    ],
  },
  "escalation.raised": {
    label: "Escalation raised",
    category: "governance",
    fields: [{ key: "severity", label: "Severity", values: ["medium", "high", "critical"] }],
  },
  "escalation.overdue": { label: "Escalation overdue", category: "governance", fields: [] },
  "leave.requested": { label: "Leave requested", category: "workforce", fields: [{ key: "days", label: "Days" }] },
  "leave.decided": {
    label: "Leave decided",
    category: "workforce",
    fields: [{ key: "status", label: "Decision", values: ["approved", "rejected"] }],
  },
  "timesheet.submitted": { label: "Timesheet submitted", category: "workforce", fields: [] },
  "timesheet.decided": {
    label: "Timesheet decided",
    category: "workforce",
    fields: [{ key: "status", label: "Decision", values: ["approved", "rejected"] }],
  },
  "timesheet.missing": { label: "Timesheet missing", category: "workforce", fields: [{ key: "week_start", label: "Week start" }] },
  "release.status_changed": {
    label: "Release status changed",
    category: "delivery",
    fields: [
      { key: "from", label: "Status before", values: ["planned", "in_review", "approved", "released", "cancelled"] },
      { key: "to", label: "Status after", values: ["planned", "in_review", "approved", "released", "cancelled"] },
    ],
  },
  "sprint.state_changed": {
    label: "Sprint started or completed",
    category: "delivery",
    fields: [{ key: "to", label: "State after", values: ["planned", "active", "completed"] }],
  },
  "agent_approval.requested": { label: "AI proposal awaiting approval", category: "ai", fields: [] },
  "integration.link_status_changed": {
    label: "Linked external issue changed status",
    category: "delivery",
    fields: [
      { key: "key", label: "Item key" },
      { key: "to", label: "External status after" },
    ],
  },
} as const satisfies Record<string, EventDef>;

export type EventType = keyof typeof EVENTS;
export const EVENT_TYPES = Object.keys(EVENTS) as EventType[];

export function isEventType(value: string): value is EventType {
  return value in EVENTS;
}

export function eventLabel(type: string): string {
  return isEventType(type) ? EVENTS[type].label : type;
}

/** One line for chat webhooks and the event stream. Uses only short labels from the payload. */
export function summarizeEvent(type: string, data: Record<string, unknown>): string {
  const s = (k: string) => (data[k] === undefined || data[k] === null ? "" : String(data[k]));
  switch (type) {
    case "project.health_changed":
      return `${s("code")} health: ${s("from")} → ${s("to")}`;
    case "project.status_changed":
      return `${s("code")} status: ${s("from")} → ${s("to")}`;
    case "work_item.blocked":
      return `${s("key")} blocked: ${s("title")}`;
    case "work_item.assigned":
      return `${s("key")} assigned: ${s("title")}`;
    case "raid.created":
      return `New ${s("type")}: ${s("title")}`;
    case "escalation.raised":
      return `Escalation (${s("severity")}): ${s("title")}`;
    case "escalation.overdue":
      return `Escalation overdue: ${s("title")}`;
    case "release.status_changed":
      return `Release ${s("name")}: ${s("from")} → ${s("to")}`;
    case "sprint.state_changed":
      return `Sprint ${s("name")}: ${s("to")}`;
    case "integration.link_status_changed":
      return `${s("key")} external issue ${s("external_id")}: ${s("from")} → ${s("to")}`;
    default:
      return eventLabel(type);
  }
}
