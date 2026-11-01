# Stride — Product Requirements Document

_Living document. Last updated: 2026-11-03 (Phase 5)._

## 1. Problem

A Delivery Head is accountable for many projects, teams, clients and commitments at once, but the
evidence they need is scattered across trackers, spreadsheets, timesheet tools and status decks.
Problems surface as escalations instead of as early signals, and status reporting consumes the time
that should go into acting on it.

## 2. Product vision

**Stride** is an organization-wide operating platform that gives
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

**US-1.13 Invitation emails.** Invitees receive a one-click sign-in link, land on a welcome page that
accepts the invitation and lets them set a password. Admins see when an invitation was emailed and can resend.

**US-1.14 Password reset.** "Forgot password?" emails a reset link (no account enumeration); signed-in
users can change their password on the profile page.

**US-1.15 Organization time zone.** "Today" for overdue and due-soon metrics, and all displayed
timestamps, use the organization's IANA time zone.

**US-1.16 Custom roles.** Administrators with `org.roles.manage` create roles from the permission
catalogue, edit their permissions and delete unused ones; system roles are fixed.

**US-1.17 Confidential clients.** Confidential clients are visible only to holders of
`client.confidential.read`, the account owner and people assigned to its projects.

**US-1.18 Departments and reporting lines.** Departments with heads; each member can have a manager;
the org chart shows reporting lines; cycles are rejected.

**US-1.19 Import / export.** Projects and members export to CSV; projects import from CSV after a
validated preview (all-or-nothing); invitations can be created in bulk from CSV.

### 5.3 Phase 2 user stories (work management)

- **US-2.1 Programs.** Group related projects; see their health and milestones together.
- **US-2.2 Milestones and baselines.** Track milestones, take a baseline, see slippage in days.
- **US-2.3 Workflow.** Configure states, categories, WIP limits and optional transition rules.
- **US-2.4 Work items.** Epics, features, stories, tasks, sub-tasks, bugs, incidents and change requests
  with parent rules, acceptance criteria, estimates, dependencies, links, comments and activity.
- **US-2.5 Backlog and board.** Prioritised backlog by sprint; Kanban board with drag and drop
  (keyboard accessible) and live updates.
- **US-2.6 Sprints.** Plan, start (commitment recorded), complete (unfinished work moves), burndown,
  velocity and commitment reliability.
- **US-2.7 Status reports.** Publish immutable reports combining narrative with evidence.
- **US-2.8 Command Center.** Overdue, due-soon and slipped milestones; sprint completion; blocked work.

### Phase 3 — Workforce (delivered 2026-11-01)

- **US-3.1 Calendars.** HR defines work calendars (working days, hours per day) and holidays, and
  assigns a calendar to anyone who doesn't follow the default.
- **US-3.2 Leave.** Employees see their balances and request leave; days are counted from their
  calendar. Their manager (or HR) approves or rejects with a reason and sees milestones due during the
  leave. Colleagues see only that someone is away.
- **US-3.3 Attendance.** Employees check in and out; missed days are fixed by a correction their manager
  approves. Managers see exceptions for their reports.
- **US-3.4 Timesheets.** Employees log weekly time against projects, work items or internal categories
  and submit it; managers approve or return it and see who hasn't submitted.
- **US-3.5 Resource planning.** Resource managers allocate people to projects by date and percentage,
  and see capacity, over-allocation and utilisation for any range up to six months.
- AC: Nobody can approve their own leave, correction or timesheet; HR data is visible only to the
  person, their manager and HR (pgTAP `04_workforce`).

### Phase 4 — Delivery governance (delivered 2026-11-02)

- **US-4.1 RAID register.** Project teams record risks, assumptions, issues and dependencies in one
  register with an owner, due date and response. Risks are scored probability × impact; closing,
  resolving or accepting an item needs a note.
- **US-4.2 Decisions and actions.** Decisions are proposed, then accepted or rejected; once recorded they
  are locked and can only be superseded by a newer decision. Actions have one owner and a due date;
  owners can complete their own.
- **US-4.3 Escalations.** A manager raises an escalation to a named person with at least one piece of
  evidence and a response deadline. The recipient acknowledges; it shows as overdue until resolved.
- **US-4.4 Change requests.** Drafts are editable; submitted requests are locked and decided by an
  approver who is not the requester. Rejection needs a reason.
- **US-4.5 Releases and quality gates.** Releases carry gates (five by default, more can be added). A
  release can't be approved until every required gate is passed, or waived by an approver with a reason.
- **US-4.6 Client records.** Contacts and contracts (terms and dates) sit under the client and are
  visible only to people who can see that client, including confidential ones.
- **US-4.7 Documents.** Versioned documents (Markdown and/or link), internal or shared with the client.
- **US-4.8 Executive report.** One page of live governance numbers, red projects with no recorded
  recovery action, top risks, escalations, releases in flight and contracts nearing their end, copyable
  as Markdown.
- AC: governance records are visible only on projects the viewer can read and only with the matching
  permission; recorded decisions, submitted changes and document versions can't be edited; nobody
  decides their own change request (pgTAP `05_governance`).

### Phase 5 — Financial and portfolio intelligence (delivered 2026-11-03)

- **US-5.1 Rates.** Finance keeps a rate card by job title and personal overrides, each effective-dated.
  Hours with no rate are counted and flagged, never priced at zero.
- **US-5.2 Budgets and baselines.** Finance drafts a budget by category; someone else approves it as the
  baseline. Revisions keep the earlier baselines.
- **US-5.3 Actuals and forecasts.** Labour comes from approved timesheets, other costs from an
  append-only ledger (mistakes are reversed, not edited). Forecasts (allocations, monthly spend) are
  shown separately from actuals.
- **US-5.4 Variance and margin.** Each project shows estimate at completion, variance to the baseline and,
  where revenue is planned, margin to date and forecast margin.
- **US-5.5 Portfolio view.** The Delivery Head sees budget, actual, estimate, variance and margin across
  projects, most at-risk first, rolled up by client and program.
- AC: finance data needs finance permissions and client visibility; rates are readable only by finance
  managers and never returned by a report; approved budgets and recognised revenue can't be edited;
  nobody approves their own budget (pgTAP `06_finance`).

### Phase 6 — AI agents (delivered 2026-11-04)

- **US-6.1 Project health.** A project manager runs the Project Health agent on a project and gets
  findings (overdue milestones, blocked work, high risks, overdue escalations, stale health) each
  citing the records behind it, with recommended next steps.
- **US-6.2 Portfolio attention.** A delivery head runs Delivery Intelligence and gets the in-flight
  projects ranked by what needs attention, limited to projects they can see.
- **US-6.3 Draft requirements.** A product owner pastes notes; the Requirements agent drafts stories with
  acceptance criteria and open questions. Nothing is created until a different person approves each draft.
- **US-6.4 Delivery brief.** The Reporting agent writes a short brief for a project or the portfolio; the
  Command Center shows the latest one with a link to its sources.
- **US-6.5 Control.** An operator switches agents on per organization and per agent, picks a provider and
  model, sets a monthly token cap, edits prompts as new versions and activates a version only after it
  passes the evaluation; rollback is activating an earlier passing version.
- AC: an agent never reads more than its caller; text in data can't make it call a tool or act; a run's
  content is visible only to the person who ran it; nobody approves their own request; runs stop at the
  token cap and when either switch is off (pgTAP `07_ai_agents`, unit `agents.test.ts`).

### 5.2 Out of scope for Phase 1

Work items, sprints, milestones, attendance, leave, timesheets, financials, RAID, releases,
documents, notifications, AI agents, workflows, integrations. Work management shipped in Phase 2,
workforce in Phase 3, governance in Phase 4, finance in Phase 5 and AI agents in Phase 6; the rest is in `docs/ROADMAP.md`.

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
- Time from a project turning Red to a recorded recovery action. Phase 4 lists red projects with nothing
  recorded since they turned red (executive report); the elapsed time to the first action is not yet trended.
- Weekly active Delivery Head / manager users.
