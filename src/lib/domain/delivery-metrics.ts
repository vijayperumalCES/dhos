import { addDaysToDate, type DateString } from "./time";

/**
 * The delivery metrics a project reports each week. Keys, how weeks combine, ranges and which metrics
 * the system can fill in itself mirror private.metric_catalogue() in the database (a unit test fails
 * when they drift); labels, groups and hints live only here.
 */
export type MetricUnit = "count" | "percent" | "score";
export type MetricAgg = "sum" | "avg" | "latest" | "computed";
export type MetricSource = "manual" | "auto" | "computed";

export type MetricDef = {
  key: string;
  group: string;
  label: string;
  unit: MetricUnit;
  agg: MetricAgg;
  lo: number;
  hi: number;
  /** Stride can work this out from its own records when nobody enters a value. */
  auto: boolean;
  hint?: string;
};

export const METRIC_GROUPS = [
  "Requirement",
  "Estimation",
  "Coding / Dev & UT",
  "Quality assurance / Engineering",
  "User acceptance testing",
  "Release",
  "Retrospective",
  "Metrics collection and reporting",
  "Customer satisfaction",
  "AI adoption (engg.ai)",
] as const;

const m = (key: string, group: (typeof METRIC_GROUPS)[number], label: string, unit: MetricUnit, agg: MetricAgg, lo: number, hi: number, auto = false, hint?: string): MetricDef => ({
  key,
  group,
  label,
  unit,
  agg,
  lo,
  hi,
  auto,
  hint,
});

export const METRICS: readonly MetricDef[] = [
  m("scope_creeps", "Requirement", "Scope creeps", "count", "sum", 0, 1000, true, "Change requests raised in the week."),
  m("schedule_variance_pct", "Estimation", "Schedule variance (%)", "percent", "avg", -1000, 1000),
  m("effort_variance_pct", "Estimation", "Effort variance (%)", "percent", "avg", -1000, 1000),
  m("unit_test_coverage_pct", "Coding / Dev & UT", "Unit test coverage (%)", "percent", "avg", 0, 100),
  m("pull_requests", "Coding / Dev & UT", "Pull requests", "count", "sum", 0, 10000, true, "Pull requests linked to work items in the week."),
  m("test_pass_rate_pct", "Quality assurance / Engineering", "Test pass rate (%)", "percent", "avg", 0, 100),
  m("qa_bugs", "Quality assurance / Engineering", "QA bugs", "count", "sum", 0, 10000),
  m("test_execution_pct", "Quality assurance / Engineering", "Test execution (%)", "percent", "avg", 0, 100),
  m("test_automation_pct", "Quality assurance / Engineering", "Test automation coverage (%)", "percent", "avg", 0, 100),
  m("uat_coverage_pct", "User acceptance testing", "UAT test coverage (%)", "percent", "avg", 0, 100),
  m("uat_execution_pct", "User acceptance testing", "UAT test execution (%)", "percent", "avg", 0, 100),
  m("uat_automation_pct", "User acceptance testing", "UAT automation (%)", "percent", "avg", 0, 100),
  m("uat_bugs", "User acceptance testing", "UAT bugs", "count", "sum", 0, 10000),
  m("releases_successful", "Release", "Successful feature releases", "count", "sum", 0, 1000, true, "Releases marked released in the week."),
  m("hotfix_releases", "Release", "Hotfix releases", "count", "sum", 0, 1000),
  m("rollbacks", "Release", "Rollbacks", "count", "sum", 0, 1000),
  m("production_bugs", "Release", "Production bugs", "count", "sum", 0, 10000),
  m("retros_done", "Retrospective", "Retros done", "count", "sum", 0, 100),
  m("retro_action_items", "Retrospective", "Action items listed in retro", "count", "sum", 0, 1000),
  m("retro_pending_items", "Retrospective", "Pending items in retro", "count", "latest", 0, 1000),
  m("metrics_reported_pct", "Metrics collection and reporting", "Agreed metrics reported (%)", "percent", "computed", 0, 100, false, "Worked out from the other metrics."),
  m("csat_score", "Customer satisfaction", "CSAT (quarterly)", "score", "latest", 0, 100),
  m("nps_score", "Customer satisfaction", "NPS (quarterly)", "score", "latest", -100, 100),
  m("esat_score", "Customer satisfaction", "ESAT (quarterly)", "score", "latest", 0, 100),
  m("customer_escalations", "Customer satisfaction", "Customer issues / escalations raised", "count", "sum", 0, 1000, true, "Escalations raised on the project in the week."),
  m("escalations_completed", "Customer satisfaction", "Issues / escalations completed", "count", "sum", 0, 1000, true, "Escalations resolved in the week."),
  m("escalations_pending", "Customer satisfaction", "Issues / escalations pending", "count", "latest", 0, 1000, true, "Escalations still open at the end of the period."),
  m("ai_processes_pct", "AI adoption (engg.ai)", "AI engineering processes implemented (%)", "percent", "latest", 0, 100),
  m("ai_first_engineers_pct", "AI adoption (engg.ai)", "AI-first engineers in the team (%)", "percent", "latest", 0, 100),
  m("ai_pocs", "AI adoption (engg.ai)", "AI PoCs done with the customer", "count", "sum", 0, 1000),
];

const BY_KEY = new Map(METRICS.map((d) => [d.key, d]));
export const metricByKey = (key: string): MetricDef | undefined => BY_KEY.get(key);

/** Metrics a person can type in (everything but the computed one). */
export const ENTERABLE_METRICS = METRICS.filter((d) => d.agg !== "computed");

export type MetricValue = { key: string; value: number | null; source: MetricSource | null };

/** Reads the JSON the database returns, dropping anything that is not a known metric. */
export function parseMetricValues(json: unknown): MetricValue[] {
  if (!Array.isArray(json)) return [];
  const out: MetricValue[] = [];
  for (const raw of json) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.key !== "string" || !BY_KEY.has(r.key)) continue;
    const value = r.value === null || r.value === undefined ? null : Number(r.value);
    const source = r.source === "manual" || r.source === "auto" || r.source === "computed" ? r.source : null;
    out.push({ key: r.key, value: value !== null && Number.isFinite(value) ? value : null, source });
  }
  return out;
}

export function formatMetricValue(def: MetricDef, value: number | null): string {
  if (value === null) return "—";
  const text = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return def.unit === "percent" ? `${text}%` : text;
}

/** The Monday of the week that contains the date. */
export function weekStartOf(date: DateString): DateString {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDaysToDate(date, -((dow + 6) % 7));
}

export const isMonday = (date: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(`${date}T00:00:00Z`).getUTCDay() === 1;

/** The last complete week and month at a date, matching what the report job generates. */
export function lastCompletePeriods(today: DateString) {
  const weekStart = addDaysToDate(weekStartOf(today), -7);
  const firstOfMonth = `${today.slice(0, 7)}-01`;
  const monthEnd = addDaysToDate(firstOfMonth, -1);
  return {
    weekly: { start: weekStart, end: addDaysToDate(weekStart, 6) },
    monthly: { start: `${monthEnd.slice(0, 7)}-01`, end: monthEnd },
  };
}

const dateFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
export function formatPeriod(start: DateString, end: DateString): string {
  const f = (d: DateString) => dateFormat.format(new Date(`${d}T00:00:00Z`));
  return `${f(start)} – ${f(end)}`;
}

export type ReportEmailInput = {
  organizationName: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  kind: "weekly" | "monthly";
  periodStart: DateString;
  periodEnd: DateString;
  metrics: MetricValue[];
  siteUrl: string;
};

/** Plain-text body: one block per process, one line per metric, empty values said plainly. */
export function composeReportEmail(input: ReportEmailInput, to: string): { to: string; subject: string; text: string } {
  const values = new Map(input.metrics.map((v) => [v.key, v]));
  const width = Math.max(...METRICS.map((d) => d.label.length));
  const lines: string[] = [`${input.kind === "weekly" ? "Weekly" : "Monthly"} delivery report for ${input.projectCode} ${input.projectName}`, `Period: ${formatPeriod(input.periodStart, input.periodEnd)}`, ""];
  for (const group of METRIC_GROUPS) {
    lines.push(group);
    for (const d of METRICS.filter((x) => x.group === group)) {
      const v = values.get(d.key);
      const shown = v && v.value !== null ? formatMetricValue(d, v.value) : "not reported";
      lines.push(`  ${d.label.padEnd(width)}  ${shown}${v?.source === "auto" ? "  (from Stride)" : ""}`);
    }
    lines.push("");
  }
  lines.push(`Open in Stride: ${input.siteUrl}/projects/${input.projectId}/metrics`, "", `You receive this because you are on the report list for ${input.projectCode} in ${input.organizationName}.`);
  return {
    to,
    subject: `[${input.organizationName}] ${input.kind === "weekly" ? "Weekly" : "Monthly"} report: ${input.projectCode} ${formatPeriod(input.periodStart, input.periodEnd)}`,
    text: lines.join("\n"),
  };
}
