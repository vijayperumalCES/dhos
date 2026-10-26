# ADR-0005: Shared-schema multi-tenancy with composite foreign keys

**Status:** Accepted · 2026-10-26

## Context
Options: database-per-tenant, schema-per-tenant, or shared schema with tenant column + RLS.

## Decision
Shared schema. Every tenant-owned table has `organization_id`. Parents declare
`unique (id, organization_id)`; children reference `(child_fk, organization_id)` so cross-tenant
references are impossible at the foreign-key level, independent of policies. Roles are per tenant,
copied from global templates at organization creation.

## Consequences
- One migration path, simple operations, works with Supabase RLS.
- Every query/policy must carry `organization_id`; pgTAP isolation tests are mandatory per new table.
- Very large tenants or data-residency demands may later require a dedicated project — out of scope.
