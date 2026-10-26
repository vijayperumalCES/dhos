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
      { title: "Portfolio", icon: "briefcase", plannedPhase: 5, slug: "portfolio" },
      { title: "Programs", icon: "layers", href: "/programs", anyOf: ["project.read_all", "project.read_assigned"] },
      { title: "My Work", icon: "kanban", href: "/work", anyOf: ["work.read"] },
      { title: "Releases & Quality", icon: "rocket", plannedPhase: 4, slug: "releases" },
    ],
  },
  {
    label: "People",
    items: [
      { title: "People & Teams", icon: "users", href: "/teams", anyOf: ["team.read"] },
      { title: "Attendance", icon: "clock", plannedPhase: 3, slug: "attendance" },
      { title: "Leave", icon: "calendar", plannedPhase: 3, slug: "leave" },
      { title: "Timesheets", icon: "timer", plannedPhase: 3, slug: "timesheets" },
      { title: "Resource Planning", icon: "chart", plannedPhase: 3, slug: "resources" },
    ],
  },
  {
    label: "Governance",
    items: [
      { title: "Risks & Escalations", icon: "alert", plannedPhase: 4, slug: "risks" },
      { title: "Financials", icon: "wallet", plannedPhase: 5, slug: "financials" },
      { title: "Meetings & Decisions", icon: "messages", plannedPhase: 4, slug: "meetings" },
      { title: "Reports", icon: "report", plannedPhase: 4, slug: "reports" },
      { title: "Documents", icon: "file", plannedPhase: 4, slug: "documents" },
    ],
  },
  {
    label: "Automation",
    items: [
      { title: "AI Agents", icon: "bot", plannedPhase: 6, slug: "agents" },
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
        anyOf: ["org.settings.manage", "org.members.manage", "audit.read", "workflow.manage"],
      },
    ],
  },
];

export const PLANNED_MODULES: Record<string, { title: string; phase: number; summary: string; scope: string[] }> = {
  portfolio: {
    title: "Portfolio",
    phase: 5,
    summary: "Portfolio analytics, forecasting and variance across all projects.",
    scope: ["Portfolio health trends", "Forecast vs actual", "Variance analysis", "Business-unit roll-ups"],
  },
  releases: {
    title: "Releases & Quality",
    phase: 4,
    summary: "Release governance with configurable quality gates.",
    scope: ["Release calendar", "Quality gates and approvals", "Defect trends", "Deployment history"],
  },
  attendance: {
    title: "Attendance",
    phase: 3,
    summary: "Check-in/out, work schedules, exceptions and approved corrections.",
    scope: ["Attendance records", "Exceptions", "Corrections with approval", "Holiday calendars"],
  },
  leave: {
    title: "Leave",
    phase: 3,
    summary: "Leave types, balances, approvals and team availability.",
    scope: ["Leave requests", "Balances", "Team calendar", "Milestone conflict detection"],
  },
  timesheets: {
    title: "Timesheets",
    phase: 3,
    summary: "Daily and weekly effort logs with approvals.",
    scope: ["Time entries", "Submission and approval", "Missing-timesheet reports", "Estimate vs actual"],
  },
  resources: {
    title: "Resource Planning",
    phase: 3,
    summary: "Capacity, allocations, utilisation and staffing conflicts.",
    scope: ["Dated allocations", "Capacity forecasts", "Over/under-allocation", "Skill coverage"],
  },
  risks: {
    title: "Risks & Escalations",
    phase: 4,
    summary: "Unified RAID register, decisions, actions and escalation workflow.",
    scope: ["RAID register", "Escalations", "Decision log", "Change requests"],
  },
  financials: {
    title: "Financials",
    phase: 5,
    summary: "Budgets, rates, actuals and forecasts for authorised users only.",
    scope: ["Budgets and baselines", "Rate cards", "Forecasts", "Margin and billing readiness"],
  },
  meetings: {
    title: "Meetings & Decisions",
    phase: 4,
    summary: "Governance meetings, notes, decisions and action items.",
    scope: ["Meeting records", "Action items", "Decision records", "Status templates"],
  },
  reports: {
    title: "Reports",
    phase: 4,
    summary: "Daily, weekly, monthly and executive delivery reports.",
    scope: ["Report templates", "Scheduled reports", "Change-since-last-report", "Client reports"],
  },
  documents: {
    title: "Documents",
    phase: 4,
    summary: "Versioned project documents with access control.",
    scope: ["Charters, BRDs, specs", "Versioning", "Permissions", "AI retrieval (Phase 6)"],
  },
  agents: {
    title: "AI Agents",
    phase: 6,
    summary: "Specialised, permission-bounded AI sub-agents with human approval.",
    scope: ["Model gateway", "Agent registry", "Execution logs", "Approvals and evaluations"],
  },
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
