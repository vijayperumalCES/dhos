import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runTick, type Deps } from "@/lib/automation/dispatcher";
import {
  composeReportEmail,
  ENTERABLE_METRICS,
  formatMetricValue,
  isMonday,
  lastCompletePeriods,
  METRIC_GROUPS,
  METRICS,
  metricByKey,
  parseMetricValues,
  weekStartOf,
} from "@/lib/domain/delivery-metrics";
import { metricEntriesSchema, reportSettingsSchema } from "@/lib/validation/metrics";

const MIGRATION = readFileSync(join(process.cwd(), "supabase/migrations/20261107000100_delivery_metrics.sql"), "utf8");
const PROJECT = "11111111-1111-4111-8111-111111111111";

describe("metric catalogue", () => {
  it("matches the database catalogue row for row", () => {
    const body = MIGRATION.match(/function private\.metric_catalogue[\s\S]*?select \* from \(values([\s\S]*?)\) as t/);
    expect(body).not.toBeNull();
    const rows = [...body![1].matchAll(/\('([a-z_]+)',\s*'([a-z]+)',\s*(-?\d+)(?:::numeric)?,\s*(-?\d+)(?:::numeric)?,\s*(true|false)\)/g)].map((m) => ({
      key: m[1],
      agg: m[2],
      lo: Number(m[3]),
      hi: Number(m[4]),
      auto: m[5] === "true",
    }));
    expect(rows).toHaveLength(30);
    expect(METRICS.map(({ key, agg, lo, hi, auto }) => ({ key, agg, lo, hi, auto }))).toEqual(rows);
  });

  it("has unique keys, known groups and sane ranges", () => {
    expect(new Set(METRICS.map((d) => d.key)).size).toBe(METRICS.length);
    for (const d of METRICS) {
      expect(METRIC_GROUPS).toContain(d.group);
      expect(d.lo).toBeLessThan(d.hi);
    }
    expect(ENTERABLE_METRICS.some((d) => d.agg === "computed")).toBe(false);
  });
});

describe("formatting and dates", () => {
  it("formats values by unit", () => {
    expect(formatMetricValue(metricByKey("qa_bugs")!, 5)).toBe("5");
    expect(formatMetricValue(metricByKey("test_pass_rate_pct")!, 92.5)).toBe("92.5%");
    expect(formatMetricValue(metricByKey("test_pass_rate_pct")!, 92)).toBe("92%");
    expect(formatMetricValue(metricByKey("nps_score")!, -40)).toBe("-40");
    expect(formatMetricValue(metricByKey("qa_bugs")!, null)).toBe("—");
  });

  it("finds the Monday of any week", () => {
    expect(weekStartOf("2026-11-04")).toBe("2026-11-02");
    expect(weekStartOf("2026-11-02")).toBe("2026-11-02");
    expect(weekStartOf("2026-11-08")).toBe("2026-11-02");
    expect(isMonday("2026-11-02")).toBe(true);
    expect(isMonday("2026-11-03")).toBe(false);
    expect(isMonday("nope")).toBe(false);
  });

  it("names the last complete week and month, matching the job", () => {
    expect(lastCompletePeriods("2026-11-04")).toEqual({ weekly: { start: "2026-10-26", end: "2026-11-01" }, monthly: { start: "2026-10-01", end: "2026-10-31" } });
    expect(lastCompletePeriods("2026-01-01").monthly).toEqual({ start: "2025-12-01", end: "2025-12-31" });
    expect(lastCompletePeriods("2026-03-01").monthly).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });
});

describe("parseMetricValues", () => {
  it("keeps known metrics and drops the rest", () => {
    const out = parseMetricValues([
      { key: "qa_bugs", value: "3", source: "manual" },
      { key: "bogus", value: 1, source: "manual" },
      { key: "rollbacks", value: null, source: null },
      { key: "pull_requests", value: "x", source: "auto" },
      "junk",
    ]);
    expect(out).toEqual([
      { key: "qa_bugs", value: 3, source: "manual" },
      { key: "rollbacks", value: null, source: null },
      { key: "pull_requests", value: null, source: "auto" },
    ]);
    expect(parseMetricValues("nope")).toEqual([]);
  });
});

describe("report email", () => {
  const input = {
    organizationName: "Acme",
    projectId: PROJECT,
    projectCode: "AB-1",
    projectName: "Billing",
    kind: "weekly" as const,
    periodStart: "2026-10-26",
    periodEnd: "2026-11-01",
    metrics: [
      { key: "qa_bugs", value: 3, source: "manual" as const },
      { key: "pull_requests", value: 7, source: "auto" as const },
      { key: "test_pass_rate_pct", value: 92.5, source: "manual" as const },
    ],
    siteUrl: "https://stride.test",
  };

  it("lists every group and metric and says plainly what is not reported", () => {
    const m = composeReportEmail(input, "client@x.test");
    expect(m.to).toBe("client@x.test");
    expect(m.subject).toBe("[Acme] Weekly report: AB-1 26 Oct 2026 – 1 Nov 2026");
    for (const g of METRIC_GROUPS) expect(m.text).toContain(g);
    for (const d of METRICS) expect(m.text).toContain(d.label);
    expect(m.text).toMatch(/Pull requests\s+7\s+\(from Stride\)/);
    expect(m.text).toMatch(/Test pass rate \(%\)\s+92.5%/);
    expect(m.text).toMatch(/Hotfix releases\s+not reported/);
    expect(m.text).toContain(`https://stride.test/projects/${PROJECT}/metrics`);
  });

  it("titles a monthly report as monthly", () => {
    expect(composeReportEmail({ ...input, kind: "monthly" }, "a@b.test").subject).toMatch(/^\[Acme\] Monthly report/);
  });
});

describe("validation", () => {
  const base = { projectId: PROJECT, week: "2026-10-26" };

  it("turns blanks into clears and numbers into numbers", () => {
    const r = metricEntriesSchema.parse({ ...base, values: { qa_bugs: " 4 ", rollbacks: "", test_pass_rate_pct: "92.5" } });
    expect(r.values).toEqual({ qa_bugs: 4, rollbacks: null, test_pass_rate_pct: 92.5 });
  });

  it("refuses non-Mondays, unknown and computed metrics, text and out-of-range values", () => {
    expect(metricEntriesSchema.safeParse({ ...base, week: "2026-10-27", values: {} }).success).toBe(false);
    expect(metricEntriesSchema.safeParse({ ...base, values: { bogus: "1" } }).success).toBe(false);
    expect(metricEntriesSchema.safeParse({ ...base, values: { metrics_reported_pct: "50" } }).success).toBe(false);
    expect(metricEntriesSchema.safeParse({ ...base, values: { qa_bugs: "many" } }).success).toBe(false);
    expect(metricEntriesSchema.safeParse({ ...base, values: { test_pass_rate_pct: "101" } }).success).toBe(false);
    expect(metricEntriesSchema.safeParse({ ...base, values: { nps_score: "-101" } }).success).toBe(false);
    expect(metricEntriesSchema.safeParse({ ...base, values: { nps_score: "-100" } }).success).toBe(true);
  });

  it("reads recipients separated by commas, spaces or lines, lowercased and de-duplicated", () => {
    const r = reportSettingsSchema.parse({ projectId: PROJECT, weekly: true, monthly: false, recipients: "A@x.test, b@x.test\nb@x.test;  c@x.test" });
    expect(r.recipients).toEqual(["a@x.test", "b@x.test", "c@x.test"]);
  });

  it("refuses bad addresses and more than 20", () => {
    expect(reportSettingsSchema.safeParse({ projectId: PROJECT, weekly: true, monthly: false, recipients: "not-an-email" }).success).toBe(false);
    const many = Array.from({ length: 21 }, (_, i) => `u${i}@x.test`).join("\n");
    expect(reportSettingsSchema.safeParse({ projectId: PROJECT, weekly: true, monthly: false, recipients: many }).success).toBe(false);
    expect(reportSettingsSchema.parse({ projectId: PROJECT, weekly: false, monthly: false, recipients: "" }).recipients).toEqual([]);
  });
});

function fakeDb(answers: Record<string, (args: Record<string, unknown>) => unknown>) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const db = {
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      calls.push({ name, args });
      const a = answers[name];
      return { data: a ? a(args) : null, error: null };
    },
  };
  return { db: db as never, calls };
}

describe("report delivery", () => {
  const run = (over: Record<string, unknown> = {}) => ({
    id: "r1",
    project_id: PROJECT,
    organization_name: "Acme",
    project_code: "AB-1",
    project_name: "Billing",
    kind: "weekly",
    period_start: "2026-10-26",
    period_end: "2026-11-01",
    recipients: ["a@x.test", "b@x.test"],
    delivered_to: [],
    payload: { metrics: [{ key: "qa_bugs", value: 3, source: "manual" }] },
    ...over,
  });
  const deps = (send: (to: string) => Promise<"sent" | "simulated">): Deps => ({
    email: { name: "resend", send: (m) => send(m.to) },
    send: { fetch: (async () => new Response(null, { status: 200 })) as never, resolve: async () => ["93.184.216.34"], siteUrl: "https://s.test" },
    siteUrl: "https://s.test",
  });

  it("emails every recipient and records a sent outcome", async () => {
    const sent: string[] = [];
    const { db, calls } = fakeDb({ claim_pending_reports: () => [run()] });
    const s = await runTick(db, deps(async (to) => (sent.push(to), "sent")));
    expect(sent).toEqual(["a@x.test", "b@x.test"]);
    expect(s.reports).toEqual({ attempted: 1, sent: 1, simulated: 0, failed: 0 });
    expect(calls.find((c) => c.name === "complete_report_run")?.args).toMatchObject({ p_id: "r1", p_delivered: ["a@x.test", "b@x.test"], p_outcome: "sent", p_error: null });
  });

  it("reports simulated when no mail provider is configured", async () => {
    const { db, calls } = fakeDb({ claim_pending_reports: () => [run()] });
    const s = await runTick(db, deps(async () => "simulated"));
    expect(s.reports.simulated).toBe(1);
    expect(calls.find((c) => c.name === "complete_report_run")?.args.p_outcome).toBe("simulated");
  });

  it("skips recipients who already have it and keeps going after one fails", async () => {
    const sent: string[] = [];
    const { db, calls } = fakeDb({ claim_pending_reports: () => [run({ recipients: ["a@x.test", "b@x.test", "c@x.test"], delivered_to: ["a@x.test"] })] });
    const s = await runTick(
      db,
      deps(async (to) => {
        if (to === "b@x.test") throw new Error("Email provider answered HTTP 500");
        sent.push(to);
        return "sent";
      }),
    );
    expect(sent).toEqual(["c@x.test"]);
    expect(s.reports.failed).toBe(1);
    expect(calls.find((c) => c.name === "complete_report_run")?.args).toMatchObject({ p_delivered: ["c@x.test"], p_error: "Email provider answered HTTP 500" });
  });
});
