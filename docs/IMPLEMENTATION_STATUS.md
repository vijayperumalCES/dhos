# Stride — Implementation Status

_Last updated: 2026-11-02._ A feature is "Done" only when it meets the Definition of Done in the
master brief: UI end-to-end, persisted, authorized, tenant-tested, validated, audited, tested,
empty/loading/error states, documented.

## Phase 1

| Feature | Status | Evidence |
|---|---|---|
| Next.js 16 app, TS strict, Tailwind v4, shadcn/ui (Radix) | Done | `pnpm build` passes |
| Local Supabase stack, migrations, typed client | Done | `supabase/migrations/*`, `database.types.ts` |
| Email/password auth, session refresh, protected routes | Done | e2e `access-control.spec.ts` |
| Email confirmation callback (`/auth/confirm`) | Done | Exercised by password-reset e2e (PKCE code exchange) |
| Organizations, settings, create-org onboarding | Done | UI + RPC + pgTAP |
| Memberships, invitations (in-app acceptance), roles, suspension | Done | pgTAP + e2e (admin view) |
| Org switcher | Done | Manual check; cookie validated server-side |
| RBAC (14 system roles, 16 permissions) + RLS on all 16 tables | Done | pgTAP 45/45, unit drift tests |
| Projects CRUD + archive/restore + list filters/sort/pagination | Done | e2e `project-lifecycle.spec.ts` |
| Lifecycle state machine + reasons + status history | Done | pgTAP + unit + e2e |
| Health (RAG) with reasons and staleness | Done | pgTAP + unit + e2e |
| Project members | Done | Manual check + pgTAP cross-tenant FK |
| Teams CRUD + members + archive | Done | e2e |
| Clients CRUD + archive (minimal) | Done | Manual check |
| Audit log (trigger-written, append-only) + viewer | Done | pgTAP immutability + e2e |
| Command Center with KPI catalogue, filters, attention list, charts | Done | Unit `kpis.test.ts` + e2e |
| Global search (projects, teams, clients) | Done | e2e tenant test |
| Planned-module pages (honest placeholders) | Done | — |
| Demo seed clearly labelled + demo banner | Done | `supabase/seed.sql` |
| Responsive shell, dark mode, skip link, keyboard `/` search | Done | Manual check at 375px |
| CI workflow | Written, not yet run on a remote | `.github/workflows/ci.yml` |

## Phase 1 gap closure (2026-10-27)

| Feature | Status | Evidence |
|---|---|---|
| Invitation emails (sign-in link via Supabase Auth), resend, send tracking | Done | e2e `auth-emails.spec.ts` (via local Mailpit) |
| Welcome page: accept invitation, set a password | Done | e2e |
| Forgot / reset password; change password on profile | Done | e2e |
| Organization time zone applied to "today" (overdue, due-soon) and to displayed timestamps; zone validated in app and database | Done | Unit `time.test.ts`, `kpis.test.ts`; pgTAP |
| Custom roles: create, edit permissions, delete (system roles fixed); permission changes audited | Done | pgTAP `02_phase1_gaps`, e2e |
| Confidential clients: visible only with `client.confidential.read`, to the account owner, or to people assigned to its projects; others see "Restricted client" | Done | pgTAP |
| Departments (CRUD, archive, head) | Done | e2e, pgTAP |
| Reporting lines (manager per member, cycle-proof) and org chart | Done | e2e, pgTAP, unit `reporting.test.ts` |
| CSV export: projects, members (RLS-scoped, formula-injection safe) | Done | e2e, unit `csv.test.ts` |
| CSV import: projects (validated preview, all-or-nothing) and bulk invitations | Done | e2e |

New migration `20261027000100_phase1_gaps.sql` — **must be pushed to the hosted project** (`supabase db push`).

## Phase 2 — Work management (2026-10-28)

| Feature | Status | Evidence |
|---|---|---|
| Programs (create, edit, close; project assignment; health and milestone roll-up) | Done | e2e, pgTAP |
| Milestones with owners, completion, baselines (immutable snapshots) and schedule variance | Done | e2e, unit |
| Organization workflow: states with categories, order, default, WIP limits, optional transition rules | Done | pgTAP (rules enforced by trigger) |
| Work items: epic → feature → story → task/sub-task, bugs, incidents, change requests; parent rules; per-project keys | Done | pgTAP, unit drift test |
| Item detail: description, acceptance criteria, children, dependencies (cycle-proof), links, comments, activity feed | Done | e2e, pgTAP |
| Backlog grouped by sprint with quick add, move-to-sprint and reordering | Done | e2e |
| Kanban board: drag and drop (mouse + keyboard), WIP limits, live updates (TanStack Query + Supabase Realtime) | Done | e2e (keyboard), manual |
| Sprints: plan, start (commitment recorded), complete (unfinished work moves), burndown, velocity, reliability | Done | e2e, pgTAP, unit |
| Project status reports: narrative + evidence snapshot, immutable, copy as Markdown | Done | e2e, unit |
| Command Center: overdue / due-soon / slipped milestones, active sprint completion, blocked work | Done | unit, manual |
| My Work across projects | Done | e2e |
| CSV project import accepts a `program` column | Done | — |

New migration `20261028000100_work_management.sql` — **must be pushed to the hosted project** (`supabase db push`).

### Phase 2 limitations
- Burndown history starts when a sprint starts and is recorded on change (no nightly snapshot until Phase 7 scheduling).
- Sprint capacity uses average velocity only; people-based capacity exists in Resource Planning but isn't yet used in sprint planning.
- Live board updates require the `work_items` table in the Supabase Realtime publication (done by the migration).
- No cross-project critical-path view yet; dependencies are shown per item.
- Work items can't be bulk-imported yet (projects can).

## Phase 3 — Workforce (2026-11-01)

| Feature | Status | Evidence |
|---|---|---|
| Work calendars (working days, hours per day, default, archive), holidays, per-member calendar | Done | e2e (holidays), pgTAP |
| Leave types (paid, approval, yearly allowance or untracked) and yearly balances with grant and adjust | Done | pgTAP |
| Leave requests: working-day count from calendar and holidays, half days, overlap and balance checks, auto-approval for types without approval | Done | pgTAP, e2e |
| Leave review by direct manager or HR (never self), rejection reason, cancellation; milestone conflicts flagged to reviewers | Done | pgTAP, e2e |
| Team availability calendar showing only "On leave" and holidays | Done | pgTAP |
| Attendance check-in / check-out (server clock, org time zone), corrections with approval, team exceptions | Done | pgTAP, e2e |
| Weekly timesheets by project, work item or category; submit, recall, approve, return; lock once submitted | Done | pgTAP, e2e |
| Timesheet compliance report for managers and `timesheet.read_all` | Done | e2e |
| Dated resource allocations (CRUD) replacing indicative allocation | Done | pgTAP, manual |
| Capacity and utilisation: calendar minus holidays and approved leave; peak-day over-allocation; utilisation from submitted project time | Done | pgTAP, e2e, unit |
| Separate HR access policy and 7 new permissions; workforce settings in Administration | Done | pgTAP, unit drift test, ADR-0008 |
| Demo seed: HR user (Hana Sato), holidays, balances, leave, attendance with exceptions, timesheets in every state, an over-allocated engineer | Done | `supabase/seed.sql` |

New migration `20261029000100_workforce.sql` — **must be pushed to the hosted project** (`supabase db push`).

### Phase 3 limitations
- Balances are granted yearly by HR; no monthly accrual, carry-over or expiry (needs the Phase 7 scheduler).
- No reminders for missing timesheets or forgotten check-outs (Phase 7 notifications).
- Changing a calendar or adding a holiday doesn't recount existing leave requests.
- Capacity is computed on request for up to 184 days; skills and skill coverage are not modelled yet.
- Sprint planning doesn't use people capacity yet; it still uses average velocity.
- Timesheet entries are added one at a time; no inline grid editing or copy-last-week.

## Phase 4 — Delivery governance (2026-11-02)

| Feature | Status | Evidence |
|---|---|---|
| Unified RAID register (risk, assumption, issue, dependency): owner, due date, response, probability × impact score, resolution note required, archive | Done | pgTAP, unit |
| Decision log: propose, accept or reject (locked), supersede by a newer decision | Done | pgTAP |
| Actions with one owner and a due date, linked to a RAID item or decision; owners complete their own | Done | pgTAP |
| Escalations: recipient, severity, deadline, evidence (append-only); acknowledge, resolve; overdue and due-soon flags | Done | pgTAP, unit |
| Change requests: draft, submit, approve or reject by someone else, implement, withdraw; locked after draft | Done | pgTAP |
| Releases with quality gates: default five, add or remove until approval, pass, fail, waive with a reason; approval needs every required gate; failing a gate withdraws approval; open S1/S2 defects shown as context | Done | pgTAP, unit |
| Client contacts and contracts inheriting client confidentiality; contract end flags | Done | pgTAP, unit |
| Documents with immutable versions (Markdown and/or link), internal or client-visible | Done | pgTAP |
| Executive governance report with "red with no recorded recovery action", copyable as Markdown; project Governance tab | Done | unit, manual |
| 8 new permissions and role templates; separate access doc section; ADR-0009 | Done | pgTAP, unit drift test |
| Demo seed: register, decisions, actions, escalations (one overdue), changes, releases (shipped, in review, planned), contacts, contracts, documents; NW-PAY red with no recovery action | Done | `supabase/seed.sql` |

New migration `20261102000100_governance.sql` — **must be pushed to the hosted project** (`supabase db push`).

### Phase 4 limitations
- No meeting records; decisions and actions stand alone.
- Client reporting is limited to Phase 2 status reports and `client`-visibility documents; scheduled or branded client reports need the Phase 7 scheduler.
- Quality gates are per release (five defaults), not an organization-level template; open critical defects inform but don't block approval.
- Approving a change request records the decision and impact; it does not edit milestones or baselines.
- Documents are text and links; there are no file uploads (Phase 8).
- Contracts hold terms and dates only; monetary values arrive with Phase 5.
- A RAID item can't be hidden from project members who hold `governance.read`.
- The "red with no recovery action" list shows the open interval, not a trend of time-to-first-action.
- Lists show at most 500 rows (no pagination yet) and refresh on navigation, not live.
- No Playwright journeys for governance yet; pgTAP and unit tests cover the rules, and the pages were checked by hand.

## Phase 5 — Financial and portfolio (2026-11-03)

| Feature | Status | Evidence |
|---|---|---|
| Rate card by job title and personal rates, effective-dated, never edited; deletable only before they take effect; finance-manager-only | Done | pgTAP |
| Budgets: draft, edit, approve as baseline by someone other than the drafter, revise (earlier baselines kept), frozen once approved | Done | pgTAP |
| Labour actuals from approved timesheets × rate in force on the day; hours with no rate counted and flagged | Done | pgTAP, unit |
| Append-only cost ledger with reversal; non-labour forecasts per month; labour forecast from dated allocations | Done | pgTAP |
| Contract values and billing model under a finance-only, client-visibility policy | Done | pgTAP |
| Revenue schedule: planned until recognised, then locked | Done | pgTAP |
| Variance, estimate at completion, margin only where revenue exists; at-risk (95%) and over-budget flags | Done | unit |
| Portfolio page: totals, needs-attention list, projects by risk, roll-ups by client and program; project Finance tab; Rates page | Done | build, manual |
| 3 permissions and role templates; audit entries with amounts redacted; ADR-0010 | Done | pgTAP, unit drift test |
| Demo seed: rate card (Data Engineer unrated on purpose), baselines, ledger with a reversal, forecasts, contract values, revenue; NW-PAY over budget, NW-MOB at risk, NW-CRM no baseline | Done | `supabase/seed.sql` |

New migration `20261103000100_finance.sql` — **must be pushed to the hosted project** (`supabase db push`).
The demo seed adds Fiona Gray (Finance Manager); sign in as Priya to approve a draft Fiona created.

### Phase 5 limitations
- Single currency (the organization's); no FX, invoicing, tax or time-and-materials billing.
- Labour forecast ignores approved leave and uses the rate in force on each future day.
- Adding a rate with an earlier effective date re-prices past actuals (visible in the audit log, amounts redacted).
- No trend of the estimate over time (needs the Phase 7 scheduler for snapshots).
- Shared costs are not allocated across projects.
- The pages were checked by compiling and by the database tests; they were not exercised against a running Supabase stack, and there are no Playwright journeys for finance yet.

## Known gaps and limitations (Phase 1)

- **Email delivery limits:** hosted Supabase's built-in mailer sends only a few emails per hour. Configure
  custom SMTP before inviting people in bulk (see DEPLOYMENT.md).
- Password-reset links use PKCE and must be opened in the browser that requested them.
- Imported projects always start as Proposed / Not assessed; lifecycle history is not imported.
- Custom roles can only use the existing permission catalogue; per-project role overrides are not built.
- Departments are flat (no sub-departments).
- **Notification center** is a labelled placeholder (Phase 7).
- KPIs are computed in the app from RLS-filtered rows; move to SQL views/RPCs when portfolios exceed
  a few thousand projects.
- Org admins can grant themselves delivery roles or build a powerful custom role (audited); dual
  approval planned for Phase 8.
- Saved views (beyond shareable URL filters) not started.
- Dev-server note: after adding new dynamic route folders, restart `pnpm dev` if a route 404s
  (observed once with Next 16.4 dev; production build unaffected).

## Test inventory

| Suite | Command | Count | Last result |
|---|---|---|---|
| Unit (Vitest) | `pnpm test` | 103 | ✅ pass |
| Database (pgTAP) | `pnpm test:db` | 255 (45 + 25 + 34 + 53 + 98) | ✅ pass |
| End-to-end (Playwright) | `pnpm test:e2e` | 26 | ✅ pass |
| Typecheck / lint / build | `pnpm typecheck`, `pnpm lint`, `pnpm build` | — | ✅ pass |
