import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

import { resolveAdapter } from "./adapters";
import { composeReportEmail, parseMetricValues } from "@/lib/domain/delivery-metrics";

import { composeEmail, type EmailProvider } from "./email";
import { evaluateConditions, parseConditions } from "./rules";
import { sendWebhook, type Delivery, type SendDeps } from "./webhook";

type Db = SupabaseClient<Database>;

export type Deps = {
  email: EmailProvider;
  send: SendDeps;
  siteUrl: string;
  now?: () => Date;
};

export type TickSummary = {
  events: { claimed: number; processed: number; failed: number; rulesApplied: number; notifications: number; deliveriesQueued: number };
  webhooks: { attempted: number; succeeded: number; failed: number };
  emails: { attempted: number; sent: number; simulated: number; failed: number };
  reports: { attempted: number; sent: number; simulated: number; failed: number };
  jobs: { run: number; failed: number };
  errors: string[];
};

const LIMITS = { events: 100, webhooks: 50, emails: 50, reports: 20, jobs: 25 };

function emptySummary(): TickSummary {
  return {
    events: { claimed: 0, processed: 0, failed: 0, rulesApplied: 0, notifications: 0, deliveriesQueued: 0 },
    webhooks: { attempted: 0, succeeded: 0, failed: 0 },
    emails: { attempted: 0, sent: 0, simulated: 0, failed: 0 },
    reports: { attempted: 0, sent: 0, simulated: 0, failed: 0 },
    jobs: { run: 0, failed: 0 },
    errors: [],
  };
}

/**
 * One pass of the background worker: events → rules and notifications, webhook deliveries, email,
 * due jobs. Each stage is isolated so a failure in one does not starve the others, and every
 * database step is idempotent so a crashed or overlapping run is harmless.
 */
export async function runTick(db: Db, deps: Deps): Promise<TickSummary> {
  const summary = emptySummary();
  const stages: [string, () => Promise<void>][] = [
    ["events", () => processEvents(db, summary)],
    ["webhooks", () => deliverWebhooks(db, deps, summary)],
    ["emails", () => deliverEmails(db, deps, summary)],
    ["reports", () => deliverReports(db, deps, summary)],
    ["jobs", () => runDueJobs(db, deps, summary)],
  ];
  for (const [name, stage] of stages) {
    try {
      await stage();
    } catch (e) {
      summary.errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300));
    }
  }
  await db.rpc("record_heartbeat", { p_summary: summary as never });
  return summary;
}

async function processEvents(db: Db, s: TickSummary) {
  const { data: events, error } = await db.rpc("claim_outbox_events", { p_limit: LIMITS.events });
  if (error) throw new Error(error.message);
  s.events.claimed = events?.length ?? 0;

  for (const event of events ?? []) {
    try {
      const { data: candidates, error: cErr } = await db.rpc("rule_candidates", { p_event: event.id });
      if (cErr) throw new Error(cErr.message);
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      for (const c of candidates ?? []) {
        const conditions = parseConditions(c.conditions);
        if (!conditions || !evaluateConditions(conditions, payload)) continue;
        const { data: applied, error: aErr } = await db.rpc("apply_workflow_rule", { p_event: event.id, p_rule: c.rule_id });
        if (aErr) throw new Error(aErr.message);
        if ((applied as { applied?: boolean } | null)?.applied) s.events.rulesApplied++;
      }
      const { data: out, error: fErr } = await db.rpc("fan_out_event", { p_event: event.id });
      if (fErr) throw new Error(fErr.message);
      const r = (out ?? {}) as { notifications?: number; deliveries?: number };
      s.events.notifications += r.notifications ?? 0;
      s.events.deliveriesQueued += r.deliveries ?? 0;
      s.events.processed++;
    } catch (e) {
      s.events.failed++;
      await db.rpc("fail_outbox_event", { p_event: event.id, p_error: e instanceof Error ? e.message : "failed" });
    }
  }
}

async function deliverWebhooks(db: Db, deps: Deps, s: TickSummary) {
  const { data, error } = await db.rpc("claim_webhook_deliveries", { p_limit: LIMITS.webhooks });
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as Delivery[]) {
    s.webhooks.attempted++;
    const result = await sendWebhook(row, deps.send);
    if (result.error === null) s.webhooks.succeeded++;
    else s.webhooks.failed++;
    await db.rpc("complete_webhook_delivery", { p_delivery: row.id, p_status: result.status ?? 0, p_error: result.error ?? (null as never) });
  }
}

async function deliverEmails(db: Db, deps: Deps, s: TickSummary) {
  const { data, error } = await db.rpc("claim_pending_emails", { p_limit: LIMITS.emails });
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    s.emails.attempted++;
    let outcome: "sent" | "simulated" | "error";
    try {
      outcome = await deps.email.send(composeEmail(row, deps.siteUrl));
    } catch {
      outcome = "error";
    }
    if (outcome === "error") s.emails.failed++;
    else s.emails[outcome]++;
    await db.rpc("complete_notification_email", { p_id: row.id, p_status: outcome });
  }
}

/**
 * Emails each pending delivery-metrics report to its recipients. A recipient who already has it is
 * skipped, so a retry after a partial failure never sends twice.
 */
async function deliverReports(db: Db, deps: Deps, s: TickSummary) {
  const { data, error } = await db.rpc("claim_pending_reports", { p_limit: LIMITS.reports });
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    s.reports.attempted++;
    const metrics = parseMetricValues((row.payload as { metrics?: unknown } | null)?.metrics);
    const delivered: string[] = [];
    let outcome: "sent" | "simulated" = "simulated";
    let failure: string | null = null;
    for (const to of row.recipients.filter((r) => !row.delivered_to.includes(r))) {
      try {
        const message = composeReportEmail(
          {
            organizationName: row.organization_name,
            projectId: row.project_id,
            projectCode: row.project_code,
            projectName: row.project_name,
            kind: row.kind === "monthly" ? "monthly" : "weekly",
            periodStart: row.period_start,
            periodEnd: row.period_end,
            metrics,
            siteUrl: deps.siteUrl,
          },
          to,
        );
        if ((await deps.email.send(message)) === "sent") outcome = "sent";
        delivered.push(to);
      } catch (e) {
        failure = (e instanceof Error ? e.message : "send failed").slice(0, 300);
      }
    }
    if (failure === null) s.reports[outcome]++;
    else s.reports.failed++;
    await db.rpc("complete_report_run", { p_id: row.id, p_delivered: delivered, p_outcome: outcome, p_error: failure as never });
  }
}

async function runDueJobs(db: Db, deps: Deps, s: TickSummary) {
  const { data, error } = await db.rpc("claim_due_jobs", { p_limit: LIMITS.jobs });
  if (error) throw new Error(error.message);
  for (const job of data ?? []) {
    s.jobs.run++;
    if (job.key === "integration_sync") {
      const r = await syncOrganizationConnections(db, job.organization_id, deps);
      if (!r.ok) s.jobs.failed++;
      await db.rpc("record_job_result", {
        p_job: job.id,
        p_status: r.ok ? "succeeded" : "failed",
        p_summary: r.summary as never,
        p_error: r.ok ? (null as never) : r.error,
      });
    } else {
      const { data: out, error: jErr } = await db.rpc("run_scheduled_job", { p_job: job.id });
      if (jErr || (out as { error?: string } | null)?.error) s.jobs.failed++;
    }
  }
}

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------
export type SyncSummary = { connections: number; links: number; changed: number };

/** Syncs one connection through its adapter. Records the run and the connection's health. */
export async function syncConnection(db: Db, connection: { id: string; provider: string; mode: string }, deps: Pick<Deps, "now">): Promise<{ ok: true; summary: SyncSummary } | { ok: false; error: string; summary: SyncSummary }> {
  const summary: SyncSummary = { connections: 1, links: 0, changed: 0 };
  try {
    const adapter = resolveAdapter(connection.provider, connection.mode);
    const { data: links, error } = await db.rpc("integration_sync_inputs", { p_connection: connection.id });
    if (error) throw new Error(error.message);
    const now = deps.now?.() ?? new Date();
    for (const link of links ?? []) {
      const status = await adapter.fetchIssueStatus(link.external_id, { linkedAt: new Date(link.created_at), now });
      const { data: changed, error: aErr } = await db.rpc("apply_integration_status", { p_link: link.link_id, p_status: status });
      if (aErr) throw new Error(aErr.message);
      summary.links++;
      if (changed) summary.changed++;
    }
    await db.rpc("record_integration_sync", { p_connection: connection.id, p_status: "succeeded", p_summary: summary as never, p_error: null as never });
    return { ok: true, summary };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed.";
    await db.rpc("record_integration_sync", { p_connection: connection.id, p_status: "failed", p_summary: summary as never, p_error: message });
    return { ok: false, error: message, summary };
  }
}

export async function syncOrganizationConnections(db: Db, organizationId: string, deps: Pick<Deps, "now">): Promise<{ ok: true; summary: SyncSummary } | { ok: false; error: string; summary: SyncSummary }> {
  const { data, error } = await db.rpc("due_integration_connections");
  if (error) return { ok: false, error: error.message, summary: { connections: 0, links: 0, changed: 0 } };
  const total: SyncSummary = { connections: 0, links: 0, changed: 0 };
  let firstError: string | null = null;
  for (const c of (data ?? []).filter((x) => x.organization_id === organizationId)) {
    const r = await syncConnection(db, c, deps);
    total.connections++;
    total.links += r.summary.links;
    total.changed += r.summary.changed;
    if (!r.ok) firstError ??= r.error;
  }
  return firstError ? { ok: false, error: firstError, summary: total } : { ok: true, summary: total };
}
