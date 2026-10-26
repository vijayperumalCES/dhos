import { addDays, differenceInCalendarDays, parseISO, startOfDay, subDays } from "date-fns";

import {
  IN_FLIGHT_STATUSES,
  PROJECT_HEALTHS,
  PROJECT_STATUSES,
  type ProjectHealth,
  type ProjectStatus,
} from "./project-lifecycle";

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
      "Health is a manager's judgement recorded in DHOS. It is not yet derived from milestones, work items or financials (Phases 2–5).",
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
    period: "Point in time (today, organization time zone not yet applied — UTC)",
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
    formula: "count(in-flight projects where today <= target_end_date <= today + 30)",
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

export function isPastTargetEnd(p: ProjectSnapshot, now: Date): boolean {
  if (!p.target_end_date) return false;
  return differenceInCalendarDays(parseISO(p.target_end_date), startOfDay(now)) < 0;
}

export function computePortfolioKpis(input: PortfolioKpiInput) {
  const { projects, history, now, staleAfterDays, periodDays } = input;
  const live = projects.filter((p) => p.archived_at === null);
  const inFlight = live.filter(isInFlight);
  const today = startOfDay(now);
  const in30 = addDays(today, 30);
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
    overdue_target_end: inFlight.filter((p) => isPastTargetEnd(p, now)).length,
    due_next_30_days: inFlight.filter((p) => {
      if (!p.target_end_date) return false;
      const d = parseISO(p.target_end_date);
      return d >= today && d <= in30;
    }).length,
    status_changes: inPeriod.length,
    health_deteriorations: deteriorations.length,
    lifecycle_distribution: lifecycleDistribution,
  } satisfies Record<KpiId, unknown>;
}

export type PortfolioKpis = ReturnType<typeof computePortfolioKpis>;

export const REPORTING_PERIODS = [7, 30, 90] as const;
export type ReportingPeriod = (typeof REPORTING_PERIODS)[number];

export function parseReportingPeriod(value: string | undefined): ReportingPeriod {
  const n = Number(value);
  return (REPORTING_PERIODS as readonly number[]).includes(n) ? (n as ReportingPeriod) : 30;
}
