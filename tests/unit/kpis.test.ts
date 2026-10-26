import { describe, expect, it } from "vitest";

import {
  computePortfolioKpis,
  isHealthStale,
  KPI_CATALOGUE,
  parseReportingPeriod,
  type HistorySnapshot,
  type ProjectSnapshot,
} from "@/lib/domain/kpis";

const NOW = new Date("2026-10-26T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const dateOffset = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString().slice(0, 10);

function project(overrides: Partial<ProjectSnapshot>): ProjectSnapshot {
  return {
    id: crypto.randomUUID(),
    status: "active",
    health: "green",
    health_updated_at: daysAgo(1),
    target_end_date: dateOffset(60),
    archived_at: null,
    ...overrides,
  };
}

const base = { history: [] as HistorySnapshot[], now: NOW, timeZone: "UTC", staleAfterDays: 14, periodDays: 30 };

describe("portfolio KPIs", () => {
  it("counts in-flight projects as planning, active and on hold only", () => {
    const k = computePortfolioKpis({
      ...base,
      projects: [
        project({ status: "planning" }),
        project({ status: "active" }),
        project({ status: "on_hold" }),
        project({ status: "proposed" }),
        project({ status: "completed" }),
        project({ status: "cancelled" }),
      ],
    });
    expect(k.in_flight_projects).toBe(3);
    expect(k.active_projects).toBe(1);
  });

  it("excludes archived projects from every metric", () => {
    const k = computePortfolioKpis({
      ...base,
      projects: [project({ health: "red", archived_at: daysAgo(2) }), project({})],
    });
    expect(k.in_flight_projects).toBe(1);
    expect(k.projects_at_risk).toBe(0);
    expect(k.lifecycle_distribution.active).toBe(1);
  });

  it("counts amber and red in-flight projects as at risk", () => {
    const k = computePortfolioKpis({
      ...base,
      projects: [project({ health: "red" }), project({ health: "amber" }), project({ health: "green" }), project({ status: "completed", health: "red" })],
    });
    expect(k.projects_at_risk).toBe(2);
    expect(k.health_distribution).toEqual({ green: 1, amber: 1, red: 1, not_assessed: 0 });
  });

  it("flags missing and stale health ratings using the organization threshold", () => {
    const projects = [
      project({ health: "not_assessed", health_updated_at: null }),
      project({ health_updated_at: daysAgo(15) }),
      project({ health_updated_at: daysAgo(13) }),
    ];
    expect(computePortfolioKpis({ ...base, projects }).stale_health).toBe(2);
    expect(computePortfolioKpis({ ...base, projects, staleAfterDays: 30 }).stale_health).toBe(1);
    expect(isHealthStale(projects[1], NOW, 14)).toBe(true);
  });

  it("counts projects past target end and due within 30 days, ignoring missing dates", () => {
    const k = computePortfolioKpis({
      ...base,
      projects: [
        project({ target_end_date: dateOffset(-1) }),
        project({ target_end_date: dateOffset(0) }),
        project({ target_end_date: dateOffset(30) }),
        project({ target_end_date: dateOffset(31) }),
        project({ target_end_date: null }),
        project({ status: "completed", target_end_date: dateOffset(-10) }),
      ],
    });
    expect(k.overdue_target_end).toBe(1);
    expect(k.due_next_30_days).toBe(2);
  });

  it("counts changes and deteriorations inside the reporting period only", () => {
    const history: HistorySnapshot[] = [
      { change_type: "health", from_health: "green", to_health: "amber", changed_at: daysAgo(3) },
      { change_type: "health", from_health: "amber", to_health: "green", changed_at: daysAgo(4) },
      { change_type: "health", from_health: "not_assessed", to_health: "red", changed_at: daysAgo(5) },
      { change_type: "status", from_health: null, to_health: null, changed_at: daysAgo(6) },
      { change_type: "health", from_health: "green", to_health: "red", changed_at: daysAgo(40) },
      { change_type: "created", from_health: null, to_health: "green", changed_at: daysAgo(2) },
    ];
    const k = computePortfolioKpis({ ...base, projects: [], history });
    expect(k.status_changes).toBe(4);
    expect(k.health_deteriorations).toBe(1);
  });

  it("defines every computed KPI in the catalogue with source, period and limitations", () => {
    const k = computePortfolioKpis({ ...base, projects: [] });
    for (const id of Object.keys(k)) {
      const def = KPI_CATALOGUE[id as keyof typeof KPI_CATALOGUE];
      expect(def, id).toBeDefined();
      expect(def.formula.length).toBeGreaterThan(0);
      expect(def.sources.length).toBeGreaterThan(0);
      expect(def.period.length).toBeGreaterThan(0);
      expect(def.limitations.length).toBeGreaterThan(0);
    }
  });

  it("decides overdue by the calendar day in the organization's time zone", () => {
    // 2026-10-26T20:00Z is already 27 Oct (01:30) in Kolkata but still 26 Oct in New York.
    const now = new Date("2026-10-26T20:00:00Z");
    const due26 = [project({ target_end_date: "2026-10-26" })];
    expect(computePortfolioKpis({ ...base, now, projects: due26, timeZone: "Asia/Kolkata" }).overdue_target_end).toBe(1);
    expect(computePortfolioKpis({ ...base, now, projects: due26, timeZone: "America/New_York" }).overdue_target_end).toBe(0);
    expect(computePortfolioKpis({ ...base, now, projects: due26, timeZone: "UTC" }).overdue_target_end).toBe(0);
  });

  it("accepts only supported reporting periods", () => {
    expect(parseReportingPeriod("7")).toBe(7);
    expect(parseReportingPeriod("90")).toBe(90);
    expect(parseReportingPeriod("365")).toBe(30);
    expect(parseReportingPeriod(undefined)).toBe(30);
  });
});
