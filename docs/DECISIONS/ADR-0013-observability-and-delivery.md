# ADR-0013: Observability and delivery pipeline

**Status:** Accepted · 2026-11-06

## Context
Phases 1–7 shipped features; Phase 8 makes them operable. The app runs on a serverless host with a
managed Postgres, so there is no machine to log into. We need to see failures, trace slow requests
when asked to, know the app is alive, ship schema changes safely, and have written procedures for
the bad days. None of it may widen what data leaves the system.

## Decisions

1. **Structured logs, redacted by construction.** One JSON object per line through a single logger.
   Any field named like a secret, token, password, cookie, authorization, API key or signature is
   replaced with `[redacted]` at any depth; errors are reduced to name and message (no stack, no
   cause chain); strings, arrays and depth are capped. A caller passing the wrong object cannot leak
   a credential into the log stream.
2. **Tracing is opt-in and vendor-neutral.** OpenTelemetry over OTLP/HTTP via `@vercel/otel`, loaded
   only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Without it the SDK is never imported and our
   `withSpan` helper uses the API's no-op tracer. Spans carry names and counts, never tenant data.
   Optional OpenTelemetry peers are pinned to the ranges `@vercel/otel` supports.
3. **`onRequestError` is the single place unhandled server errors are logged**, with route, render
   source and digest so a user report can be matched to a log line.
4. **A public `/api/health`** that answers whether the process is up and Supabase Auth responds, and
   nothing else. It exposes no tenant data and no version beyond a short commit hash.
5. **CI proves the database and the types agree.** After pgTAP, CI regenerates `database.types.ts`
   from the migrated database and fails on any difference, so code can't ship against a stale schema.
   Production dependencies are audited at high severity.
6. **Migrations deploy from a separate, reviewer-gated workflow**, triggered only by a successful CI
   run on `main`. Credentials live in the `production` environment, so only that job can read them,
   and a person approves each deploy. Migrations stay forward-only.
7. **Procedures are written down** in `docs/RUNBOOKS.md`, including a restore drill with a log, because
   an untested backup is a hope, not a control.

## Consequences
- With no collector configured, tracing costs nothing and exports nothing.
- Alert rules are not in the repo: they depend on the monitoring product. The runbooks name the
  signals (health endpoint, stale scheduler heartbeat, `level:error` log volume).
- Preview databases per pull request need Supabase Branching; until then PRs run against the local
  stack CI starts.
- The deploy workflow is untested until the `production` environment and secrets exist.

## Not decided here
Dual approval for privileged role grants, MFA enforcement, configurable retention and legal hold
change the schema and authorization model and get their own ADR when built.
