# ADR-0002: Enforce authorization in Postgres (RLS + RPC)

**Status:** Accepted · 2026-10-26

## Context
Multiple access paths will exist (UI, server actions, future agents, integrations). Authorization
written only in application code is easy to bypass and duplicates logic.

## Decision
- Every table has RLS; `anon` has no privileges; `authenticated` gets explicit table/column grants.
- The app uses only the user-scoped Supabase client (publishable key + user JWT). No service-role
  key in the application runtime.
- Columns with governance meaning (status, health, archive, roles, membership status) are not
  writable via table privileges; SECURITY DEFINER RPCs check permissions, require reasons and let
  triggers write history.
- Permission helpers (`has_permission`, `can_read_project`, …) are SECURITY DEFINER with an empty
  `search_path` and only ever answer about the calling user.
- Server actions re-check permissions for friendly errors; the UI hides unavailable actions. Neither
  is the boundary.

## Consequences
- pgTAP tests are the primary authorization tests.
- Future AI agents inherit the same boundary by running with a user (or least-privilege principal) JWT.
- Complex cross-table checks cost a function call per row; acceptable at Phase 1 scale, revisit with
  indexes/materialised permission sets if needed.
