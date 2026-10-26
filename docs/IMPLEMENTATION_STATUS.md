# Stride — Implementation Status

_Last updated: 2026-10-26._ A feature is "Done" only when it meets the Definition of Done in the
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
- Sprint capacity uses average velocity only; people-based capacity arrives with Phase 3.
- Live board updates require the `work_items` table in the Supabase Realtime publication (done by the migration).
- No cross-project critical-path view yet; dependencies are shown per item.
- Work items can't be bulk-imported yet (projects can).

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
| Unit (Vitest) | `pnpm test` | 64 | ✅ pass |
| Database (pgTAP) | `pnpm test:db` | 104 (45 + 25 + 34) | ✅ pass |
| End-to-end (Playwright) | `pnpm test:e2e` | 21 | ✅ pass |
| Typecheck / lint / build | `pnpm typecheck`, `pnpm lint`, `pnpm build` | — | ✅ pass |
