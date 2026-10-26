# Stride — Workflows, Hooks and Event Processing

> **Status:** Phase 1 implements deterministic pre-hooks and post-hooks as **database triggers**
> (described below and operational). The workflow engine, webhooks, outbox, scheduler and
> integrations are **design only** and are built in Phase 7. Nothing in this document beyond §1 is
> operational yet.

## 1. Implemented in Phase 1

| Hook | Trigger | Behaviour |
|---|---|---|
| Pre-hook: lifecycle validation | `projects_before_write` BEFORE INSERT/UPDATE | Rejects invalid transitions (`invalid_transition`), stamps `status_changed_at`, sets `actual_end_date` on completion, stamps `health_updated_at` |
| Pre-hook: authorization | RLS + RPC checks | Deterministic; never delegated to AI |
| Pre-hook: reason rules | `transition_project_status`, `set_project_health` | Reason required for On hold, Cancelled, Amber, Red |
| Post-hook: status history | `projects_record_history` AFTER | Appends to `project_status_history` with actor and reason |
| Post-hook: audit | `audit_row_change` AFTER on all Phase 1 tables | Appends field-level diffs to `audit_logs` |

Triggers run in the same transaction as the change: if a post-hook fails, the change rolls back.
They write only to append-only tables and never update their own source table, so they cannot recurse.

## 2. Event envelope (Phase 7)

```json
{
  "eventId": "uuid",
  "schemaVersion": 1,
  "tenantId": "uuid",
  "type": "project.status_changed",
  "entity": { "type": "project", "id": "uuid" },
  "occurredAt": "2026-10-26T10:00:00Z",
  "correlationId": "uuid",
  "causationId": "uuid | null",
  "actor": { "type": "user | agent | system", "id": "uuid" },
  "data": { "from": "active", "to": "on_hold" }
}
```

Payloads carry identifiers and changed fields only — no secrets, minimal personal data.

## 3. Reliable delivery (Phase 7)

- **Transactional outbox:** `outbox_events` row written in the same transaction as the change
  (by trigger or RPC). A worker (Edge Function on a schedule or queue consumer) publishes and marks
  delivered.
- **Idempotency:** consumers dedupe by `eventId`; mutating endpoints accept an idempotency key.
- **Retries:** exponential backoff with jitter, max attempts, then **dead-letter** with manual replay.
- **Loop prevention:** events carry `causationId`/hop count; handlers ignore events they caused;
  inbound webhooks from integrations we also write to are matched against our own change ids.
- **Delivery tracking:** `webhook_deliveries` and `workflow_execution_steps` record each attempt.

## 4. Webhooks (Phase 7)

- Inbound: per-integration endpoint, HMAC signature verification with rotating secrets, timestamp
  tolerance window and nonce store for replay protection, payload treated as untrusted.
- Outbound: signed payloads, per-endpoint secrets, retry/dead-letter as above.

## 5. Workflow engine (Phase 7)

Node types: trigger, condition/branch, transform, agent run, integration action, approval, delay /
schedule, notification, end, error handler. Workflow states: draft → test (dry-run) → active →
paused → archived. Versioned definitions; executions pin the version they started on; rollback
re-activates a prior version.

### Reference workflow — project status change

1. Trigger: `project.status_changed` (from outbox).
2. Pre-hook (deterministic): transition already validated by DB trigger.
3. Recalculate project health inputs.
4. Run Project Health Agent (read-only).
5. Condition: escalation threshold met?
6. If critical: create escalation record (Phase 4 table).
7. Approval node: Delivery Head approves.
8. On approval: notify stakeholders via configured channels.
9. Persist execution steps and audit trail.

## 6. Scheduling (Phase 7)

Supabase `pg_cron` (or platform cron) enqueues scheduled triggers (daily brief, missing-timesheet
reminders, stale-health nudges). Schedules are tenant-configured rows in `scheduled_jobs`.
