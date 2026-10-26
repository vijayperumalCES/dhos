import { parseISO, subDays } from "date-fns";

import {
  IN_FLIGHT_STATUSES,
  PROJECT_HEALTHS,
  PROJECT_STATUSES,
  type ProjectHealth,
  type ProjectStatus,
} from "./project-lifecycle";
import { addDaysToDate, todayInTimeZone } from "./time";

/**
 * KPI catalogue. Every number on the Command Center is defined here with its formula,
 * source, period and known limitations, and is computed by a pure function below from
 * persisted rows the viewer is authorised to read (RLS scopes the inputs).
 */
export type KpiDefinition = {
  id: string;
  name: string;
  definition: string;
  formula: string;
  sources: string[];
  period: string;
  owner: string;
  threshold?: string;
  freshness: string;
  limitations: string;
};

export const KPI_CATALOGUE = {
  active_projects: {
    id: "active_projects",
    name: "Active projects",
    definition: "Projects currently in the Active lifecycle stage.",
    formula: "count(projects where status = 'active' and archived_at is null)",
    sources: ["projects"],
    period: "Point in time (now)",
    owner: "Delivery Head",
    freshness: "Live — read on every page load",
    limitations: "Counts only projects visible to the viewer under their role.",
  },
  in_flight_projects: {
    id: "in_flight_projects",
    name: "In-flight projects",
    definition: "Projects in Planning, Active or On hold — the portfolio that needs governance attention.",
    formula: "count(projects where status in ('planning','active','on_hold') and archived_at is null)",
    sources: ["projects"],
    period: "Point in time (now)",
    owner: "Delivery Head",
    freshness: "Live",
    limitations: "Proposed and Approved projects are excluded until planning starts.",
  },
  health_distribution: {
    id: "health_distribution",
    name: "Project health distribution",
    definition: "In-flight projects grouped by their latest RAG health rating.",
    formula: "count(in-flight projects) group by health",
    sources: ["projects.health"],
    period: "Point in time (now)",
    owner: "Delivery Head",
    freshness: "Each rating carries its own timestamp; see Stale health ratings.",
    limitations:
      "Health is a manager's judgement recorded in Stride. It is not yet derived from milestones, work items or financials (Phases 2–5).",
  },
  projects_at_risk: {
    id: "projects_at_risk",
    name: "Projects at risk",
    definition: "In-flight projects rated Amber or Red.",
    formula: "count(in-flight projects where health in ('amber','red'))",
    sources: ["projects.health"],
    period: "Point in time (now)",
    owner: "Delivery Head",
    threshold: "Any Red project requires a recorded reason and a recovery discussion.",
    freshness: "Live",
    limitations: "Depends on managers keeping ratings current.",
  },
  stale_health: {
    id: "stale_health",
    name: "Stale or missing health ratings",
    definition:
      "In-flight projects whose health has never been assessed, or was last confirmed longer ago than the organization's staleness threshold.",
    formula:
      "count(in-flight projects where health = 'not_assessed' or health_updated_at < now() - health_stale_after_days)",
    sources: ["projects.health_updated_at", "organization_settings.health_stale_after_days"],
    period: "Point in time (now)",
    owner: "Delivery Head",
    threshold: "Target: 0",
    freshness: "Live",
    limitations: "Re-confirming an unchanged rating resets its age.",
  },
  overdue_target_end: {
    id: "overdue_target_end",
    name: "Past target end date",
    definition: "In-flight projects whose target end date has passed without completion.",
    formula: "count(in-flight projects where target_end_date < today)",
    sources: ["projects.target_end_date", "projects.status"],
    period: "Point in time (today in the organization's time zone)",
    owner: "Delivery Head",
    threshold: "Target: 0",
    freshness: "Live",
    limitations:
      "Uses the project-level target date only. Milestone-level slippage arrives with milestones in Phase 2. Projects without a target date are not counted.",
  },
  due_next_30_days: {
    id: "due_next_30_days",
    name: "Target end within 30 days",
    definition: "In-flight projects whose target end date falls within the next 30 days.",
    formula: "count(in-flight projects where today <= target_end_date <= today + 30), today in the organization's time zone",
    sources: ["projects.target_end_date"],
    period: "Next 30 days",
    owner: "Delivery Head",
    freshness: "Live",
    limitations: "Project-level dates only.",
  },
  status_changes: {
    id: "status_changes",
    name: "Lifecycle and health changes",
    definition: "Number of lifecycle transitions and health rating changes recorded in the selected period.",
    formula: "count(project_status_history where change_type in ('status','health') and changed_at >= now() - period)",
    sources: ["project_status_history"],
    period: "Selected reporting period (7, 30 or 90 days)",
    owner: "Delivery Head",
    freshness: "Live",
    limitations: "Changes to projects later archived are still counted.",
  },
  health_deteriorations: {
    id: "health_deteriorations",
    name: "Health deteriorations",
    definition: "Health changes in the period that moved a project to a worse rating (Green → Amber → Red).",
    formula: "count(health history rows in period where rank(to_health) > rank(from_health))",
    sources: ["project_status_history"],
    period: "Selected reporting period",
    owner: "Delivery Head",
    freshness: "Live",
    limitations: "Moving from Not assessed to any rating is not counted as a deterioration.",
  },
  lifecycle_distribution: {
    id: "lifecycle_distribution",
    name: "Portfolio by lifecycle stage",
    definition: "Non-archived projects grouped by lifecycle stage.",
    formula: "count(projects where archived_at is null) group by status",
    sources: ["projects.status"],
    period: "Point in time (now)",
    owner: "Delivery Head",
    freshness: "Live",
    limitations: "Archived projects are excluded.",
  },
  milestones_overdue: {
    id: "milestones_overdue",
    name: "Overdue milestones",
    definition: "Milestones of non-archived projects that are past their due date and not achieved.",
    formula: "count(project_milestones where completed_on is null and due_date < today)",
    sources: ["project_milestones"],
    period: "Point in time (today in the organization's time zone)",
    owner: "Delivery Head",
    threshold: "Target: 0",
    freshness: "Live",
    limitations: "Only as good as milestone upkeep: an achieved milestone not marked achieved counts as overdue.",
  },
  milestones_due_14_days: {
    id: "milestones_due_14_days",
    name: "Milestones due in 14 days",
    definition: "Open milestones due between today and 14 days from today.",
    formula: "count(project_milestones where completed_on is null and today <= due_date <= today + 14)",
    sources: ["project_milestones"],
    period: "Next 14 days",
    owner: "Delivery Head",
    freshness: "Live",
    limitations: "Project-level milestones only.",
  },
  milestones_slipped: {
    id: "milestones_slipped",
    name: "Milestones slipped vs baseline",
    definition: "Open milestones whose current due date is later than their baselined due date.",
    formula: "count(open milestones where due_date > baseline_due_date)",
    sources: ["project_milestones.baseline_due_date"],
    period: "Point in time",
    owner: "Delivery Head",
    freshness: "Live",
    limitations: "Milestones added after the last baseline have no baseline and are not counted.",
  },
  blocked_work_items: {
    id: "blocked_work_items",
    name: "Blocked work items",
    definition: "Open work items flagged as blocked.",
    formula: "count(work_items where blocked and archived_at is null and state category <> 'done')",
    sources: ["work_items.blocked"],
    period: "Point in time",
    owner: "Delivery Head",
    threshold: "Each should have a blocker reason and an owner chasing it.",
    freshness: "Live",
    limitations: "Counts the manual flag only; items waiting on an unfinished dependency are shown on the item itself.",
  },
  sprint_completion: {
    id: "sprint_completion",
    name: "Active sprint completion",
    definition: "Done points as a share of current scope across all active sprints, against the committed scope at start.",
    formula: "sum(done points) / sum(scope points) over items in active sprints",
    sources: ["sprints", "work_items.story_points", "workflow_states.category"],
    period: "Current sprints",
    owner: "Delivery Head",
    freshness: "Live",
    limitations: "Unestimated items count as zero points. Read alongside days remaining in each sprint.",
  },
} satisfies Record<string, KpiDefinition>;

export type KpiId = keyof typeof KPI_CATALOGUE;

export type ProjectSnapshot = {
  id: string;
  status: ProjectStatus;
  health: ProjectHealth;
  health_updated_at: string | null;
  target_end_date: string | null;
  archived_at: string | null;
};

export type HistorySnapshot = {
  change_type: string;
  from_health: ProjectHealth | null;
  to_health: ProjectHealth | null;
  changed_at: string;
};

export type PortfolioKpiInput = {
  projects: ProjectSnapshot[];
  history: HistorySnapshot[];
  now: Date;
  /** IANA time zone used to decide which calendar day "today" is. */
  timeZone: string;
  staleAfterDays: number;
  periodDays: number;
};

const HEALTH_RANK: Record<ProjectHealth, number> = { not_assessed: -1, green: 0, amber: 1, red: 2 };

export function isInFlight(p: Pick<ProjectSnapshot, "status" | "archived_at">): boolean {
  return p.archived_at === null && IN_FLIGHT_STATUSES.includes(p.status);
}

export function isHealthStale(p: ProjectSnapshot, now: Date, staleAfterDays: number): boolean {
  if (p.health === "not_assessed" || !p.health_updated_at) return true;
  return parseISO(p.health_updated_at) < subDays(now, staleAfterDays);
}

export function isPastTargetEnd(p: Pick<ProjectSnapshot, "target_end_date">, now: Date, timeZone: string): boolean {
  if (!p.target_end_date) return false;
  return p.target_end_date < todayInTimeZone(now, timeZone);
}

export function computePortfolioKpis(input: PortfolioKpiInput) {
  const { projects, history, now, timeZone, staleAfterDays, periodDays } = input;
  const live = projects.filter((p) => p.archived_at === null);
  const inFlight = live.filter(isInFlight);
  const today = todayInTimeZone(now, timeZone);
  const in30 = addDaysToDate(today, 30);
  const periodStart = subDays(now, periodDays);

  const healthDistribution = Object.fromEntries(
    PROJECT_HEALTHS.map((h) => [h, inFlight.filter((p) => p.health === h).length]),
  ) as Record<ProjectHealth, number>;

  const lifecycleDistribution = Object.fromEntries(
    PROJECT_STATUSES.map((s) => [s, live.filter((p) => p.status === s).length]),
  ) as Record<ProjectStatus, number>;

  const inPeriod = history.filter((h) => parseISO(h.changed_at) >= periodStart && h.change_type !== "created");
  const deteriorations = inPeriod.filter(
    (h) =>
      h.change_type === "health" &&
      h.from_health !== null &&
      h.to_health !== null &&
      h.from_health !== "not_assessed" &&
      HEALTH_RANK[h.to_health] > HEALTH_RANK[h.from_health],
  );

  return {
    active_projects: live.filter((p) => p.status === "active").length,
    in_flight_projects: inFlight.length,
    health_distribution: healthDistribution,
    projects_at_risk: healthDistribution.amber + healthDistribution.red,
    stale_health: inFlight.filter((p) => isHealthStale(p, now, staleAfterDays)).length,
    overdue_target_end: inFlight.filter((p) => isPastTargetEnd(p, now, timeZone)).length,
    due_next_30_days: inFlight.filter((p) => !!p.target_end_date && p.target_end_date >= today && p.target_end_date <= in30).length,
    status_changes: inPeriod.length,
    health_deteriorations: deteriorations.length,
    lifecycle_distribution: lifecycleDistribution,
  } satisfies Partial<Record<KpiId, unknown>>;
}

export type PortfolioKpis = ReturnType<typeof computePortfolioKpis>;

export const REPORTING_PERIODS = [7, 30, 90] as const;
export type ReportingPeriod = (typeof REPORTING_PERIODS)[number];

export function parseReportingPeriod(value: string | undefined): ReportingPeriod {
  const n = Number(value);
  return (REPORTING_PERIODS as readonly number[]).includes(n) ? (n as ReportingPeriod) : 30;
}

export type MilestoneSnapshot = { due_date: string; baseline_due_date: string | null; completed_on: string | null };
export type SprintItemSnapshot = { story_points: number | null; done: boolean };

/** Phase 2 delivery metrics: milestones, blocked work and sprint progress. */
export function computeDeliveryKpis(input: {
  milestones: MilestoneSnapshot[];
  sprintItems: SprintItemSnapshot[];
  committedPoints: number;
  activeSprints: number;
  blockedItems: number | null;
  now: Date;
  timeZone: string;
}) {
  const today = todayInTimeZone(input.now, input.timeZone);
  const in14 = addDaysToDate(today, 14);
  const open = input.milestones.filter((m) => !m.completed_on);
  const scope = input.sprintItems.reduce((s, i) => s + (i.story_points ?? 0), 0);
  const done = input.sprintItems.filter((i) => i.done).reduce((s, i) => s + (i.story_points ?? 0), 0);
  return {
    milestones_overdue: open.filter((m) => m.due_date < today).length,
    milestones_due_14_days: open.filter((m) => m.due_date >= today && m.due_date <= in14).length,
    milestones_slipped: open.filter((m) => m.baseline_due_date !== null && m.due_date > m.baseline_due_date).length,
    blocked_work_items: input.blockedItems,
    sprint_completion: {
      activeSprints: input.activeSprints,
      scopePoints: scope,
      donePoints: done,
      committedPoints: input.committedPoints,
      percent: scope > 0 ? Math.round((done / scope) * 100) : null,
    },
  } satisfies Partial<Record<KpiId, unknown>>;
}

export type DeliveryKpis = ReturnType<typeof computeDeliveryKpis>;
