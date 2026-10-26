# Stride — Roadmap

_Last updated: 2026-10-26._ Status: ✅ done · 🟡 partial · ⬜ not started

| Phase | Theme | Status |
|---|---|---|
| 1 | Foundation and Delivery Command Center | ✅ (see `IMPLEMENTATION_STATUS.md` for known gaps) |
| 2 | Work management | ⬜ |
| 3 | Workforce management | ⬜ |
| 4 | Delivery governance | ⬜ |
| 5 | Financial and portfolio intelligence | ⬜ |
| 6 | AI agents | ⬜ |
| 7 | Automation and integrations | ⬜ |
| 8 | Production readiness | ⬜ (some groundwork in Phase 1) |

## Phase 2 — Work management (next)

1. Programs (group projects) and milestones with baselines; milestone slippage feeds the Command Center.
2. Configurable workflow states per organization (`workflow_states`, `workflow_transitions`).
3. Unified `work_items` table (epic / feature / story / task / subtask / defect / change request) with
   hierarchy, links and dependencies; activity history and comments.
4. Backlog, Kanban board, sprint planning, burndown and velocity.
5. Command Center: milestones due/overdue, sprint commitment vs completion, blocked work.
6. Introduce TanStack Query + Supabase Realtime for the board (first genuinely client-heavy surface).

## Phase 3 — Workforce

Work calendars and holidays, attendance with corrections + approvals, leave types/balances/requests,
timesheets with approvals, dated allocations replacing indicative `allocation_percent`, capacity and
utilisation (kept separate from attendance by definition). Separate HR access policy.

## Phase 4 — Governance

RAID register (ADR on unified vs separate tables), decisions, actions, escalations with evidence and
deadlines, change requests, release governance with quality gates, client contacts/contracts and
confidential-client enforcement, executive and client reporting, documents with versioning.

## Phase 5 — Financial & portfolio

Budgets and baselines, rate cards, actuals and forecasts (facts vs forecasts separated), variance,
margin where data supports it, portfolio analytics. Finance-only RLS policies, column-level isolation.

## Phase 6 — AI agents

Model gateway, registry, Delivery Intelligence, Project Health, Requirements and Reporting agents,
approvals, evaluation and usage controls. See `AGENT_ARCHITECTURE.md`.

## Phase 7 — Automation & integrations

Outbox, webhooks, workflow builder, scheduler, GitHub / Azure DevOps / Jira adapters (mock adapters
first), email and Teams notifications, notification center with deduplication.

## Phase 8 — Production readiness

Security review and pen test, tenant-isolation fuzzing, performance tests, backup/restore drills,
OpenTelemetry + alerting, CI/CD with preview databases, runbooks, UAT, configurable retention,
dual approval for privileged role grants, MFA enforcement option.
