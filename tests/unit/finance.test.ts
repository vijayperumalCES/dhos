import { describe, expect, it } from "vitest";

import {
  attentionOrder,
  computeFinancials,
  firstOfMonth,
  formatMoney,
  formatMonth,
  formatPercent,
  formatVariance,
  rollUp,
  sumFinancials,
  type FinancialRow,
} from "@/lib/domain/finance";

const base: FinancialRow = {
  projectId: "p1",
  budgetVersion: 1,
  baselineApprovedAt: "2026-10-01T00:00:00Z",
  budgetTotal: 100000,
  budgetLabour: 80000,
  labourActual: 40000,
  otherActual: 10000,
  approvedHours: 400,
  unratedHours: 0,
  labourForecast: 30000,
  unratedForecastHours: 0,
  otherForecast: 5000,
  revenueRecognised: 0,
  revenuePlanned: 0,
  hasRevenue: false,
};
const row = (over: Partial<FinancialRow> = {}) => computeFinancials({ ...base, ...over });

describe("computeFinancials", () => {
  it("separates facts from forecasts and adds them for the estimate at completion", () => {
    const f = row();
    expect(f.actual).toBe(50000);
    expect(f.forecastRemaining).toBe(35000);
    expect(f.eac).toBe(85000);
    expect(f.variance).toBe(15000);
    expect(f.variancePct).toBeCloseTo(0.15);
    expect(f.burnPct).toBeCloseTo(0.5);
    expect(f.status).toBe("on_track");
  });

  it("flags a forecast at 95% of budget or more as at risk and above budget as over", () => {
    expect(row({ labourForecast: 40000 }).status).toBe("at_risk"); // 95,000 = exactly 95%
    expect(row({ labourForecast: 44000 }).status).toBe("at_risk"); // 99,000
    expect(row({ labourForecast: 45000 }).status).toBe("at_risk"); // 100,000 = on budget, not over
    expect(row({ labourForecast: 45001 }).status).toBe("over_budget");
    expect(row({ labourForecast: 39999 }).status).toBe("on_track");
  });

  it("reports a negative variance for an overrun", () => {
    const f = row({ labourForecast: 60000 });
    expect(f.variance).toBe(-15000);
    expect(f.status).toBe("over_budget");
  });

  it("has no variance, burn or status verdict without a baseline", () => {
    const f = row({ budgetTotal: null, budgetLabour: null, budgetVersion: null });
    expect(f.variance).toBeNull();
    expect(f.variancePct).toBeNull();
    expect(f.burnPct).toBeNull();
    expect(f.status).toBe("no_baseline");
  });

  it("treats a zero baseline as over budget as soon as anything is spent or planned", () => {
    expect(row({ budgetTotal: 0, budgetLabour: 0 }).status).toBe("over_budget");
    expect(row({ budgetTotal: 0, budgetLabour: 0, labourActual: 0, otherActual: 0, labourForecast: 0, otherForecast: 0 }).status).toBe("on_track");
    expect(row({ budgetTotal: 0, budgetLabour: 0 }).variancePct).toBeNull();
  });

  it("computes margin only where revenue is recorded", () => {
    expect(row().marginToDate).toBeNull();
    expect(row().marginForecast).toBeNull();
    const f = row({ hasRevenue: true, revenueRecognised: 60000, revenuePlanned: 60000 });
    expect(f.marginToDate).toBe(10000); // 60,000 recognised − 50,000 spent
    expect(f.marginForecast).toBe(35000); // 120,000 − 85,000
    expect(f.marginForecastPct).toBeCloseTo(35000 / 120000);
  });

  it("counts hours without a rate instead of pricing them at zero", () => {
    expect(row({ unratedHours: 12, unratedForecastHours: 8 }).hoursWithoutRate).toBe(20);
  });

  it("rounds to cents", () => {
    expect(row({ labourActual: 0.1, otherActual: 0.2, labourForecast: 0, otherForecast: 0 }).actual).toBe(0.3);
  });
});

describe("sumFinancials and rollUp", () => {
  const a = row({ projectId: "a" });
  const b = row({ projectId: "b", budgetTotal: 50000, budgetLabour: 40000, labourForecast: 35000 }); // eac 90,000 vs 50,000
  const c = row({ projectId: "c", budgetTotal: null, budgetLabour: null, budgetVersion: null, hasRevenue: true, revenueRecognised: 20000, revenuePlanned: 0 });

  it("compares budget with estimate only across baselined projects", () => {
    const t = sumFinancials([a, b, c]);
    expect(t.projects).toBe(3);
    expect(t.baselined).toBe(2);
    expect(t.budget).toBe(150000);
    expect(t.eac).toBe(175000);
    expect(t.variance).toBe(-25000);
    expect(t.actual).toBe(150000); // actuals include the project without a baseline
    expect(t.overBudget).toBe(1);
    expect(t.noBaseline).toBe(1);
  });

  it("totals margin over projects with revenue only", () => {
    const t = sumFinancials([a, b, c]);
    expect(t.withRevenue).toBe(1);
    expect(t.revenueRecognised).toBe(20000);
    expect(t.marginToDate).toBe(-30000);
    expect(t.marginForecastPct).toBeCloseTo(t.marginForecast / 20000);
  });

  it("has no margin percentage when there is no revenue", () => {
    expect(sumFinancials([a]).marginForecastPct).toBeNull();
    expect(sumFinancials([]).projects).toBe(0);
  });

  it("groups and orders by size", () => {
    const groups = rollUp(
      [
        { financials: a, client: "Acme" },
        { financials: b, client: "Acme" },
        { financials: c, client: "Globex" },
      ],
      (i) => ({ key: i.client, label: i.client }),
    );
    expect(groups.map((g) => g.label)).toEqual(["Acme", "Globex"]);
    expect(groups[0].totals.projects).toBe(2);
  });

  it("orders attention: over budget, at risk, no baseline, on track", () => {
    const over = row({ projectId: "over", labourForecast: 60000 });
    const worse = row({ projectId: "worse", labourForecast: 90000 });
    const risk = row({ projectId: "risk", labourForecast: 42000 });
    const none = row({ projectId: "none", budgetTotal: null });
    const ok = row({ projectId: "ok", labourForecast: 0 });
    const sorted = [ok, none, risk, over, worse].sort(attentionOrder).map((r) => r.projectId);
    expect(sorted).toEqual(["worse", "over", "risk", "none", "ok"]);
  });
});

describe("formatting", () => {
  it("formats money in the organization currency", () => {
    expect(formatMoney(1200, "USD")).toBe("$1,200");
    expect(formatMoney(1200.5, "USD")).toBe("$1,200.50");
    expect(formatMoney(null, "USD")).toBe("—");
    expect(formatMoney(1500000, "USD", { compact: true })).toBe("$1.5M");
  });

  it("signs variances", () => {
    expect(formatVariance(1200, "USD")).toBe("+$1,200");
    expect(formatVariance(-300, "USD")).toBe("−$300");
    expect(formatVariance(0, "USD")).toBe("$0");
    expect(formatVariance(null, "USD")).toBe("—");
  });

  it("formats percentages and months", () => {
    expect(formatPercent(0.153)).toBe("15%");
    expect(formatPercent(0.1534, 1)).toBe("15.3%");
    expect(formatPercent(null)).toBe("—");
    expect(formatMonth("2026-11-01")).toBe("Nov 2026");
    expect(firstOfMonth("2026-11-17")).toBe("2026-11-01");
  });
});
