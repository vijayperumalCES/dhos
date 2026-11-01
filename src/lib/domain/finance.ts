/**
 * Pure finance rules shared by pages, server actions and tests: cost categories, the derived
 * measures of a project's financial report (estimate at completion, variance, margin), roll-ups
 * for portfolio analytics and money formatting. The database computes the facts and forecasts
 * (`project_financials`); this module only combines them, so every number on screen has one
 * definition. Amounts are in the organization currency.
 */

export const COST_CATEGORIES = ["labour", "software", "infrastructure", "travel", "subcontractor", "other"] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];
export const COST_CATEGORY_LABELS: Record<CostCategory, string> = {
  labour: "Labour",
  software: "Software",
  infrastructure: "Infrastructure",
  travel: "Travel",
  subcontractor: "Subcontractors",
  other: "Other",
};
/** Labour comes from approved timesheets, so it can't be entered in the ledger or forecast by hand. */
export const NON_LABOUR_CATEGORIES = COST_CATEGORIES.filter((c) => c !== "labour") as Exclude<CostCategory, "labour">[];

export const BUDGET_STATUS_LABELS = { draft: "Draft", approved: "Baseline", superseded: "Superseded" } as const;
export type BudgetStatus = keyof typeof BUDGET_STATUS_LABELS;

export const BILLING_MODELS = ["fixed_price", "time_and_materials", "retainer"] as const;
export type BillingModel = (typeof BILLING_MODELS)[number];
export const BILLING_MODEL_LABELS: Record<BillingModel, string> = {
  fixed_price: "Fixed price",
  time_and_materials: "Time and materials",
  retainer: "Retainer",
};

/** Forecast at completion at or above this share of the budget is "at risk". */
export const AT_RISK_SHARE = 0.95;

/** One row of `project_financials`, with numbers (the API returns numeric columns as numbers). */
export type FinancialRow = {
  projectId: string;
  budgetVersion: number | null;
  baselineApprovedAt: string | null;
  budgetTotal: number | null;
  budgetLabour: number | null;
  labourActual: number;
  otherActual: number;
  approvedHours: number;
  unratedHours: number;
  labourForecast: number;
  unratedForecastHours: number;
  otherForecast: number;
  revenueRecognised: number;
  revenuePlanned: number;
  hasRevenue: boolean;
};

export type FinanceStatus = "no_baseline" | "on_track" | "at_risk" | "over_budget";
export const FINANCE_STATUS_LABELS: Record<FinanceStatus, string> = {
  no_baseline: "No baseline",
  on_track: "On track",
  at_risk: "At risk",
  over_budget: "Over budget",
};

export type Financials = FinancialRow & {
  /** Facts: approved labour plus the ledger. */
  actual: number;
  /** Opinion: planned labour from dated allocations plus monthly non-labour forecasts. */
  forecastRemaining: number;
  /** Estimate at completion: what has been spent plus what is expected to be. */
  eac: number;
  /** Budget minus estimate at completion; negative means an overrun. Null without a baseline. */
  variance: number | null;
  variancePct: number | null;
  /** Share of the budget already spent. */
  burnPct: number | null;
  status: FinanceStatus;
  revenueTotal: number;
  /** Recognised revenue minus actual cost. Null when no revenue is recorded. */
  marginToDate: number | null;
  /** Total revenue (recognised plus planned) minus estimate at completion. */
  marginForecast: number | null;
  marginForecastPct: number | null;
  /** Hours (worked or planned) that have no rate, so their cost is not in any total. */
  hoursWithoutRate: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeFinancials(row: FinancialRow): Financials {
  const actual = round2(row.labourActual + row.otherActual);
  const forecastRemaining = round2(row.labourForecast + row.otherForecast);
  const eac = round2(actual + forecastRemaining);
  const budget = row.budgetTotal;
  const hasBudget = budget !== null && budget > 0;
  const variance = budget === null ? null : round2(budget - eac);
  const revenueTotal = round2(row.revenueRecognised + row.revenuePlanned);

  let status: FinanceStatus = "no_baseline";
  if (hasBudget) status = eac > budget ? "over_budget" : eac >= budget * AT_RISK_SHARE ? "at_risk" : "on_track";
  else if (budget === 0) status = eac > 0 ? "over_budget" : "on_track";

  return {
    ...row,
    actual,
    forecastRemaining,
    eac,
    variance,
    variancePct: variance === null || !hasBudget ? null : variance / budget,
    burnPct: hasBudget ? actual / budget : null,
    status,
    revenueTotal,
    marginToDate: row.hasRevenue ? round2(row.revenueRecognised - actual) : null,
    marginForecast: row.hasRevenue ? round2(revenueTotal - eac) : null,
    marginForecastPct: row.hasRevenue && revenueTotal > 0 ? (revenueTotal - eac) / revenueTotal : null,
    hoursWithoutRate: row.unratedHours + row.unratedForecastHours,
  };
}

export type Totals = {
  projects: number;
  /** Budget, estimate and variance cover only projects with an approved baseline, so they compare like with like. */
  baselined: number;
  budget: number;
  actual: number;
  eac: number;
  variance: number;
  overBudget: number;
  atRisk: number;
  noBaseline: number;
  /** Margin covers only projects with revenue recorded. */
  withRevenue: number;
  revenueRecognised: number;
  revenueTotal: number;
  marginToDate: number;
  marginForecast: number;
  marginForecastPct: number | null;
  hoursWithoutRate: number;
};

export function sumFinancials(rows: Financials[]): Totals {
  const baselined = rows.filter((r) => r.budgetTotal !== null);
  const revenue = rows.filter((r) => r.hasRevenue);
  const marginForecast = round2(revenue.reduce((s, r) => s + (r.marginForecast ?? 0), 0));
  const revenueTotal = round2(revenue.reduce((s, r) => s + r.revenueTotal, 0));
  return {
    projects: rows.length,
    baselined: baselined.length,
    budget: round2(baselined.reduce((s, r) => s + (r.budgetTotal ?? 0), 0)),
    actual: round2(rows.reduce((s, r) => s + r.actual, 0)),
    eac: round2(baselined.reduce((s, r) => s + r.eac, 0)),
    variance: round2(baselined.reduce((s, r) => s + (r.variance ?? 0), 0)),
    overBudget: rows.filter((r) => r.status === "over_budget").length,
    atRisk: rows.filter((r) => r.status === "at_risk").length,
    noBaseline: rows.filter((r) => r.status === "no_baseline").length,
    withRevenue: revenue.length,
    revenueRecognised: round2(revenue.reduce((s, r) => s + r.revenueRecognised, 0)),
    revenueTotal,
    marginToDate: round2(revenue.reduce((s, r) => s + (r.marginToDate ?? 0), 0)),
    marginForecast,
    marginForecastPct: revenueTotal > 0 ? marginForecast / revenueTotal : null,
    hoursWithoutRate: round2(rows.reduce((s, r) => s + r.hoursWithoutRate, 0)),
  };
}

/** Groups rows (a client, a program, a status) and totals each group, largest estimate first. */
export function rollUp<T extends { financials: Financials }>(items: T[], keyOf: (item: T) => { key: string; label: string }) {
  const groups = new Map<string, { key: string; label: string; rows: Financials[] }>();
  for (const item of items) {
    const { key, label } = keyOf(item);
    const g = groups.get(key) ?? { key, label, rows: [] };
    g.rows.push(item.financials);
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({ key: g.key, label: g.label, totals: sumFinancials(g.rows) }))
    .sort((a, b) => b.totals.actual + b.totals.eac - (a.totals.actual + a.totals.eac) || a.label.localeCompare(b.label));
}

/** Orders projects for attention: over budget first, then at risk, then by size of the overrun. */
export function attentionOrder(a: Financials, b: Financials): number {
  const rank: Record<FinanceStatus, number> = { over_budget: 0, at_risk: 1, no_baseline: 2, on_track: 3 };
  return rank[a.status] - rank[b.status] || (a.variance ?? 0) - (b.variance ?? 0);
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------
export function formatMoney(amount: number | null | undefined, currency: string, opts?: { compact?: boolean }): string {
  if (amount === null || amount === undefined) return "—";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      ...(opts?.compact ? { notation: "compact", maximumFractionDigits: 1 } : { maximumFractionDigits: 2, minimumFractionDigits: Number.isInteger(amount) ? 0 : 2 }),
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Signed money for variances: "+£1,200" under budget, "−£300" over. */
export function formatVariance(amount: number | null | undefined, currency: string): string {
  if (amount === null || amount === undefined) return "—";
  if (amount === 0) return formatMoney(0, currency);
  return `${amount > 0 ? "+" : "−"}${formatMoney(Math.abs(amount), currency)}`;
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

/** Month label for a first-of-month date string ("2026-11-01" → "Nov 2026"). */
export function formatMonth(value: string): string {
  const [y, m] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** First day of the month containing a date string. */
export function firstOfMonth(value: string): string {
  return `${value.slice(0, 7)}-01`;
}
