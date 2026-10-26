import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { rankAtIndex } from "@/lib/board";
import { computeDeliveryKpis } from "@/lib/domain/kpis";
import { reportToMarkdown } from "@/lib/domain/report-markdown";
import {
  ALLOWED_PARENTS,
  averageVelocity,
  buildBurndown,
  commitmentReliability,
  milestoneStatus,
  rankBetween,
  scheduleVarianceDays,
  WORK_ITEM_TYPES,
} from "@/lib/domain/work";
import { workItemSchema } from "@/lib/validation/work";
import { newItemDefaults } from "@/lib/work-form-defaults";

const migration = readFileSync(join(__dirname, "../../supabase/migrations/20261028000100_work_management.sql"), "utf8");

describe("work item hierarchy", () => {
  it("mirrors public.allowed_parent_types() exactly", () => {
    const body = migration.slice(migration.indexOf("function public.allowed_parent_types"));
    for (const type of WORK_ITEM_TYPES) {
      const m = body.match(new RegExp(`when '${type}'\\s+then '\\{([^}]*)\\}'`));
      expect(m, type).not.toBeNull();
      const sql = m![1] ? m![1].split(",").sort() : [];
      expect([...ALLOWED_PARENTS[type]].sort(), type).toEqual(sql);
    }
  });

  it("keeps epics at the top level", () => {
    expect(ALLOWED_PARENTS.epic).toEqual([]);
    for (const t of WORK_ITEM_TYPES) expect(ALLOWED_PARENTS[t]).not.toContain(t);
  });
});

describe("ranking", () => {
  it("places items between, before and after neighbours", () => {
    expect(rankBetween(1000, 2000)).toBe(1500);
    expect(rankBetween(null, 2000)).toBe(976);
    expect(rankBetween(1000, null)).toBe(2024);
    expect(rankBetween(null, null)).toBe(1024);
  });

  it("computes a rank for a drop position in a column", () => {
    const cards = [{ rank: 100 }, { rank: 200 }, { rank: 300 }];
    expect(rankAtIndex(cards, 0)).toBe(-924);
    expect(rankAtIndex(cards, 1)).toBe(150);
    expect(rankAtIndex(cards, 3)).toBe(1324);
    expect(rankAtIndex([], 0)).toBe(1024);
  });
});

describe("milestones", () => {
  const today = "2026-10-27";
  it("classifies status by completion and due date", () => {
    expect(milestoneStatus({ due_date: "2026-10-01", completed_on: "2026-09-30" }, today)).toBe("achieved");
    expect(milestoneStatus({ due_date: "2026-10-26", completed_on: null }, today)).toBe("overdue");
    expect(milestoneStatus({ due_date: "2026-10-27", completed_on: null }, today)).toBe("due_soon");
    expect(milestoneStatus({ due_date: "2026-11-10", completed_on: null }, today)).toBe("due_soon");
    expect(milestoneStatus({ due_date: "2026-11-11", completed_on: null }, today)).toBe("on_track");
  });

  it("measures variance against the baseline in days", () => {
    expect(scheduleVarianceDays({ due_date: "2026-11-21", baseline_due_date: "2026-10-31" })).toBe(21);
    expect(scheduleVarianceDays({ due_date: "2026-10-28", baseline_due_date: "2026-10-31" })).toBe(-3);
    expect(scheduleVarianceDays({ due_date: "2026-10-28", baseline_due_date: null })).toBeNull();
  });
});

describe("sprint metrics", () => {
  const sprint = { start_date: "2026-10-20", end_date: "2026-10-24", committed_points: 20 };

  it("builds a burndown that carries values forward and stops at today", () => {
    const points = buildBurndown(
      sprint,
      [
        { day: "2026-10-20", scope_points: 20, done_points: 0 },
        { day: "2026-10-22", scope_points: 22, done_points: 8 },
      ],
      "2026-10-23",
    );
    expect(points.map((p) => p.day)).toEqual(["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"]);
    expect(points.map((p) => p.remaining)).toEqual([20, 20, 14, 14, null]);
    expect(points.map((p) => p.scope)).toEqual([20, 20, 22, 22, null]);
    expect(points[0].ideal).toBe(20);
    expect(points.at(-1)!.ideal).toBe(0);
  });

  it("averages velocity over the most recent completed sprints", () => {
    const sprints = [
      { completed_points: 10, completed_at: "2026-08-01" },
      { completed_points: 20, completed_at: "2026-09-01" },
      { completed_points: 30, completed_at: "2026-10-01" },
      { completed_points: 40, completed_at: "2026-10-15" },
      { completed_points: null, completed_at: null },
    ];
    expect(averageVelocity(sprints)).toBe(30);
    expect(averageVelocity([])).toBeNull();
  });

  it("reports commitment reliability as a percentage", () => {
    expect(commitmentReliability(31, 24)).toBe(77);
    expect(commitmentReliability(0, 5)).toBeNull();
    expect(commitmentReliability(10, null)).toBeNull();
  });
});

describe("delivery KPIs", () => {
  it("counts milestones, blocked items and sprint progress", () => {
    const k = computeDeliveryKpis({
      milestones: [
        { due_date: "2026-10-20", baseline_due_date: "2026-10-10", completed_on: null },
        { due_date: "2026-10-30", baseline_due_date: "2026-10-30", completed_on: null },
        { due_date: "2026-10-01", baseline_due_date: null, completed_on: "2026-10-01" },
      ],
      sprintItems: [
        { story_points: 5, done: true },
        { story_points: 3, done: false },
        { story_points: null, done: true },
      ],
      committedPoints: 8,
      activeSprints: 1,
      blockedItems: 2,
      now: new Date("2026-10-27T06:00:00Z"),
      timeZone: "UTC",
    });
    expect(k.milestones_overdue).toBe(1);
    expect(k.milestones_due_14_days).toBe(1);
    expect(k.milestones_slipped).toBe(1);
    expect(k.blocked_work_items).toBe(2);
    expect(k.sprint_completion).toMatchObject({ scopePoints: 8, donePoints: 5, percent: 63 });
  });
});

describe("work item form", () => {
  const base = { ...newItemDefaults("6f1c1f0e-5d3b-4f63-9c2a-1b2c3d4e5f60"), title: "Do the thing" };

  it("parses labels, numbers and empty values", () => {
    const v = workItemSchema.parse({ ...base, labels: "UX, api,ux ", storyPoints: "3", estimateHours: "" });
    expect(v.labels).toEqual(["ux", "api"]);
    expect(v.storyPoints).toBe(3);
    expect(v.estimateHours).toBeNull();
    expect(v.parentId).toBeNull();
  });

  it("requires a reason when blocked and limits severity to bugs and incidents", () => {
    expect(workItemSchema.safeParse({ ...base, blocked: true, blockedReason: "" }).success).toBe(false);
    expect(workItemSchema.safeParse({ ...base, severity: "s1" }).success).toBe(false);
    expect(workItemSchema.safeParse({ ...base, type: "bug", severity: "s1" }).success).toBe(true);
  });
});

describe("status report markdown", () => {
  it("includes narrative and evidence but no work item titles", () => {
    const md = reportToMarkdown({
      projectCode: "NW-PAY",
      projectName: "Payments",
      periodStart: "2026-10-20",
      periodEnd: "2026-10-26",
      health: "red",
      summary: "Vendor delay continues.",
      highlights: "Ledger posting done.",
      nextSteps: null,
      decisionsNeeded: "Approve extra contractor.",
      metrics: {
        asOf: "2026-10-26",
        milestones: { overdue: [{ name: "Vendor API integration", dueDate: "2026-10-16" }], dueNext14Days: [], achievedInPeriod: [], slipped: [{ name: "Cutover", varianceDays: 20 }] },
        sprint: { name: "PAY Sprint 9", endDate: "2026-11-02", committedPoints: 24, scopePoints: 24, donePoints: 5 },
        blockedItems: 1,
        completedItems: 2,
        changes: [{ change_type: "health", from_status: null, to_status: null, from_health: "amber", to_health: "red", reason: "Slip" }],
      },
    });
    expect(md).toContain("**Health:** Red");
    expect(md).toContain("### Decisions needed");
    expect(md).toContain("Vendor API integration (due 2026-10-16)");
    expect(md).toContain("Cutover (+20 days)");
    expect(md).toContain("5 of 24 points done");
    expect(md).toContain("Health Amber → Red: Slip");
    expect(md).not.toContain("### Next steps");
  });
});
