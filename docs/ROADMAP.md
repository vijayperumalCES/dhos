# Stride — Roadmap

_Last updated: 2026-11-05._ Status: ✅ done · 🟡 partial · ⬜ not started

| Phase | Theme | Status |
|---|---|---|
| 1 | Foundation and Delivery Command Center | ✅ (see `IMPLEMENTATION_STATUS.md` for known gaps) |
| 2 | Work management | ✅ (see `IMPLEMENTATION_STATUS.md`) |
| 3 | Workforce management | ✅ (see `IMPLEMENTATION_STATUS.md`) |
| 4 | Delivery governance | ✅ (see `IMPLEMENTATION_STATUS.md`) |
| 5 | Financial and portfolio intelligence | ✅ (see `IMPLEMENTATION_STATUS.md`) |
| 6 | AI agents | ✅ (see `IMPLEMENTATION_STATUS.md`) |
| 7 | Automation and integrations | ✅ (see `IMPLEMENTATION_STATUS.md`) |
| 8 | Production readiness | 🟨 platform hardening and security controls done; testing and external reviews open |

## Phase 2 — Work management (done 2026-10-28)

1. Programs (group projects) and milestones with baselines; milestone slippage feeds the Command Center.
2. Configurable workflow states per organization (`workflow_states`, `workflow_transitions`).
3. Unified `work_items` table (epic / feature / story / task / subtask / defect / change request) with
   hierarchy, links and dependencies; activity history and comments.
4. Backlog, Kanban board, sprint planning, burndown and velocity.
5. Command Center: milestones due/overdue, sprint commitment vs completion, blocked work.
6. Introduce TanStack Query + Supabase Realtime for the board (first genuinely client-heavy surface).

## Phase 3 — Workforce (done 2026-11-01)

Work calendars and holidays, attendance with corrections + approvals, leave types/balances/requests,
timesheets with approvals, dated allocations replacing indicative `allocation_percent`, capacity and
utilisation (kept separate from attendance by definition). Separate HR access policy
([ADR-0008](DECISIONS/ADR-0008-workforce-model.md)).

## Phase 4 — Governance (done 2026-11-02)

Unified RAID register ([ADR-0009](DECISIONS/ADR-0009-governance-model.md)), decisions (locked once
recorded), owned actions, escalations that require evidence and a deadline, change requests approved by
someone other than the requester, release governance with quality gates, client contacts and contracts
that inherit client confidentiality, versioned documents, and an executive governance report with the
"red with no recovery action" measure.

Deliberately left out: meeting records, scheduled and branded client reports (Phase 7 scheduler),
organization-level gate templates, file uploads (Phase 8), contract values (done in Phase 5), a confidentiality
flag on individual RAID items.

## Phase 5 — Financial & portfolio (done 2026-11-03)

Effective-dated rate cards and personal rates, versioned project budgets whose approved version is the
baseline (approved by someone other than the drafter), labour actuals from approved timesheets, an
append-only cost ledger, forecasts kept apart from facts, contract values and a revenue schedule,
variance, margin where revenue exists, and portfolio roll-ups by client and program. Finance-only
policies; rates never appear in a report; audit entries redact amounts
([ADR-0010](DECISIONS/ADR-0010-finance-model.md)).

Deliberately left out: multi-currency, invoicing and time-and-materials billing, shared-cost
allocation, trend snapshots of the estimate over time (Phase 7 scheduler).

## Phase 6 — AI agents (done 2026-11-04)

Provider-agnostic model gateway (built-in rule-based and Anthropic providers), an agent registry with
immutable prompt versions gated by evaluation, Project Health, Delivery Intelligence, Requirements and
Reporting agents, human approval for the one action agents may propose (create a work item), an
execution log private to the requester, per-agent and per-organization kill switches, a monthly token
cap and a usage view. Agents read through the caller's own session and RLS; models never call tools;
every finding cites records that were read ([ADR-0011](DECISIONS/ADR-0011-ai-agents.md)).

Deliberately left out: the other ten planned agents, tool-calling models, embeddings and knowledge
retrieval, scheduled or event-triggered runs (Phase 7), agent-initiated writes beyond drafts for
approval, and a price table for cost (organizations enter their own prices).

## Phase 7 — Automation & integrations (done 2026-11-05)

A transactional outbox fed by database triggers; a notification center with per-person preferences
and deduplication; signed, retried webhooks (generic, Teams and Slack formats) with SSRF protection;
workflow rules with dry runs and immutable versions; a scheduler (overdue escalations, timesheet
reminders, sprint burndown snapshots, integration sync, retention) driven by one authenticated HTTP
tick; and GitHub / Azure DevOps / Jira connections on mock adapters. The only privileged path is a
fixed set of `service_role` RPCs ([ADR-0012](DECISIONS/ADR-0012-automation.md)).

Deliberately left out: live provider adapters and their credential store, inbound webhooks, Slack and
Teams apps (incoming-webhook posts only), a canvas workflow builder, scheduled agent runs, monthly
leave accrual, and realtime push of notifications.

## Phase 8 — Production readiness

Security review and pen test, tenant-isolation fuzzing, performance tests, backup/restore drills,
OpenTelemetry + alerting, CI/CD with preview databases, runbooks, UAT, configurable retention,
dual approval for privileged role grants, MFA enforcement option.

**Platform hardening — done 2026-11-06.** Structured, redacting JSON logging; opt-in OpenTelemetry
tracing and a request-error hook; `/api/health`; CI with dependency audit and generated-type drift
check; a reviewer-gated production migration workflow; runbooks with a backup/restore drill
(ADR-0013).

**Security controls — done 2026-11-06.** Dual approval for privileged role grants, an MFA
enforcement option enforced in the database, a legal hold, and editable retention windows
(ADR-0014).

**Still open:** tenant-isolation fuzzing and performance tests; the actual restore drill, pen test
and UAT, which people must run; preview databases (needs Supabase Branching); alert rules in the
monitoring tool.
