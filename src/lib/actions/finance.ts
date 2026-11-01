"use server";

import { revalidatePath } from "next/cache";

import { requireOrgContext } from "@/lib/auth/org-context";
import { firstOfMonth } from "@/lib/domain/finance";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { uuid } from "@/lib/validation/common";
import {
  budgetLineSchema,
  budgetStartSchema,
  contractValueSchema,
  costEntrySchema,
  forecastSchema,
  memberRateSchema,
  rateLineSchema,
  reasonSchema,
  recogniseSchema,
  revenueLineSchema,
} from "@/lib/validation/finance";

import { fail, fromPostgrestError, fromZodError, ok, type ActionResult } from "./result";

const NO_PERMISSION = "You don't have permission to manage finances.";

function revalidateProject(projectId: string) {
  revalidatePath(`/projects/${projectId}/finance`);
  revalidatePath("/finance");
}

// ---------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------
export async function addRateLine(input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("finance.manage")) return fail(NO_PERMISSION);
  const parsed = rateLineSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("rate_card_lines")
    .insert({ organization_id: ctx.organization.id, role_title: v.roleTitle, cost_rate: v.costRate, bill_rate: v.billRate, effective_from: v.effectiveFrom });
  if (error) return fromPostgrestError(error, { duplicate: "That role already has a rate from that date." });

  revalidatePath("/finance", "layout");
  return ok(undefined, "Rate added.");
}

export async function deleteRateLine(id: string): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(id).success) return fail("Invalid request.");
  if (!ctx.permissions.has("finance.manage")) return fail(NO_PERMISSION);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("rate_card_lines").delete().eq("id", id).select("id");
  if (error) return fromPostgrestError(error);
  if (!data?.length) return fail("Only a rate that hasn't taken effect yet can be removed. Add a newer rate instead.");

  revalidatePath("/finance", "layout");
  return ok(undefined, "Rate removed.");
}

export async function addMemberRate(input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("finance.manage")) return fail(NO_PERMISSION);
  const parsed = memberRateSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("member_cost_rates")
    .insert({ organization_id: ctx.organization.id, membership_id: v.membershipId, cost_rate: v.costRate, effective_from: v.effectiveFrom });
  if (error) return fromPostgrestError(error, { duplicate: "That person already has a rate from that date." });

  revalidatePath("/finance", "layout");
  return ok(undefined, "Rate added.");
}

export async function deleteMemberRate(id: string): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(id).success) return fail("Invalid request.");
  if (!ctx.permissions.has("finance.manage")) return fail(NO_PERMISSION);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("member_cost_rates").delete().eq("id", id).select("id");
  if (error) return fromPostgrestError(error);
  if (!data?.length) return fail("Only a rate that hasn't taken effect yet can be removed. Add a newer rate instead.");

  revalidatePath("/finance", "layout");
  return ok(undefined, "Rate removed.");
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------
export async function startBudget(projectId: string, input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(projectId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("finance.manage")) return fail(NO_PERMISSION);
  const parsed = budgetStartSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("start_budget", { p_project: projectId, p_name: parsed.data.name });
  if (error) return fromPostgrestError(error);

  revalidateProject(projectId);
  return ok(undefined, "Draft budget started.");
}

export async function saveBudgetLine(projectId: string, budgetId: string, input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(budgetId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("finance.manage")) return fail(NO_PERMISSION);
  const parsed = budgetLineSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: existing, error: findError } = await supabase.from("budget_lines").select("id").eq("budget_id", budgetId).eq("category", v.category).maybeSingle();
  if (findError) return fromPostgrestError(findError);
  const { error } = existing
    ? await supabase.from("budget_lines").update({ amount: v.amount, note: v.note }).eq("id", existing.id)
    : await supabase
        .from("budget_lines")
        .insert({ organization_id: ctx.organization.id, project_id: projectId, budget_id: budgetId, category: v.category, amount: v.amount, note: v.note });
  if (error) return fromPostgrestError(error);

  revalidateProject(projectId);
  return ok(undefined, "Budget line saved.");
}

export async function removeBudgetLine(projectId: string, lineId: string): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(lineId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("finance.manage")) return fail(NO_PERMISSION);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("budget_lines").delete().eq("id", lineId).eq("project_id", projectId);
  if (error) return fromPostgrestError(error);

  revalidateProject(projectId);
  return ok(undefined, "Budget line removed.");
}

export async function discardBudget(projectId: string, budgetId: string): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(budgetId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("finance.manage")) return fail(NO_PERMISSION);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("project_budgets").delete().eq("id", budgetId).eq("project_id", projectId).eq("status", "draft").select("id");
  if (error) return fromPostgrestError(error);
  if (!data?.length) return fail("Only a draft budget can be discarded.");

  revalidateProject(projectId);
  return ok(undefined, "Draft discarded.");
}

export async function approveBudget(projectId: string, budgetId: string): Promise<ActionResult> {
  await requireOrgContext();
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(budgetId).success) return fail("Invalid request.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("approve_budget", { p_budget: budgetId });
  if (error) return fromPostgrestError(error);

  revalidateProject(projectId);
  return ok(undefined, "Budget approved as the baseline.");
}

// ---------------------------------------------------------------------------
// Ledger and forecasts
// ---------------------------------------------------------------------------
export async function addCostEntry(projectId: string, input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(projectId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("finance.manage")) return fail(NO_PERMISSION);
  const parsed = costEntrySchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("cost_entries").insert({
    organization_id: ctx.organization.id,
    project_id: projectId,
    entry_date: v.entryDate,
    category: v.category,
    amount: v.amount,
    description: v.description,
    vendor: v.vendor,
    reference: v.reference,
  });
  if (error) return fromPostgrestError(error);

  revalidateProject(projectId);
  return ok(undefined, "Cost recorded.");
}

export async function reverseCostEntry(projectId: string, entryId: string, input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(entryId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("finance.manage")) return fail(NO_PERMISSION);
  const parsed = reasonSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reverse_cost_entry", { p_entry: entryId, p_reason: parsed.data.note });
  if (error) return fromPostgrestError(error);

  revalidateProject(projectId);
  return ok(undefined, "Entry reversed.");
}

export async function saveForecast(projectId: string, input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(projectId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("finance.manage")) return fail(NO_PERMISSION);
  const parsed = forecastSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;
  const period = firstOfMonth(v.period.length === 7 ? `${v.period}-01` : v.period);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("forecast_entries")
    .upsert(
      { organization_id: ctx.organization.id, project_id: projectId, category: v.category, period, amount: v.amount, note: v.note },
      { onConflict: "project_id,category,period" },
    );
  if (error) return fromPostgrestError(error);

  revalidateProject(projectId);
  return ok(undefined, "Forecast saved.");
}

export async function deleteForecast(projectId: string, id: string): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(id).success) return fail("Invalid request.");
  if (!ctx.permissions.has("finance.manage")) return fail(NO_PERMISSION);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("forecast_entries").delete().eq("id", id).eq("project_id", projectId);
  if (error) return fromPostgrestError(error);

  revalidateProject(projectId);
  return ok(undefined, "Forecast removed.");
}

// ---------------------------------------------------------------------------
// Contract values and revenue
// ---------------------------------------------------------------------------
export async function saveContractValue(clientId: string, contractId: string, input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(clientId).success || !uuid.safeParse(contractId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("finance.manage")) return fail(NO_PERMISSION);
  const parsed = contractValueSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("contract_values")
    .upsert(
      { organization_id: ctx.organization.id, contract_id: contractId, total_value: v.totalValue, billing_model: v.billingModel, notes: v.notes },
      { onConflict: "contract_id" },
    );
  if (error) return fromPostgrestError(error);

  revalidatePath(`/clients/${clientId}`);
  return ok(undefined, "Contract value saved.");
}

export async function addRevenueLine(projectId: string, input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(projectId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("finance.manage")) return fail(NO_PERMISSION);
  const parsed = revenueLineSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("revenue_lines").insert({
    organization_id: ctx.organization.id,
    project_id: projectId,
    contract_id: v.contractId,
    description: v.description,
    planned_date: v.plannedDate,
    amount: v.amount,
  });
  if (error) return fromPostgrestError(error);

  revalidateProject(projectId);
  return ok(undefined, "Revenue planned.");
}

export async function deleteRevenueLine(projectId: string, id: string): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(id).success) return fail("Invalid request.");
  if (!ctx.permissions.has("finance.manage")) return fail(NO_PERMISSION);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("revenue_lines").delete().eq("id", id).eq("project_id", projectId).eq("status", "planned").select("id");
  if (error) return fromPostgrestError(error);
  if (!data?.length) return fail("Recognised revenue can't be removed.");

  revalidateProject(projectId);
  return ok(undefined, "Revenue line removed.");
}

export async function recogniseRevenue(projectId: string, id: string, input: unknown): Promise<ActionResult> {
  await requireOrgContext();
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(id).success) return fail("Invalid request.");
  const parsed = recogniseSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("recognise_revenue", { p_line: id, p_on: parsed.data.recognisedOn });
  if (error) return fromPostgrestError(error);

  revalidateProject(projectId);
  return ok(undefined, "Revenue recognised.");
}
