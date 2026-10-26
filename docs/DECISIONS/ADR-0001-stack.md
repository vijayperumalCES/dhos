# ADR-0001: Next.js App Router + Supabase + TypeScript strict

**Status:** Accepted · 2026-10-26

## Context
The brief mandates Next.js, TypeScript, Supabase and an extensible agent architecture. The repo was empty.

## Decision
- Next.js 16.4 App Router, React 19, Server Components by default, Server Actions for mutations.
- Supabase (Postgres 17, Auth, PostgREST) via `@supabase/ssr`; local stack via Supabase CLI.
- TypeScript strict; generated database types (`pnpm db:types`).
- pnpm; app on port 3100 (3000 was occupied on the development machine).
- Next 16 renames middleware to `proxy.ts`; we use it only for session refresh and optimistic redirects.

## Consequences
- Data access stays on the server; the browser never holds a privileged key.
- Next 16 specifics (proxy, typed `PageProps`/`LayoutProps`, `next typegen`) must be followed;
  the bundled docs in `node_modules/next/dist/docs/` are the reference.
