# ADR-0003: Disable Cache Components; render tenant data dynamically

**Status:** Accepted · 2026-10-26

## Context
`create-next-app` 16.4 enables `cacheComponents` and `partialPrefetching`. Every DHOS page depends
on the signed-in user, their organization and their permissions. A mis-keyed `use cache` entry
could serve one tenant's data to another, and the Suspense-everywhere requirement adds friction
with little benefit for an authenticated internal app.

## Decision
Disable `cacheComponents` and `partialPrefetching`. Pages that read cookies render dynamically.
Mutations call `revalidatePath`. Per-request de-duplication uses `React.cache` only.

## Consequences
- Zero risk of cross-tenant server cache leakage in Phase 1.
- Re-evaluate for genuinely public or tenant-agnostic content (e.g. marketing pages, reference data)
  where `use cache` keyed on non-sensitive identifiers is safe.
