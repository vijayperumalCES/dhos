# DHOS — Delivery Head Operating System

An organization-wide operating platform for a Delivery Head: one governed, evidence-based view of
projects, teams, clients and commitments, built to grow into workforce, governance, financial, AI
agent and automation modules.

**Current release: Phase 1 — Foundation and Delivery Command Center.**
See [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md) for exactly what works today.

## Stack

Next.js 16 (App Router, Server Components/Actions) · React 19 · TypeScript strict · Tailwind CSS v4 ·
shadcn/ui (Radix) · React Hook Form + Zod · Recharts · Supabase (Postgres 17, Auth, RLS) ·
Vitest · pgTAP · Playwright.

## Quick start

```bash
pnpm install
cp .env.example .env.local
pnpm db:start      # local Supabase (Docker)
pnpm db:reset      # migrations + labelled demo seed
pnpm dev           # http://localhost:3100
```

Demo accounts (local only, password `DemoPass123`):

| Email | Role |
|---|---|
| `priya@northwind.example` | Delivery Head + Organization Admin |
| `arjun@northwind.example` | Project Manager (assigned projects only) |
| `mei@northwind.example` | Program Manager |
| `dev@northwind.example` | Developer |
| `omar@northwind.example` | Organization Admin only (no project data) |
| `claire@contoso.example` | Client stakeholder (one shared project) |
| `alex@globex.example` | Owner of a second tenant (isolation demo) |

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Run / build / serve |
| `pnpm typecheck` / `pnpm lint` | Static checks |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:db` | Database authorization tests (pgTAP) |
| `pnpm test:e2e` | End-to-end tests (Playwright) |
| `pnpm test:all` | All of the above |
| `pnpm db:reset` / `pnpm db:types` | Reset local DB / regenerate TS types |

## Documentation

| Doc | Contents |
|---|---|
| [PRD](docs/PRD.md) | Vision, personas, Phase 1 user stories and acceptance criteria |
| [Architecture](docs/ARCHITECTURE.md) | System design, code layout, request lifecycle |
| [Database](docs/DATABASE.md) | Conventions, ER model, functions, retention |
| [Authorization](docs/AUTHORIZATION.md) | Permission catalogue, role matrix, enforcement map |
| [Agent architecture](docs/AGENT_ARCHITECTURE.md) | AI sub-agent design (Phase 6, not built) |
| [Workflows](docs/WORKFLOWS.md) | Hooks (Phase 1 triggers), event model and engine design (Phase 7) |
| [Roadmap](docs/ROADMAP.md) | Phases 1–8 |
| [Implementation status](docs/IMPLEMENTATION_STATUS.md) | What is done, gaps, test inventory |
| [Testing](docs/TESTING.md) | Strategy and rules |
| [Deployment](docs/DEPLOYMENT.md) | Local, Supabase hosted, Vercel, replacing demo data |
| [Design system](docs/DESIGN_SYSTEM.md) | Tokens, shared components, navigation, accessibility |
| [Decisions](docs/DECISIONS/README.md) | Architecture decision records |

## Security posture (summary)

Row Level Security on every table; no service-role key in the app; governed fields change only
through permission-checked RPCs; lifecycle rules and audit logging enforced by database triggers;
append-only audit log; demo data always labelled. Details in `docs/AUTHORIZATION.md`.
