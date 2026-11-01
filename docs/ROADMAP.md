# Stride — Roadmap

_Last updated: 2026-11-02._ Status: ✅ done · 🟡 partial · ⬜ not started

| Phase | Theme | Status |
|---|---|---|
| 1 | Foundation and Delivery Command Center | ✅ (see `IMPLEMENTATION_STATUS.md` for known gaps) |
| 2 | Work management | ✅ (see `IMPLEMENTATION_STATUS.md`) |
| 3 | Workforce management | ✅ (see `IMPLEMENTATION_STATUS.md`) |
| 4 | Delivery governance | ✅ (see `IMPLEMENTATION_STATUS.md`) |
| 5 | Financial and portfolio intelligence | ⬜ |
| 6 | AI agents | ⬜ |
| 7 | Automation and integrations | ⬜ |
| 8 | Production readiness | ⬜ (some groundwork in Phase 1) |

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
organization-level gate templates, file uploads (Phase 8), contract values (Phase 5), a confidentiality
flag on individual RAID items.

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
