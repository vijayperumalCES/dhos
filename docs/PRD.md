# Stride — Product Requirements Document

_Living document. Last updated: 2026-10-26 (Phase 1)._

## 1. Problem

A Delivery Head is accountable for many projects, teams, clients and commitments at once, but the
evidence they need is scattered across trackers, spreadsheets, timesheet tools and status decks.
Problems surface as escalations instead of as early signals, and status reporting consumes the time
that should go into acting on it.

## 2. Product vision

**Stride** (formerly DHOS, the Delivery Head Operating System) is an organization-wide operating platform that gives
the Delivery Head and their managers one governed, evidence-based view of portfolio delivery —
projects, people, commitments, quality, finances and client governance — and progressively automates
the recurring work around it with workflows and permission-bounded AI sub-agents, while keeping
humans in charge of consequential decisions.

## 3. Principles

1. **Evidence over assertion.** Every number has a definition, a source and a freshness. Forecasts
   are never shown as actuals; demo data is always labelled.
2. **Least privilege by default.** Attendance, financial, employee and client data have separate
   access policies. Administrators configure; they do not automatically see confidential data.
3. **Governed change.** Lifecycle transitions, health ratings and role changes are validated,
   reasoned and audited.
4. **Humans approve consequential actions.** AI recommends; people decide.
5. **No placeholder presented as a capability.** Unbuilt modules say so.

## 4. Personas

See `docs/AUTHORIZATION.md` for the full role catalogue. Primary Phase 1 personas:

| Persona | Primary need in Phase 1 |
|---|---|
| Delivery Head | Portfolio health at a glance; spot red/overdue/stale projects; govern lifecycle |
| Program / Project Manager | Create and maintain projects; record health with reasons; manage project team |
| Organization Administrator | Set up the organization, invite members, assign roles, review audit log |
| Developer / QA / Engineering roles | See the projects they work on |
| Client stakeholder | See only explicitly shared projects |

## 5. Phase 1 scope (this release)

### 5.1 User stories and acceptance criteria

**US-1.1 Sign up / sign in.** As a user I can create an account and sign in with email and password.
- AC: Password policy ≥10 chars with upper, lower and digit (enforced by Supabase Auth and the form).
- AC: Wrong credentials show a generic message that does not reveal whether the email exists.
- AC: Signed-out visitors to any app page are redirected to sign in and returned afterwards (same-origin only).

**US-1.2 Create organization.** As a new user I can create an organization and become its Organization Administrator and Delivery Head.
- AC: Slug is unique and validated; at most 5 organizations per user per day.
- AC: System roles are copied into the new organization.

**US-1.3 Invite and manage members.** As an Organization Administrator I can invite people by email with roles, change roles, and suspend/reactivate memberships.
- AC: Invitations are accepted automatically when the invitee signs in with that verified email.
- AC: The last active administrator cannot be demoted or suspended; administrators cannot suspend themselves.
- AC: Suspended members lose all data access immediately (enforced by RLS).
- AC: No invitation email is sent in Phase 1 and the UI says so.

**US-1.4 Switch organization.** As a member of several organizations I can switch the active organization.
- AC: Only organizations with an active membership can be selected.

**US-1.5 Manage projects.** As a user with the right permissions I can create, view, edit, archive and restore projects.
- AC: Project code unique per organization, 2–20 chars `[A-Z0-9-]`.
- AC: New projects start Proposed / Not assessed.
- AC: List supports search, filters (status, health, client, manager, team, archive), sorting and pagination; filters are URL parameters.
- AC: Archiving hides from lists and metrics but keeps history; restore is possible.

**US-1.6 Govern lifecycle.** As a manager I can move a project through `Proposed → Approved → Planning → Active → On hold → Completed | Cancelled`.
- AC: Only valid next stages are offered; invalid transitions are rejected by the database.
- AC: On hold and Cancelled require a reason. Completed sets the actual end date.
- AC: Each change is recorded in project status history and the audit log with the acting user.

**US-1.7 Record health.** As a manager I can set Green / Amber / Red health.
- AC: Amber and Red require a reason. Re-confirming a rating resets its age.

**US-1.8 Manage project members.** As a manager I can add and remove project members with a project role and indicative allocation.
- AC: Project members gain read access to the project (resource-level authorization).

**US-1.9 Manage teams.** I can create, edit, archive teams, set a lead and manage team membership.

**US-1.10 Manage clients.** I can create, edit and archive clients (minimal record).

**US-1.11 Delivery Command Center.** As a Delivery Head I see portfolio KPIs computed from persisted data.
- AC: KPIs: in-flight/active projects, projects at risk, past target end, due in 30 days, stale health, health distribution, lifecycle distribution, changes and deteriorations in period, attention list.
- AC: Each KPI exposes definition, formula, source, period, freshness, threshold and limitations.
- AC: Filters: reporting period, client, manager, team.
- AC: Metrics that need unbuilt modules are listed as "Not yet measured", with no value.
- AC: Demo tenants show a "Demo data" banner on every page.

**US-1.12 Audit.** As an auditor-role user I can view an append-only audit log of changes.

### 5.2 Out of scope for Phase 1

Work items, sprints, milestones, attendance, leave, timesheets, financials, RAID, releases,
documents, notifications, AI agents, workflows, integrations. See `docs/ROADMAP.md`.

## 6. Non-functional requirements

| Area | Requirement |
|---|---|
| Security | RLS on every tenant table; no service-role key in the app runtime; server-side re-validation of every mutation |
| Privacy | No personal data in URLs or cache keys; directory visibility is a separate permission |
| Accessibility | Keyboard navigable, skip link, labelled controls, colour never the only signal (RAG badges carry text) |
| Responsiveness | Usable at 375px width without horizontal scrolling |
| Auditability | Database-trigger audit for all Phase 1 entities; append-only |
| Observability | Structured server logging of unexpected DB errors (OpenTelemetry in Phase 8) |

## 7. Success measures (to be instrumented)

- Share of in-flight projects with a health rating younger than the staleness threshold.
- Time from a project turning Red to a recorded recovery action (needs Phase 4).
- Weekly active Delivery Head / manager users.
