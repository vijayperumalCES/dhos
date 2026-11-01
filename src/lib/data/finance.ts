import "server-only";

import type { OrgContext } from "@/lib/auth/org-context";
import { computeFinancials, type FinancialRow } from "@/lib/domain/finance";
import { clientLabel } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { listMemberOptions } from "./members";

const num = (v: number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: number | null | undefined) => (v === null || v === undefined ? null : Number(v));

type RpcRow = {
  project_id: string;
  budget_version: number | null;
  baseline_approved_at: string | null;
  budget_total: number | null;
  budget_labour: number | null;
  labour_actual: number | null;
  other_actual: number | null;
  approved_hours: number | null;
  unrated_hours: number | null;
  labour_forecast: number | null;
  unrated_forecast_hours: number | null;
  other_forecast: number | null;
  revenue_recognised: number | null;
  revenue_planned: number | null;
  has_revenue: boolean | null;
};

function toRow(r: RpcRow): FinancialRow {
  return {
    projectId: r.project_id,
    budgetVersion: r.budget_version,
    baselineApprovedAt: r.baseline_approved_at,
    budgetTotal: numOrNull(r.budget_total),
    budgetLabour: numOrNull(r.budget_labour),
    labourActual: num(r.labour_actual),
    otherActual: num(r.other_actual),
    approvedHours: num(r.approved_hours),
    unratedHours: num(r.unrated_hours),
    labourForecast: num(r.labour_forecast),
    unratedForecastHours: num(r.unrated_forecast_hours),
    otherForecast: num(r.other_forecast),
    revenueRecognised: num(r.revenue_recognised),
    revenuePlanned: num(r.revenue_planned),
    hasRevenue: !!r.has_revenue,
  };
}

/** The financial report for every project the viewer may see finances for, with the project context. */
export async function listProjectFinancials(ctx: OrgContext) {
  const supabase = await createSupabaseServerClient();
  const [report, projects] = await Promise.all([
    supabase.rpc("project_financials", { p_org: ctx.organization.id }),
    supabase
      .from("projects")
      .select(
        `id, code, name, status, health, client_id,
         client:clients!projects_client_id_organization_id_fkey(id, name),
         program:programs!projects_program_fkey(id, code, name)`,
      )
      .eq("organization_id", ctx.organization.id)
      .is("archived_at", null),
  ]);
  if (report.error) throw new Error(`Failed to load the financial report: ${report.error.message}`);
  if (projects.error) throw new Error(`Failed to load projects: ${projects.error.message}`);

  const byId = new Map((projects.data ?? []).map((p) => [p.id, p]));
  return (report.data ?? [])
    .map((r) => {
      const project = byId.get(r.project_id);
      return project ? { project: { ...project, clientName: clientLabel(project) }, financials: computeFinancials(toRow(r)) } : null;
    })
    .filter((x) => x !== null);
}
export type ProjectFinancialRow = Awaited<ReturnType<typeof listProjectFinancials>>[number];

export async function getProjectFinance(ctx: OrgContext, projectId: string) {
  const supabase = await createSupabaseServerClient();
  const canManage = ctx.permissions.has("finance.manage");
  const [report, budgets, costs, forecasts, revenue, monthly, contracts] = await Promise.all([
    supabase.rpc("project_financials", { p_org: ctx.organization.id, p_project: projectId }),
    supabase
      .from("project_budgets")
      .select(
        `id, version, name, status, notes, approved_at, created_at,
         drafter:organization_memberships!project_budgets_drafted_by_membership_id_organization_id_fkey(id, user_profiles(display_name)),
         approver:organization_memberships!project_budgets_approved_by_membership_id_organization_id_fkey(id, user_profiles(display_name)),
         lines:budget_lines(id, category, amount, note)`,
      )
      .eq("project_id", projectId)
      .order("version", { ascending: false }),
    supabase
      .from("cost_entries")
      .select("id, entry_date, category, amount, description, vendor, reference, reverses_id, created_at")
      .eq("project_id", projectId)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("forecast_entries").select("id, category, period, amount, note").eq("project_id", projectId).order("period").order("category"),
    supabase
      .from("revenue_lines")
      .select("id, description, planned_date, amount, status, recognised_on, contract_id, contract:client_contracts(id, title)")
      .eq("project_id", projectId)
      .order("planned_date"),
    supabase.rpc("project_monthly_actuals", { p_project: projectId }),
    canManage
      ? supabase.from("client_contracts").select("id, title, status").eq("organization_id", ctx.organization.id).is("archived_at", null).order("title")
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [report, budgets, costs, forecasts, revenue, monthly, contracts]) {
    if (r.error) throw new Error(`Failed to load project finances: ${r.error.message}`);
  }
  const row = report.data?.[0];
  return {
    financials: row ? computeFinancials(toRow(row)) : null,
    budgets: budgets.data ?? [],
    costs: costs.data ?? [],
    forecasts: forecasts.data ?? [],
    revenue: revenue.data ?? [],
    monthly: (monthly.data ?? []).map((m) => ({ month: m.month, labour: num(m.labour), other: num(m.other), hours: num(m.hours) })),
    contracts: (contracts.data ?? []).map((c) => ({ value: c.id, label: c.title })),
  };
}
export type ProjectFinance = Awaited<ReturnType<typeof getProjectFinance>>;

/** Rates are for finance.manage only; the policies return nothing to anyone else. */
export async function getRates(ctx: OrgContext) {
  const supabase = await createSupabaseServerClient();
  const [lines, overrides, members] = await Promise.all([
    supabase.from("rate_card_lines").select("id, role_title, cost_rate, bill_rate, effective_from").eq("organization_id", ctx.organization.id).order("role_title").order("effective_from", { ascending: false }),
    supabase
      .from("member_cost_rates")
      .select("id, membership_id, cost_rate, effective_from, member:organization_memberships!member_cost_rates_membership_id_organization_id_fkey(user_profiles(display_name))")
      .eq("organization_id", ctx.organization.id)
      .order("effective_from", { ascending: false }),
    listMemberOptions(ctx),
  ]);
  if (lines.error) throw new Error(`Failed to load rates: ${lines.error.message}`);
  if (overrides.error) throw new Error(`Failed to load member rates: ${overrides.error.message}`);

  const norm = (s: string | null) => (s ?? "").trim().toLowerCase();
  const titles = new Set((lines.data ?? []).map((l) => norm(l.role_title)));
  const withOwnRate = new Set((overrides.data ?? []).map((o) => o.membership_id));
  return {
    lines: (lines.data ?? []).map((l) => ({ ...l, cost_rate: Number(l.cost_rate), bill_rate: numOrNull(l.bill_rate) })),
    overrides: (overrides.data ?? []).map((o) => ({ ...o, cost_rate: Number(o.cost_rate) })),
    members: members.map((m) => ({ value: m.id, label: m.jobTitle ? `${m.displayName} — ${m.jobTitle}` : m.displayName })),
    /** People who would be unrated today: no rate of their own and no card line for their job title. */
    unrated: members.filter((m) => !withOwnRate.has(m.id) && !titles.has(norm(m.jobTitle))).map((m) => ({ id: m.id, name: m.displayName, jobTitle: m.jobTitle })),
  };
}
export type RatesData = Awaited<ReturnType<typeof getRates>>;

export async function listContractValues(clientId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("contract_values")
    .select("contract_id, total_value, billing_model, notes, contract:client_contracts!inner(client_id)")
    .eq("contract.client_id", clientId);
  if (error) throw new Error(`Failed to load contract values: ${error.message}`);
  return new Map((data ?? []).map((v) => [v.contract_id, { totalValue: Number(v.total_value), billingModel: v.billing_model, notes: v.notes }]));
}
