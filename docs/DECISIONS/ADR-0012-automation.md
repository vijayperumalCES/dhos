# ADR-0012: Automation — outbox, notifications, webhooks, rules, scheduler and integrations

**Status:** Accepted · 2026-11-05

## Context
Phase 7 makes Stride react to what happens: tell the right people, call other systems, run recurring
work (reminders, snapshots, sync) and link to external trackers. Every earlier phase answered "what
can this person see?" with Row Level Security and the caller's own session. Background work has no
caller, so this is the first place a privileged path is unavoidable, and the first place Stride sends
data to systems it does not control. The design keeps both narrow.

## Decisions

1. **A transactional outbox, written by triggers.** Changes people care about (project health and
   status, work items blocked or assigned, RAID items, escalations, leave, timesheets, releases,
   sprints, agent proposals) write an `outbox_events` row in the same transaction as the change, so
   an event exists if and only if the change committed. Payloads hold ids and short labels, never
   descriptions, comments or reasons. Operators read events only for projects they can already read.
2. **One privileged path, as small as possible.** The worker uses a `service_role` client
   (`SUPABASE_SECRET_KEY`, server-only) and calls only a fixed set of RPCs (`claim_*`, `fan_out_event`,
   `apply_workflow_rule`, `complete_*`, `run_scheduled_job`, `record_*`). They are revoked from
   `anon`, `authenticated` and `public`; a pgTAP test proves a signed-in user cannot call them. The
   worker never reads tenant tables directly, and the claim RPCs return only what the step needs
   (the webhook claim is the only place a signing secret leaves the database).
3. **At-least-once with idempotent steps.** Rows are claimed with `FOR UPDATE SKIP LOCKED` and a lease,
   so overlapping ticks and crashed runs are harmless. `fan_out_event` marks the event processed in
   the same transaction that writes notifications and delivery rows; a rule runs at most once per
   event (`unique (rule_id, event_id)`); a delivery is unique per `(endpoint, event)`. A failed
   event is retried with exponential backoff and stays visible with its attempt count.
4. **Recipients are checked, not trusted.** Every notification goes through `private.notify_member`,
   which requires an active membership in the same organization and, for a project event, that the
   *recipient* can read the project (`private.membership_can_read_project` mirrors the RLS rule for a
   named member). The person who made the change is not notified of it. A rule that names a role or
   person cannot reach someone who could not open the project.
5. **Notifications collapse while unread.** `unique (membership_id, dedupe_key) where read_at is null`
   turns repeats of the same thing into one row with an occurrence count; reading it ends the run.
   People choose in-app and email per category; critical notifications always reach the inbox.
   Notifications are readable only by their recipient — administrators included.
6. **Webhooks are signed, bounded and self-limiting.** Generic webhooks carry
   `X-Stride-Signature: t=<unix>,v1=<hmac-sha256("<t>.<body>")>`. Secrets live in `webhook_secrets`,
   which no role but the worker's RPC can read, and are shown once at creation or rotation. Only
   `https` URLs are accepted; before each attempt every address the host resolves to must be public
   (private, loopback, link-local/metadata, CGNAT and multicast ranges are refused), redirects are
   not followed, and attempts time out after 8 s. Retries back off 1 min, 5 min, 30 min, 2 h, 12 h,
   then the delivery is `dead` (retry by hand). An endpoint is switched off after ten consecutive
   failures. Teams and Slack endpoints receive a readable message instead of the signed envelope.
   *Residual risk:* a hostname can change between the address check and the connection (DNS
   rebinding); network-level egress filtering on the host is the backstop and is listed in
   `docs/DEPLOYMENT.md`.
7. **Rules are data, evaluated by code, applied once.** A rule is *when event, and conditions, then
   actions* with two action types: notify, and call a webhook. Conditions are evaluated in
   `src/lib/automation/rules.ts` (the same function backs dry runs, so what you test is what runs);
   actions run in `private.apply_rule`. Actions never write business records and never emit events, so
   rules cannot loop or trigger each other. Rules start off, every definition change creates an
   immutable version, and each run records what it did.
8. **A scheduler that is just a tick.** `/api/cron/tick` (bearer `CRON_SECRET`, constant-time
   compare, refuses to run if the secret is shorter than 16 characters) runs one worker pass:
   events, webhook deliveries, email, due jobs, heartbeat. Any scheduler can call it (Vercel Cron,
   GitHub Actions, `pg_cron` + `pg_net`). Jobs are per organization, can be paused or re-timed, and
   write a run log; the Scheduler page shows a stale heartbeat as an error. Jobs: overdue
   escalations, timesheet reminders, sprint burndown snapshots, integration sync, retention.
9. **Email is honest.** With `RESEND_API_KEY` and `EMAIL_FROM` set, email goes through Resend;
   without them it is recorded as `simulated` and labelled as such in the inbox. No path pretends a
   message was sent.
10. **Integrations start with mock adapters.** `integration_connections.mode` accepts only `mock`
    (a CHECK constraint). A mock adapter advances a linked issue's status deterministically as days
    pass, so link → sync → detect change → notify can be exercised end to end. The `IntegrationAdapter`
    interface is what a live adapter implements; live mode needs a credential store (encrypted at
    rest, never returned to the browser), which Phase 7 does not add. Connections hold only
    non-secret configuration.
11. **Retention is configuration, not an afterthought.** The retention job deletes processed events,
    finished deliveries, read notifications and logs past a window (30/30/90/90 days by default).
    The audit log is never touched.

## Consequences
- A change and its event cannot disagree; a slow or dead webhook, mail provider or scheduler cannot
  slow or fail the user's request.
- Notifications cannot leak a project's existence to someone who could not open it, and a rule
  author cannot widen that.
- Webhook receivers get the same id, type and payload on every retry and can de-duplicate on
  `X-Stride-Delivery`.
- Because the scheduler is a plain HTTP tick, "nothing is happening" has one place to look
  (Scheduler page: heartbeat, last runs, pending events).

## Out of scope for this phase
Live GitHub/Azure DevOps/Jira adapters and their credential store; inbound webhooks; Slack/Teams
*apps* (only incoming-webhook posts); calendar integration; a visual (canvas) workflow builder,
multi-step approvals inside rules and rules with more than one condition per row in the form (the
database stores up to ten); scheduled agent runs (agents act as the person who runs them, so a
scheduled run needs a decision about whose authority it uses); monthly leave accrual; realtime push
of notifications to the open page (the bell updates on navigation).
