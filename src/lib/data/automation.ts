import "server-only";

import type { OrgContext } from "@/lib/auth/org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PAGE_SIZE = 25;

function check<T>(label: string, res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Failed to load ${label}: ${res.error.message}`);
  return res.data;
}

// ---------------------------------------------------------------------------
// Notifications (every member, their own only — RLS)
// ---------------------------------------------------------------------------
export async function getUnreadSummary(ctx: OrgContext) {
  const supabase = await createSupabaseServerClient();
  const [count, recent] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("organization_id", ctx.organization.id).is("read_at", null),
    supabase
      .from("notifications")
      .select("id, title, body, link, severity, occurrences, updated_at")
      .eq("organization_id", ctx.organization.id)
      .is("read_at", null)
      .order("updated_at", { ascending: false })
      .limit(5),
  ]);
  // The bell is on every page; a failure here must never take the page down.
  return { unread: count.error ? 0 : (count.count ?? 0), recent: recent.error ? [] : (recent.data ?? []) };
}

export type InboxFilter = "unread" | "all";

export async function listNotifications(ctx: OrgContext, filter: InboxFilter, page: number) {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("notifications")
    .select("id, category, type, severity, title, body, link, occurrences, email_status, created_at, updated_at, read_at", { count: "exact" })
    .eq("organization_id", ctx.organization.id)
    .order("updated_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (filter === "unread") q = q.is("read_at", null);
  const { data, count, error } = await q;
  if (error) throw new Error(`Failed to load notifications: ${error.message}`);
  return { rows: data ?? [], total: count ?? 0, pageSize: PAGE_SIZE, page };
}

export async function getPreferences(ctx: OrgContext) {
  const supabase = await createSupabaseServerClient();
  const rows = check("preferences", await supabase.from("notification_preferences").select("category, in_app, email").eq("membership_id", ctx.membershipId));
  return new Map((rows ?? []).map((r) => [r.category, r]));
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------
export async function listRules(ctx: OrgContext, includeArchived: boolean) {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("workflow_rules")
    .select("id, name, description, enabled, trigger_event, conditions, actions, version, updated_at, archived_at")
    .eq("organization_id", ctx.organization.id)
    .order("name");
  if (!includeArchived) q = q.is("archived_at", null);
  const rules = check("rules", await q) ?? [];
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const runs = check("rule runs", await supabase.from("workflow_runs").select("rule_id, status").eq("organization_id", ctx.organization.id).gte("created_at", since).limit(5000)) ?? [];
  const stats = new Map<string, { ok: number; failed: number }>();
  for (const r of runs) {
    const s = stats.get(r.rule_id) ?? { ok: 0, failed: 0 };
    if (r.status === "failed") s.failed++;
    else s.ok++;
    stats.set(r.rule_id, s);
  }
  return rules.map((r) => ({ ...r, runs30d: stats.get(r.id) ?? { ok: 0, failed: 0 } }));
}

export async function getRuleDetail(ctx: OrgContext, id: string) {
  const supabase = await createSupabaseServerClient();
  const rule = check("the rule", await supabase.from("workflow_rules").select("*").eq("organization_id", ctx.organization.id).eq("id", id).maybeSingle());
  if (!rule) return null;
  const [versions, runs] = await Promise.all([
    supabase.from("workflow_rule_versions").select("version, snapshot, created_at").eq("rule_id", id).order("version", { ascending: false }),
    supabase.from("workflow_runs").select("id, rule_version, event_id, status, detail, created_at").eq("rule_id", id).order("created_at", { ascending: false }).limit(25),
  ]);
  return { rule, versions: check("versions", versions) ?? [], runs: check("runs", runs) ?? [] };
}

/** Recent events the viewer may read, for dry runs (RLS bounds them to readable projects). */
export async function recentEventsForDryRun(ctx: OrgContext, eventType: string) {
  const supabase = await createSupabaseServerClient();
  const rows = check("events", await supabase.from("outbox_events").select("id, event_type, created_at, payload").eq("organization_id", ctx.organization.id).eq("event_type", eventType).order("created_at", { ascending: false }).limit(50));
  return (rows ?? []).map((e) => ({ id: e.id, eventType: e.event_type, createdAt: e.created_at, payload: (e.payload ?? {}) as Record<string, unknown> }));
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------
export async function listWebhooks(ctx: OrgContext) {
  const supabase = await createSupabaseServerClient();
  const endpoints = check(
    "webhooks",
    await supabase.from("webhook_endpoints").select("id, name, url, format, event_types, enabled, consecutive_failures, disabled_reason, last_success_at, created_at").eq("organization_id", ctx.organization.id).order("name"),
  ) ?? [];
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const deliveries = check("deliveries", await supabase.from("webhook_deliveries").select("endpoint_id, status").eq("organization_id", ctx.organization.id).gte("created_at", since).limit(5000)) ?? [];
  const stats = new Map<string, { succeeded: number; pending: number; dead: number }>();
  for (const d of deliveries) {
    const s = stats.get(d.endpoint_id) ?? { succeeded: 0, pending: 0, dead: 0 };
    s[d.status]++;
    stats.set(d.endpoint_id, s);
  }
  return endpoints.map((e) => ({ ...e, week: stats.get(e.id) ?? { succeeded: 0, pending: 0, dead: 0 } }));
}

export async function listDeliveries(ctx: OrgContext, opts: { endpointId?: string; status?: string; page: number }) {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("webhook_deliveries")
    .select("id, endpoint_id, event_type, status, attempts, next_attempt_at, response_status, error, created_at, delivered_at, endpoint:webhook_endpoints!webhook_deliveries_endpoint_id_organization_id_fkey(name)", { count: "exact" })
    .eq("organization_id", ctx.organization.id)
    .order("created_at", { ascending: false })
    .range((opts.page - 1) * PAGE_SIZE, opts.page * PAGE_SIZE - 1);
  if (opts.endpointId) q = q.eq("endpoint_id", opts.endpointId);
  if (opts.status === "pending" || opts.status === "succeeded" || opts.status === "dead") q = q.eq("status", opts.status);
  const { data, count, error } = await q;
  if (error) throw new Error(`Failed to load deliveries: ${error.message}`);
  return { rows: data ?? [], total: count ?? 0, pageSize: PAGE_SIZE, page: opts.page };
}

export async function webhookOptions(ctx: OrgContext) {
  const supabase = await createSupabaseServerClient();
  const rows = check("webhooks", await supabase.from("webhook_endpoints").select("id, name, enabled").eq("organization_id", ctx.organization.id).order("name")) ?? [];
  return rows.map((r) => ({ value: r.id, label: r.enabled ? r.name : `${r.name} (disabled)` }));
}

// ---------------------------------------------------------------------------
// Events, scheduler
// ---------------------------------------------------------------------------
export async function listEvents(ctx: OrgContext, opts: { type?: string; page: number }) {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("outbox_events")
    .select("id, event_type, entity_type, entity_id, project_id, payload, created_at, processed_at, attempts, error", { count: "exact" })
    .eq("organization_id", ctx.organization.id)
    .order("created_at", { ascending: false })
    .range((opts.page - 1) * PAGE_SIZE, opts.page * PAGE_SIZE - 1);
  if (opts.type) q = q.eq("event_type", opts.type);
  const { data, count, error } = await q;
  if (error) throw new Error(`Failed to load events: ${error.message}`);
  const pending = await supabase.from("outbox_events").select("id", { count: "exact", head: true }).eq("organization_id", ctx.organization.id).is("processed_at", null);
  return { rows: data ?? [], total: count ?? 0, pending: pending.count ?? 0, pageSize: PAGE_SIZE, page: opts.page };
}

export async function getScheduler(ctx: OrgContext) {
  const supabase = await createSupabaseServerClient();
  const [jobs, runs, beat] = await Promise.all([
    supabase.from("scheduled_jobs").select("id, key, enabled, interval_minutes, config, next_run_at, last_run_at, last_status, last_error").eq("organization_id", ctx.organization.id).order("key"),
    supabase.from("job_runs").select("id, job_key, status, summary, error, created_at").eq("organization_id", ctx.organization.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("scheduler_heartbeat").select("last_tick_at, summary").maybeSingle(),
  ]);
  const heartbeat = check("the heartbeat", beat);
  const stale = !heartbeat || Date.now() - new Date(heartbeat.last_tick_at).getTime() > 15 * 60_000;
  return { jobs: check("jobs", jobs) ?? [], runs: check("job runs", runs) ?? [], heartbeat, stale };
}

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------
export async function listConnections(ctx: OrgContext) {
  const supabase = await createSupabaseServerClient();
  const [conns, links] = await Promise.all([
    supabase.from("integration_connections").select("id, provider, name, mode, config, enabled, health, last_sync_at, last_error").eq("organization_id", ctx.organization.id).order("name"),
    supabase.from("integration_links").select("connection_id").eq("organization_id", ctx.organization.id),
  ]);
  const counts = new Map<string, number>();
  for (const l of check("links", links) ?? []) counts.set(l.connection_id, (counts.get(l.connection_id) ?? 0) + 1);
  return (check("connections", conns) ?? []).map((c) => ({ ...c, linkCount: counts.get(c.id) ?? 0 }));
}

export async function getConnectionDetail(ctx: OrgContext, id: string) {
  const supabase = await createSupabaseServerClient();
  const conn = check("the connection", await supabase.from("integration_connections").select("*").eq("organization_id", ctx.organization.id).eq("id", id).maybeSingle());
  if (!conn) return null;
  const [links, runs] = await Promise.all([
    supabase
      .from("integration_links")
      .select("id, external_id, external_url, external_status, last_synced_at, created_at, work_item:work_items!integration_links_work_item_id_organization_id_fkey(key, title, project_id)")
      .eq("connection_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("integration_sync_runs").select("id, status, summary, error, created_at").eq("connection_id", id).order("created_at", { ascending: false }).limit(10),
  ]);
  return { conn, links: check("links", links) ?? [], runs: check("sync runs", runs) ?? [] };
}

/** Role options for rule recipients, from the organization's own roles. */
export async function roleOptions(ctx: OrgContext) {
  const supabase = await createSupabaseServerClient();
  const rows = check("roles", await supabase.from("role_definitions").select("key, name").eq("organization_id", ctx.organization.id).order("name")) ?? [];
  return rows.map((r) => ({ value: r.key, label: r.name }));
}
