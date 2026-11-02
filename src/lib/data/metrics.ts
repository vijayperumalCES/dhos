import "server-only";

import { addDaysToDate } from "@/lib/domain/time";
import { parseMetricValues, type MetricValue } from "@/lib/domain/delivery-metrics";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Every metric for a period (weeks combined as the catalogue says), with where each value came from. */
export async function getPeriodMetrics(projectId: string, from: string, to: string): Promise<MetricValue[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("project_metrics", { p_project: projectId, p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  return parseMetricValues(data);
}

/** One week: the combined values plus what was typed in, so the form can show automatic values as hints. */
export async function getWeek(projectId: string, week: string) {
  const supabase = await createSupabaseServerClient();
  const [values, entries] = await Promise.all([
    getPeriodMetrics(projectId, week, addDaysToDate(week, 6)),
    supabase.from("project_metric_entries").select("metric_key, value").eq("project_id", projectId).eq("period_start", week),
  ]);
  if (entries.error) throw new Error(entries.error.message);
  return { values, manual: Object.fromEntries((entries.data ?? []).map((e) => [e.metric_key, Number(e.value)])) as Record<string, number> };
}

export async function getReportSettings(projectId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("project_report_settings").select("weekly_enabled, monthly_enabled, recipients").eq("project_id", projectId).maybeSingle();
  if (error) throw new Error(error.message);
  return { weekly: data?.weekly_enabled ?? false, monthly: data?.monthly_enabled ?? false, recipients: data?.recipients ?? [] };
}

export async function listReportRuns(projectId: string, limit = 12) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("metric_report_runs")
    .select("id, kind, period_start, period_end, status, recipients, delivered_to, attempts, last_error, created_at, sent_at")
    .eq("project_id", projectId)
    .order("period_start", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Whether the signed-in person may enter values for the project (publishers and assigned members). */
export async function canEnterMetrics(projectId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("can_enter_metrics", { p_project: projectId });
  if (error) throw new Error(error.message);
  return data === true;
}
