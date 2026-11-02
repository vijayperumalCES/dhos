"use server";

import { revalidatePath } from "next/cache";

import { requireOrgContext } from "@/lib/auth/org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { metricEntriesSchema, reportSettingsSchema } from "@/lib/validation/metrics";

import { fail, fromPostgrestError, fromZodError, ok, type ActionResult } from "./result";

const NO_PERMISSION = "You don't have permission to change report settings for this project.";

/**
 * Saves metric values for one week. Only the metrics sent are touched, and a blank clears one. The database
 * decides who may enter: people who publish for the project and everyone assigned to it.
 */
export async function saveMetricEntries(input: unknown): Promise<ActionResult> {
  await requireOrgContext();
  const parsed = metricEntriesSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const { projectId, week, values } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_metric_entries", { p_project: projectId, p_week: week, p_entries: values });
  if (error) return fromPostgrestError(error);
  revalidatePath(`/projects/${projectId}/metrics`);
  return ok(undefined, "Metrics saved.");
}

/** Who gets the weekly and monthly report email for a project. */
export async function saveReportSettings(input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("project.change_status")) return fail(NO_PERMISSION);
  const parsed = reportSettingsSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const { projectId, weekly, monthly, recipients } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_report_settings", { p_project: projectId, p_weekly: weekly, p_monthly: monthly, p_recipients: recipients });
  if (error) return fromPostgrestError(error);
  revalidatePath(`/projects/${projectId}/metrics`);
  return ok(undefined, "Report settings saved.");
}
