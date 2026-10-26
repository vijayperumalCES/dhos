# DHOS — Design System and Navigation

## Foundations

- **Components:** shadcn/ui (`radix-nova` style) on Radix primitives in `src/components/ui`.
- **Tokens:** CSS variables in `src/app/globals.css` (OKLCH). Brand primary is indigo
  (`--primary`). Light and dark themes are both defined explicitly; theme follows the system and can
  be overridden from the user menu.
- **Status colours (reserved):** `--health-green`, `--health-amber`, `--health-red`, `--health-none`.
  Used only for RAG health, always paired with a text label (`HealthBadge`). Never reused as a
  categorical series colour.
- **Demo:** `--demo` / `--demo-foreground` for the demo-data banner.
- **Charts:** `--chart-1…5`. Single-series charts use `--chart-1`. Bars are direct-labelled, with a
  hover tooltip; an `aria-label` summarises values for screen readers.
- **Typography:** Geist Sans / Geist Mono; tabular numbers for metrics and dates.

## Shared building blocks (`src/components/common`)

| Component | Use |
|---|---|
| `PageHeader` | Title, description, breadcrumbs, meta badges, actions — every page |
| `FilterBar` | URL-driven search + select filters (shareable, bookmarkable views) |
| `Pagination` / `withParams` | Link-based pagination preserving filters |
| `EmptyState` / `AccessDenied` | Empty and permission states |
| `HealthBadge` / `StatusBadge` / `ArchivedBadge` | Consistent status display |
| `AuditTrail` | Field-level change history |
| `AddMemberDialog` / `RemoveMemberButton` | Project and team membership |
| `ArchiveToggle` | Confirmed archive / restore |
| `forms/fields.tsx` | RHF + Zod field wrappers with accessible errors |

The authenticated `(app)` route group has `loading.tsx` (skeleton), `error.tsx` (non-leaky error with
digest) and `not-found.tsx`.

## Navigation

Collapsible sidebar (icon rail when collapsed; sheet on mobile) grouped as **Delivery**, **People**,
**Governance**, **Automation**, **Organization**. Items are filtered by permission. Modules not yet
built appear muted with a phase badge (e.g. `P3`) and open an honest "Not built yet" page — they never
show fake data.

Top bar: sidebar toggle, global search (`/` to focus), quick-create menu (permission-filtered),
notification popover (states that notifications arrive in Phase 7). Organization switcher and user
menu (profile, theme, sign out) live in the sidebar header/footer.

## Accessibility checklist

Skip-to-content link; all inputs labelled; `aria-invalid` + described errors; sortable headers expose
`aria-sort`; colour never the only signal; dialogs are Radix (focus-trapped, Esc to close); visible
focus rings; layouts tested at 375px without horizontal scroll.
