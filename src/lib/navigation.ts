import type { Permission, PermissionSet } from "@/lib/domain/permissions";

export type NavIcon =
  | "gauge"
  | "briefcase"
  | "folder"
  | "layers"
  | "building"
  | "kanban"
  | "rocket"
  | "users"
  | "clock"
  | "calendar"
  | "timer"
  | "chart"
  | "alert"
  | "wallet"
  | "messages"
  | "report"
  | "file"
  | "bot"
  | "workflow"
  | "plug"
  | "bell"
  | "settings";

export type NavItem = {
  title: string;
  icon: NavIcon;
  /** Present for implemented modules. */
  href?: string;
  /** Present for modules that are planned but not yet built. */
  plannedPhase?: number;
  slug?: string;
  /** Visible when the viewer holds any of these permissions. */
  anyOf?: Permission[];
};

export type NavGroup = { label: string; items: NavItem[] };

export const NAVIGATION: NavGroup[] = [
  {
    label: "Delivery",
    items: [
      { title: "Command Center", icon: "gauge", href: "/dashboard", anyOf: ["dashboard.portfolio.view"] },
      { title: "Projects", icon: "folder", href: "/projects", anyOf: ["project.read_all", "project.read_assigned"] },
      { title: "Clients", icon: "building", href: "/clients", anyOf: ["client.read"] },
      { title: "Programs", icon: "layers", href: "/programs", anyOf: ["project.read_all", "project.read_assigned"] },
      { title: "My Work", icon: "kanban", href: "/work", anyOf: ["work.read"] },
      { title: "Releases & Quality", icon: "rocket", href: "/releases", anyOf: ["release.read"] },
    ],
  },
  {
    label: "People",
    items: [
      { title: "People & Teams", icon: "users", href: "/teams", anyOf: ["team.read"] },
      { title: "Attendance", icon: "clock", href: "/attendance", anyOf: ["workforce.self", "hr.read"] },
      { title: "Leave", icon: "calendar", href: "/leave", anyOf: ["workforce.self", "hr.read"] },
      { title: "Timesheets", icon: "timer", href: "/timesheets", anyOf: ["workforce.self", "timesheet.read_all", "timesheet.approve"] },
      { title: "Resource Planning", icon: "chart", href: "/resources", anyOf: ["resource.read"] },
    ],
  },
  {
    label: "Governance",
    items: [
      { title: "Risks & Escalations", icon: "alert", href: "/governance/raid", anyOf: ["governance.read"] },
      { title: "Decisions & Actions", icon: "messages", href: "/governance/decisions", anyOf: ["governance.read"] },
      { title: "Governance Report", icon: "report", href: "/governance", anyOf: ["governance.read"] },
      { title: "Documents", icon: "file", href: "/documents", anyOf: ["document.read", "project.read_assigned", "project.read_all"] },
      { title: "Financials", icon: "wallet", href: "/finance", anyOf: ["finance.read"] },
    ],
  },
  {
    label: "Automation",
    items: [
      { title: "AI Agents", icon: "bot", href: "/agents", anyOf: ["agent.read", "agent.run", "agent.approve"] },
      { title: "Workflow Automation", icon: "workflow", plannedPhase: 7, slug: "workflows" },
      { title: "Integrations", icon: "plug", plannedPhase: 7, slug: "integrations" },
      { title: "Notifications", icon: "bell", plannedPhase: 7, slug: "notifications" },
    ],
  },
  {
    label: "Organization",
    items: [
      {
        title: "Administration",
        icon: "settings",
        href: "/admin",
        // The directory alone (org.members.read) is reached from People & Teams, not here.
        anyOf: ["org.settings.manage", "org.members.manage", "audit.read", "workflow.manage", "hr.manage"],
      },
    ],
  },
];

export const PLANNED_MODULES: Record<string, { title: string; phase: number; summary: string; scope: string[] }> = {
  workflows: {
    title: "Workflow Automation",
    phase: 7,
    summary: "Visual workflows with triggers, conditions, approvals and retries.",
    scope: ["Workflow builder", "Pre/post hooks", "Outbox and retries", "Dry runs and versioning"],
  },
  integrations: {
    title: "Integrations",
    phase: 7,
    summary: "GitHub, Azure DevOps, Jira, Slack, Teams, calendar and email adapters.",
    scope: ["Connection management", "Sync runs", "Webhooks", "Integration health"],
  },
  notifications: {
    title: "Notifications",
    phase: 7,
    summary: "In-app, email and chat notifications with deduplication and escalation rules.",
    scope: ["Notification center", "Preferences", "Escalation rules", "Delivery tracking"],
  },
};

/** Serializable nav model for the client sidebar, filtered by the viewer's permissions. */
export function buildNavigation(permissions: PermissionSet): NavGroup[] {
  return NAVIGATION.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.anyOf || permissions.any(...i.anyOf)),
  })).filter((g) => g.items.length > 0);
}
