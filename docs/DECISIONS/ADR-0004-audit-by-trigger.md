# ADR-0004: Audit log and status history written by triggers

**Status:** Accepted · 2026-10-26

## Context
Audit records must not depend on every code path remembering to write them, and must be tamper-resistant.

## Decision
- A generic `private.audit_row_change()` AFTER trigger on every Phase 1 business table records
  inserts, deletes and field-level diffs for updates, with `auth.uid()` as actor.
- `project_status_history` is written by an AFTER trigger on status/health changes.
- Reasons are passed through the transaction-local setting `dhos.change_reason` from RPCs.
- `audit_logs` has no update/delete grants and a trigger that raises on update/delete (except
  cascade during organization deletion).

## Consequences
- Audit cannot be skipped by any client, including future agents and integrations.
- Audit volume grows with writes; partitioning by month is a Phase 8 consideration.
- Actor is null for seed/system operations — displayed as "system".
