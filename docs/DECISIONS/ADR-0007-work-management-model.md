# ADR-0007: Work management data model

**Status:** Accepted · 2026-10-27

## Context
Phase 2 adds programs, milestones with baselines, configurable workflows, a work-item hierarchy
(Portfolio → Program → Project → Epic → Feature → Story → Task/Subtask, plus bugs, incidents and change
requests), dependencies, backlog, Kanban, sprints, burndown and velocity.

## Decisions

1. **One `work_items` table** with a `type` column (epic, feature, story, task, subtask, bug, incident,
   change_request) and a `parent_id`. Allowed parent types are a fixed rule set enforced by trigger
   (e.g. a story's parent may be a feature or epic). One table keeps boards, backlogs, search and
   reporting uniform; type-specific fields (severity) are nullable columns.
2. **Human-readable keys** `<PROJECT-CODE>-<n>` from a per-project counter table. Keys never change,
   even if the project code does.
3. **Per-organization workflow states** (`workflow_states`) with a fixed *category* (`todo`,
   `in_progress`, `done`). Metrics use categories, so renaming or adding states never breaks reports.
   Optional transition rules (`workflow_transitions`): if a state has outgoing rules, only those moves
   are allowed; otherwise any move is allowed. Enforced by trigger.
4. **Ordering** by a floating-point `rank`; moves take the midpoint between neighbours.
5. **Milestones** belong to projects and carry `baseline_due_date`. Taking a baseline snapshots the
   project dates and milestones into `project_baselines` (immutable history) and copies current due
   dates into `baseline_due_date`, so schedule variance is a simple subtraction.
6. **Sprints** belong to a project; at most one active sprint per project. Starting a sprint stores the
   committed scope; completing it stores completed points and moves unfinished items back to the backlog
   (or into a chosen next sprint).
7. **Burndown without a scheduler:** a trigger maintains `sprint_daily_stats` (scope and done points per
   day, in the organization's time zone) whenever items change. Days without changes carry the previous
   value forward when charting.
8. **Activity** for work items is written by trigger to `work_item_activity`, readable by anyone who can
   read the item (unlike the org audit log, which needs `audit.read`).
9. **Permissions:** `work.read`, `work.create`, `work.update`, `work.archive`, `sprint.manage`,
   `milestone.manage`, `program.manage`, `workflow.manage`, combined with project visibility as in
   Phase 1. Client stakeholders see milestones of shared projects but not internal work items.
10. **Client data access on the board** uses TanStack Query with the browser Supabase client (RLS
    applies) and Supabase Realtime for live updates; all writes still go through validated server
    actions / RPCs.

## Consequences
- Adding a work item type later is a migration (enum + parent rules) rather than new tables.
- Burndown history begins when a sprint starts; it is not reconstructed for earlier periods.
- Integrations (Phase 7) will attach pull requests, builds and releases through `work_item_links`,
  which already supports manually added links.
