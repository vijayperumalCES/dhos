"use server";

import { revalidatePath } from "next/cache";

import { requireOrgContext } from "@/lib/auth/org-context";
import { buildReportMetrics } from "@/lib/data/status-report";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { statusReportSchema } from "@/lib/validation/work";

import { fail, fromPostgrestError, fromZodError, ok, type ActionResult } from "./result";

/** Publishes an immutable status report: narrative from the author, metrics from the system. */
export async function publishStatusReport(input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("project.change_status")) return fail("You don't have permission to publish status reports.");
  const parsed = statusReportSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;

  const metrics = await buildReportMetrics(ctx, v.projectId, v.periodStart, v.periodEnd);
  if (!metrics.project) return fail("The project was not found.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("project_status_reports").insert({
    organization_id: ctx.organization.id,
    project_id: v.projectId,
    period_start: v.periodStart,
    period_end: v.periodEnd,
    health: metrics.project.health,
    summary: v.summary,
    highlights: v.highlights,
    next_steps: v.nextSteps,
    decisions_needed: v.decisionsNeeded,
    metrics,
  });
  if (error) return fromPostgrestError(error);

  revalidatePath(`/projects/${v.projectId}/reports`);
  return ok(undefined, "Status report published.");
}
