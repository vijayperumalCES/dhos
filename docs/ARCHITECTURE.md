# DHOS — System Architecture

_Last updated: 2026-10-26 (Phase 1)._

## 1. Overview

```
Browser ──HTTPS──▶ Next.js 16 (App Router, Node runtime)
                     │  proxy.ts: refresh Supabase session cookie, optimistic auth redirect
                     │  Server Components: read via user-scoped Supabase client
                     │  Server Actions: validate (Zod) → permission pre-check → write → revalidate
                     ▼
                  Supabase
                     ├─ Auth (email/password, JWT)
                     ├─ PostgREST  ← every request carries the user's JWT
                     └─ Postgres 17
                          ├─ RLS policies (authoritative authorization)
                          ├─ SECURITY DEFINER RPCs for governed columns (status, health, archive, roles)
                          ├─ BEFORE triggers  = deterministic pre-hooks (lifecycle validation)
                          └─ AFTER triggers   = post-hooks (status history, audit log)
```

## 2. Key decisions

| Decision | ADR |
|---|---|
| Next.js App Router + Supabase, TypeScript strict | [ADR-0001](DECISIONS/ADR-0001-stack.md) |
| Authorization enforced in Postgres (RLS + RPC), app checks are UX only | [ADR-0002](DECISIONS/ADR-0002-authorization-in-database.md) |
| Cache Components disabled; all tenant data rendered dynamically | [ADR-0003](DECISIONS/ADR-0003-rendering-and-caching.md) |
| Audit and history written by database triggers, append-only | [ADR-0004](DECISIONS/ADR-0004-audit-by-trigger.md) |
| Multi-tenancy by `organization_id` with composite foreign keys | [ADR-0005](DECISIONS/ADR-0005-tenancy-model.md) |
| Radix-based shadcn/ui, React Hook Form + Zod, Recharts | [ADR-0006](DECISIONS/ADR-0006-ui-stack.md) |

## 3. Code layout

```
src/
  proxy.ts                      Session refresh + optimistic redirect (Next 16 "proxy" = middleware)
  app/
    (auth)/login, signup        Public pages
    auth/confirm                Email-confirmation / PKCE callback
    onboarding                  Create org / accept invitations
    (app)/…                     Authenticated shell: dashboard, projects, teams, clients, admin, search, roadmap
  components/
    ui/                         shadcn/ui primitives (Radix)
    shell/                      Sidebar, org switcher, top bar, demo banner
    common/                     Page header, badges, filter bar, pagination, audit trail, member management
    forms/                      RHF field wrappers bound to Zod schemas
    projects|teams|clients|dashboard/  Feature components
  lib/
    env.ts                      Validated public env
    supabase/                   Server client, proxy client, generated DB types
    auth/                       getCurrentUser, getOrgContext (active org + permissions)
    domain/                     Pure domain logic: permissions mirror, lifecycle, KPI catalogue
    validation/                 Zod schemas shared by client forms and server actions
    data/                       Server-only typed queries (read)
    actions/                    Server Actions (write) + error mapping
    navigation.ts               Nav model + planned-module registry
supabase/
  migrations/                   Versioned SQL (schema, RLS, RPCs, triggers)
  seed.sql                      Labelled demo data (local only)
  tests/database/               pgTAP tenant-isolation and RBAC tests
tests/
  unit/                         Vitest: domain, validation, matrix-vs-SQL drift checks
  e2e/                          Playwright: auth, RBAC, lifecycle flows
```

## 4. Request lifecycle

**Read.** A Server Component calls `requireOrgContext()` (memoised per request with `React.cache`),
which verifies the JWT (`auth.getClaims()`), loads active memberships, resolves the active
organization from the `dhos_org` cookie *only if* the user is a member, and loads the caller's
permission keys via `my_permissions()`. Data functions in `lib/data` query with the same user-scoped
client, so RLS filters every row.

**Write.** A Client Component form validates with Zod for instant feedback, then calls a Server
Action. The action re-reads the session, re-validates with the same schema, performs a permission
pre-check for a friendly message, and writes. Postgres enforces RLS, column privileges and triggers;
errors are mapped to safe messages (`lib/actions/result.ts`). Governed fields go through RPCs.

## 5. Event model (Phase 1 foundation → Phase 7)

Phase 1 implements the **pre-hook / post-hook** concept with database triggers:

| Hook | Implementation |
|---|---|
| Pre-hook: validate lifecycle transition | `private.projects_before_write()` (BEFORE UPDATE) |
| Pre-hook: authorization | RLS + `can_act_on_project()` inside RPCs |
| Post-hook: status history | `private.projects_record_history()` (AFTER) |
| Post-hook: audit | `private.audit_row_change()` (AFTER on all Phase 1 tables) |

The versioned event envelope, outbox, webhooks, retries and dead-letter handling are designed in
`docs/WORKFLOWS.md` and built in Phase 7. **No event bus, webhook or scheduler is operational yet.**

## 6. Environments

| Env | App | Database |
|---|---|---|
| Local | `pnpm dev` on :3100 | `supabase start` (API :55321, DB :55322, Studio :55323) |
| Production | Vercel (or any Node host) | Supabase hosted project; migrations via `supabase db push` |

See `docs/DEPLOYMENT.md`.

## 7. Observability

Phase 1: unexpected database errors are logged server-side with code and message (never shown to
users). Phase 8 adds OpenTelemetry via `instrumentation.ts`, error tracking and alerting.
