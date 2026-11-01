"use server";

import { revalidatePath } from "next/cache";

import { PROVIDER_CONFIG_HINT, externalUrl, initialMockStatus, type Provider } from "@/lib/automation/adapters";
import { runTick, syncConnection } from "@/lib/automation/dispatcher";
import { summarizeEvent } from "@/lib/automation/events";
import { defaultDeps } from "@/lib/automation/runtime";
import { dryRun } from "@/lib/automation/rules";
import { requireOrgContext } from "@/lib/auth/org-context";
import { recentEventsForDryRun } from "@/lib/data/automation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { connectionSchema, jobSchema, linkSchema, preferencesSchema, ruleFormSchema, ruleFormToDefinition, webhookEventTypes, webhookSchema } from "@/lib/validation/automation";
import { uuid } from "@/lib/validation/common";

import { fail, fromPostgrestError, fromZodError, ok, type ActionResult } from "./result";

const NO_MANAGE = "You don't have permission to manage automation.";

function revalidateAutomation() {
  revalidatePath("/automation", "layout");
  revalidatePath("/integrations", "layout");
}

async function manage() {
  const ctx = await requireOrgContext();
  return ctx.permissions.has("automation.manage") ? ctx : null;
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------
export async function createWebhook(input: unknown): Promise<ActionResult<{ id: string; secret: string }>> {
  const ctx = await manage();
  if (!ctx) return fail(NO_MANAGE);
  const parsed = webhookSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;
  if (!v.allEvents && v.eventTypes.length === 0) return fail("Please correct the highlighted fields.", { eventTypes: ["Choose at least one event."] });

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_webhook_endpoint", { p_org: ctx.organization.id, p_name: v.name, p_url: v.url, p_format: v.format, p_event_types: webhookEventTypes(v) });
  if (error) return fromPostgrestError(error);
  revalidateAutomation();
  const created = data as { id: string; secret: string };
  return ok({ id: created.id, secret: created.secret }, "Webhook created.");
}

export async function updateWebhook(id: string, input: unknown): Promise<ActionResult> {
  const ctx = await manage();
  if (!ctx) return fail(NO_MANAGE);
  if (!uuid.safeParse(id).success) return fail("Invalid request.");
  const parsed = webhookSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;
  if (!v.allEvents && v.eventTypes.length === 0) return fail("Please correct the highlighted fields.", { eventTypes: ["Choose at least one event."] });
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase.from("webhook_endpoints").update({ name: v.name, url: v.url, format: v.format, event_types: webhookEventTypes(v) }, { count: "exact" }).eq("id", id).eq("organization_id", ctx.organization.id);
  if (error) return fromPostgrestError(error);
  if (!count) return fail("The webhook was not found.");
  revalidateAutomation();
  return ok(undefined, "Webhook saved.");
}

export async function setWebhookEnabled(id: string, enabled: boolean): Promise<ActionResult> {
  const ctx = await manage();
  if (!ctx) return fail(NO_MANAGE);
  if (!uuid.safeParse(id).success) return fail("Invalid request.");
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase.from("webhook_endpoints").update({ enabled }, { count: "exact" }).eq("id", id).eq("organization_id", ctx.organization.id);
  if (error) return fromPostgrestError(error);
  if (!count) return fail("The webhook was not found.");
  revalidateAutomation();
  return ok(undefined, enabled ? "Webhook enabled." : "Webhook disabled.");
}

export async function deleteWebhook(id: string): Promise<ActionResult> {
  const ctx = await manage();
  if (!ctx) return fail(NO_MANAGE);
  if (!uuid.safeParse(id).success) return fail("Invalid request.");
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase.from("webhook_endpoints").delete({ count: "exact" }).eq("id", id).eq("organization_id", ctx.organization.id);
  if (error) return fromPostgrestError(error);
  if (!count) return fail("The webhook was not found.");
  revalidateAutomation();
  return ok(undefined, "Webhook deleted.");
}

export async function rotateWebhookSecret(id: string): Promise<ActionResult<{ secret: string }>> {
  const ctx = await manage();
  if (!ctx) return fail(NO_MANAGE);
  if (!uuid.safeParse(id).success) return fail("Invalid request.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("rotate_webhook_secret", { p_endpoint: id });
  if (error) return fromPostgrestError(error);
  return ok({ secret: data as string }, "Secret rotated. The old one stops working now.");
}

export async function redeliverWebhook(deliveryId: string): Promise<ActionResult> {
  const ctx = await manage();
  if (!ctx) return fail(NO_MANAGE);
  if (!uuid.safeParse(deliveryId).success) return fail("Invalid request.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("redeliver_webhook", { p_delivery: deliveryId });
  if (error) return fromPostgrestError(error);
  revalidateAutomation();
  return ok(undefined, "Queued for another attempt.");
}

// ---------------------------------------------------------------------------
// Workflow rules
// ---------------------------------------------------------------------------
/** The rule's references (webhook, person) must exist in this organization, as seen by the editor. */
async function checkRuleReferences(orgId: string, actions: { type: string; endpointId?: string; membershipId?: string }[]): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  for (const a of actions) {
    if (a.type === "webhook" && a.endpointId) {
      const { data } = await supabase.from("webhook_endpoints").select("id").eq("id", a.endpointId).eq("organization_id", orgId).maybeSingle();
      if (!data) return "That webhook doesn't exist.";
    }
    if (a.type === "notify" && a.membershipId) {
      const { data } = await supabase.from("organization_memberships").select("id").eq("id", a.membershipId).eq("organization_id", orgId).eq("status", "active").maybeSingle();
      if (!data) return "That person isn't an active member.";
    }
  }
  return null;
}

export async function saveRule(id: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await manage();
  if (!ctx) return fail(NO_MANAGE);
  if (id !== null && !uuid.safeParse(id).success) return fail("Invalid request.");
  const parsed = ruleFormSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const def = ruleFormToDefinition(parsed.data);
  if (!def.success) return fromZodError(def.error);
  const refError = await checkRuleReferences(ctx.organization.id, def.data.actions);
  if (refError) return fail(refError);

  const supabase = await createSupabaseServerClient();
  const row = { name: parsed.data.name, description: parsed.data.description, trigger_event: def.data.triggerEvent, conditions: def.data.conditions as never, actions: def.data.actions as never };
  if (id === null) {
    const { data, error } = await supabase.from("workflow_rules").insert({ organization_id: ctx.organization.id, ...row, enabled: false }).select("id").single();
    if (error) return fromPostgrestError(error);
    revalidateAutomation();
    return ok({ id: data.id }, "Rule created. It is off until you enable it.");
  }
  const { error, count } = await supabase.from("workflow_rules").update(row, { count: "exact" }).eq("id", id).eq("organization_id", ctx.organization.id);
  if (error) return fromPostgrestError(error);
  if (!count) return fail("The rule was not found.");
  revalidateAutomation();
  return ok({ id }, "Rule saved.");
}

export async function setRuleEnabled(id: string, enabled: boolean): Promise<ActionResult> {
  const ctx = await manage();
  if (!ctx) return fail(NO_MANAGE);
  if (!uuid.safeParse(id).success) return fail("Invalid request.");
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase.from("workflow_rules").update({ enabled }, { count: "exact" }).eq("id", id).eq("organization_id", ctx.organization.id).is("archived_at", null);
  if (error) return fromPostgrestError(error);
  if (!count) return fail("The rule was not found or is archived.");
  revalidateAutomation();
  return ok(undefined, enabled ? "Rule enabled." : "Rule disabled.");
}

export async function archiveRule(id: string, archive: boolean): Promise<ActionResult> {
  const ctx = await manage();
  if (!ctx) return fail(NO_MANAGE);
  if (!uuid.safeParse(id).success) return fail("Invalid request.");
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase
    .from("workflow_rules")
    .update({ archived_at: archive ? new Date().toISOString() : null, ...(archive ? { enabled: false } : {}) }, { count: "exact" })
    .eq("id", id)
    .eq("organization_id", ctx.organization.id);
  if (error) return fromPostgrestError(error);
  if (!count) return fail("The rule was not found.");
  revalidateAutomation();
  return ok(undefined, archive ? "Rule archived." : "Rule restored (still off).");
}

export type DryRunResult = { considered: number; matched: { id: string; createdAt: string; summary: string }[] };

/** Evaluates the draft against recent events the person can read. Sends and records nothing. */
export async function dryRunRule(input: unknown): Promise<ActionResult<DryRunResult>> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("automation.read")) return fail("You don't have permission to see automation.");
  const parsed = ruleFormSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const def = ruleFormToDefinition(parsed.data);
  if (!def.success) return fromZodError(def.error);
  const events = await recentEventsForDryRun(ctx, def.data.triggerEvent);
  const r = dryRun(def.data, events);
  return ok({
    considered: r.considered,
    matched: r.matched.slice(0, 10).map((e) => ({ id: e.id, createdAt: e.createdAt, summary: summarizeEvent(e.eventType, e.payload) })),
  });
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------
export async function updateJob(id: string, input: unknown): Promise<ActionResult> {
  const ctx = await manage();
  if (!ctx) return fail(NO_MANAGE);
  if (!uuid.safeParse(id).success) return fail("Invalid request.");
  const parsed = jobSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase.from("scheduled_jobs").update({ enabled: parsed.data.enabled, interval_minutes: parsed.data.intervalMinutes }, { count: "exact" }).eq("id", id).eq("organization_id", ctx.organization.id);
  if (error) return fromPostgrestError(error);
  if (!count) return fail("The job was not found.");
  revalidateAutomation();
  return ok(undefined, "Job saved.");
}

export async function runJobNow(id: string): Promise<ActionResult> {
  const ctx = await manage();
  if (!ctx) return fail(NO_MANAGE);
  if (!uuid.safeParse(id).success) return fail("Invalid request.");
  const supabase = await createSupabaseServerClient();
  const { data: job, error: jErr } = await supabase.from("scheduled_jobs").select("id, key").eq("id", id).eq("organization_id", ctx.organization.id).maybeSingle();
  if (jErr) return fromPostgrestError(jErr);
  if (!job) return fail("The job was not found.");

  if (job.key === "integration_sync") {
    const db = createSupabaseServiceClient();
    if (!db) return fail("The scheduler is not configured on this server (SUPABASE_SECRET_KEY is missing).");
    const { data: conns } = await supabase.from("integration_connections").select("id, provider, mode").eq("organization_id", ctx.organization.id).eq("enabled", true);
    let failed: string | null = null;
    const total = { connections: 0, links: 0, changed: 0 };
    for (const c of conns ?? []) {
      const r = await syncConnection(db, c, {});
      total.connections++;
      total.links += r.summary.links;
      total.changed += r.summary.changed;
      if (!r.ok) failed ??= r.error;
    }
    await db.rpc("record_job_result", { p_job: job.id, p_status: failed ? "failed" : "succeeded", p_summary: total as never, p_error: failed ?? (null as never) });
    revalidateAutomation();
    return failed ? fail(`Sync finished with an error: ${failed}`) : ok(undefined, `Synced ${total.links} link(s) on ${total.connections} connection(s).`);
  }

  const { data, error } = await supabase.rpc("run_job_now", { p_job: id });
  if (error) return fromPostgrestError(error);
  revalidateAutomation();
  const out = data as { error?: string } | null;
  return out?.error ? fail("The job failed. See the run log.") : ok(undefined, "Job ran.");
}

/** One full worker pass on demand: what the cron endpoint does, for local use and "why is nothing happening?". */
export async function runSchedulerNow(): Promise<ActionResult<{ summary: string }>> {
  const ctx = await manage();
  if (!ctx) return fail(NO_MANAGE);
  const db = createSupabaseServiceClient();
  if (!db) return fail("The scheduler is not configured on this server (SUPABASE_SECRET_KEY is missing).");
  const s = await runTick(db, defaultDeps());
  revalidatePath("/", "layout");
  const summary = `${s.events.processed} event(s), ${s.events.notifications} notification(s), ${s.webhooks.attempted} webhook attempt(s), ${s.emails.attempted} email(s), ${s.jobs.run} job(s).`;
  return s.errors.length ? fail(`The worker hit errors: ${s.errors.join("; ")}`) : ok({ summary }, `Processed ${summary}`);
}

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------
export async function createConnection(input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await manage();
  if (!ctx) return fail(NO_MANAGE);
  const parsed = connectionSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;
  const config = v.target ? { [PROVIDER_CONFIG_HINT[v.provider].field]: v.target } : {};
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("integration_connections").insert({ organization_id: ctx.organization.id, provider: v.provider, name: v.name, mode: "mock", config }).select("id").single();
  if (error) return fromPostgrestError(error, { duplicate: "A connection with that name already exists." });
  revalidateAutomation();
  return ok({ id: data.id }, "Connection added (mock adapter).");
}

export async function setConnectionEnabled(id: string, enabled: boolean): Promise<ActionResult> {
  const ctx = await manage();
  if (!ctx) return fail(NO_MANAGE);
  if (!uuid.safeParse(id).success) return fail("Invalid request.");
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase.from("integration_connections").update({ enabled }, { count: "exact" }).eq("id", id).eq("organization_id", ctx.organization.id);
  if (error) return fromPostgrestError(error);
  if (!count) return fail("The connection was not found.");
  revalidateAutomation();
  return ok(undefined, enabled ? "Connection enabled." : "Connection paused.");
}

export async function deleteConnection(id: string): Promise<ActionResult> {
  const ctx = await manage();
  if (!ctx) return fail(NO_MANAGE);
  if (!uuid.safeParse(id).success) return fail("Invalid request.");
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase.from("integration_connections").delete({ count: "exact" }).eq("id", id).eq("organization_id", ctx.organization.id);
  if (error) return fromPostgrestError(error);
  if (!count) return fail("The connection was not found.");
  revalidateAutomation();
  return ok(undefined, "Connection removed along with its links.");
}

export async function linkWorkItem(connectionId: string, input: unknown): Promise<ActionResult> {
  const ctx = await manage();
  if (!ctx) return fail(NO_MANAGE);
  if (!uuid.safeParse(connectionId).success) return fail("Invalid request.");
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createSupabaseServerClient();

  const { data: conn, error: cErr } = await supabase.from("integration_connections").select("id, provider, config").eq("id", connectionId).eq("organization_id", ctx.organization.id).maybeSingle();
  if (cErr) return fromPostgrestError(cErr);
  if (!conn) return fail("The connection was not found.");
  const { data: item, error: iErr } = await supabase.from("work_items").select("id").eq("organization_id", ctx.organization.id).eq("key", parsed.data.workItemKey).maybeSingle();
  if (iErr) return fromPostgrestError(iErr);
  if (!item) return fail("Please correct the highlighted fields.", { workItemKey: ["No work item with that key, or you can't see it."] });

  const provider = conn.provider as Provider;
  const { error } = await supabase.from("integration_links").insert({
    organization_id: ctx.organization.id,
    connection_id: conn.id,
    work_item_id: item.id,
    external_id: parsed.data.externalId,
    external_url: externalUrl(provider, (conn.config ?? {}) as Record<string, unknown>, parsed.data.externalId),
    external_status: initialMockStatus(provider),
  });
  if (error) return fromPostgrestError(error, { duplicate: "That work item or external issue is already linked on this connection." });
  revalidateAutomation();
  return ok(undefined, "Linked.");
}

export async function unlinkWorkItem(linkId: string): Promise<ActionResult> {
  const ctx = await manage();
  if (!ctx) return fail(NO_MANAGE);
  if (!uuid.safeParse(linkId).success) return fail("Invalid request.");
  const supabase = await createSupabaseServerClient();
  const { error, count } = await supabase.from("integration_links").delete({ count: "exact" }).eq("id", linkId).eq("organization_id", ctx.organization.id);
  if (error) return fromPostgrestError(error);
  if (!count) return fail("The link was not found.");
  revalidateAutomation();
  return ok(undefined, "Unlinked.");
}

export async function syncConnectionNow(connectionId: string): Promise<ActionResult> {
  const ctx = await manage();
  if (!ctx) return fail(NO_MANAGE);
  if (!uuid.safeParse(connectionId).success) return fail("Invalid request.");
  const supabase = await createSupabaseServerClient();
  const { data: conn, error } = await supabase.from("integration_connections").select("id, provider, mode").eq("id", connectionId).eq("organization_id", ctx.organization.id).maybeSingle();
  if (error) return fromPostgrestError(error);
  if (!conn) return fail("The connection was not found.");
  const db = createSupabaseServiceClient();
  if (!db) return fail("The sync worker is not configured on this server (SUPABASE_SECRET_KEY is missing).");
  const r = await syncConnection(db, conn, {});
  revalidateAutomation();
  return r.ok ? ok(undefined, `Synced ${r.summary.links} link(s); ${r.summary.changed} changed.`) : fail(`The sync failed: ${r.error}`);
}

// ---------------------------------------------------------------------------
// Notifications (any member, their own only — RLS)
// ---------------------------------------------------------------------------
export async function markNotificationRead(id: string): Promise<ActionResult> {
  await requireOrgContext();
  if (!uuid.safeParse(id).success) return fail("Invalid request.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null);
  if (error) return fromPostgrestError(error);
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("organization_id", ctx.organization.id).is("read_at", null);
  if (error) return fromPostgrestError(error);
  revalidatePath("/", "layout");
  return ok(undefined, "All caught up.");
}

export async function deleteNotification(id: string): Promise<ActionResult> {
  await requireOrgContext();
  if (!uuid.safeParse(id).success) return fail("Invalid request.");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("notifications").delete().eq("id", id);
  if (error) return fromPostgrestError(error);
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function savePreferences(input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("notification_preferences")
    .upsert(parsed.data.prefs.map((p) => ({ organization_id: ctx.organization.id, membership_id: ctx.membershipId, category: p.category, in_app: p.inApp, email: p.email })), { onConflict: "membership_id,category" });
  if (error) return fromPostgrestError(error);
  revalidatePath("/notifications");
  return ok(undefined, "Preferences saved.");
}
