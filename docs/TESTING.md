# DHOS — Testing Strategy

| Layer | Tool | Location | What it proves |
|---|---|---|---|
| Domain & validation | Vitest | `tests/unit` | Lifecycle rules, KPI formulas, Zod schemas, error mapping, redirect safety |
| Drift guards | Vitest | `tests/unit/*matrix*`, `project-lifecycle.test.ts` | TS mirrors of permissions, role templates and transitions match the SQL migrations |
| Authorization & tenancy | pgTAP | `supabase/tests/database` | RLS, column grants, RPC checks, triggers, audit immutability — against the real database |
| User journeys | Playwright | `tests/e2e` | Sign-in, role-scoped visibility, tenant isolation, project lifecycle, teams, dashboard |
| Static | tsc, ESLint, `next build` | — | Types (incl. generated route types), lint rules (incl. React Compiler rules), production build |

## Running

```bash
pnpm db:start          # once; requires Docker
pnpm db:reset          # apply migrations + demo seed
pnpm test              # unit
pnpm test:db           # pgTAP
pnpm test:e2e          # Playwright (starts or reuses the dev server on :3100)
pnpm test:all          # everything
```

The pgTAP suite builds its own fixtures in a rolled-back transaction, so it does not depend on the
seed. Playwright relies on the seeded demo users and creates uniquely-named records, so it can be
re-run without a reset.

## Rules for new features

1. Every new tenant table gets pgTAP tests for: anon denial, cross-tenant read denial, cross-tenant
   write denial, role-scoped visibility, and any governed column/RPC.
2. Every pure calculation (KPIs, forecasts, rules) gets unit tests including boundary dates.
3. Every user-facing flow gets at least one Playwright happy path and one permission-denied path.
4. Any TypeScript mirror of database rules gets a drift test that parses the migration.
