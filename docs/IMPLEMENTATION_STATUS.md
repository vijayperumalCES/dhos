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
| Email confirmation callback (`/auth/confirm`) | Built, not exercised locally | Local stack has confirmations off |
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

## Known gaps and limitations (Phase 1)

- **No invitation email** — invitations are accepted when the invitee signs in with that email.
- **No password reset / magic-link UI** yet (Supabase supports it; screens not built).
- **Org time zone not applied** to date calculations; KPIs use UTC calendar days.
- **Custom roles** cannot be created/edited in the UI (matrix view is read-only).
- **Confidential clients** are flagged but not yet access-restricted beyond `client.read`.
- **Departments**, reporting hierarchy, employee profiles/skills: not started (Phase 3 with workforce).
- **Notification center** is a labelled placeholder.
- **Bulk import/export** not started.
- KPIs are computed in the app from RLS-filtered rows; move to SQL views/RPCs when portfolios exceed
  a few thousand projects.
- Org admins can grant themselves delivery roles (audited); dual approval planned for Phase 8.
- Saved views (beyond shareable URL filters) not started.
- Dev-server note: after adding new dynamic route folders, restart `pnpm dev` if a route 404s
  (observed once with Next 16.4 dev; production build unaffected).

## Test inventory

| Suite | Command | Count | Last result |
|---|---|---|---|
| Unit (Vitest) | `pnpm test` | 33 | ✅ pass |
| Database (pgTAP) | `pnpm test:db` | 45 | ✅ pass |
| End-to-end (Playwright) | `pnpm test:e2e` | 9 | ✅ pass |
| Typecheck / lint / build | `pnpm typecheck`, `pnpm lint`, `pnpm build` | — | ✅ pass |
