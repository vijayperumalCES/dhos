# Stride — Authorization

_Last updated: 2026-10-26 (Phase 1). Authoritative source: `supabase/migrations/20261026000200_authorization.sql`
and `…000400_rls_and_grants.sql`. `tests/unit/authorization-matrix.test.ts` fails if the TypeScript
mirror (`src/lib/domain/permissions.ts`) drifts from the SQL._

## 1. Model

- **Tenant isolation:** every row belongs to an organization; RLS admits a row only if the caller has
  an *active* membership in a non-archived organization.
- **RBAC:** permissions are granted to roles; roles are assigned to memberships. A user may hold
  several roles; permissions are the union.
- **Resource-level authorization:** `project.read_assigned` admits only projects the user manages,
  owns as delivery owner, created, or is a member of. Write permissions on projects apply only to
  projects the user can read.
- **Governed columns:** status, health, archive and roles change only through RPCs that check
  permission and write history. Table privileges do not allow them.
- **The UI is not the boundary.** Hiding a button is convenience; RLS, column grants and RPC checks
  are the enforcement. Server actions re-check permissions for friendly errors only.

## 2. Permission catalogue (Phase 1)

| Key | Grants |
|---|---|
| `org.settings.manage` | Edit organization name, time zone, currency, thresholds |
| `org.members.read` | View internal member directory (name, email, job title, roles) |
| `org.members.manage` | Invite, suspend/reactivate, assign roles |
| `audit.read` | View audit log |
| `client.read` / `client.manage` | View / create-edit-archive clients |
| `project.read_all` | View every project |
| `project.read_assigned` | View assigned projects only |
| `project.create` | Create projects |
| `project.update` | Edit details of visible projects |
| `project.change_status` | Lifecycle transitions and health on visible projects |
| `project.archive` | Archive / restore visible projects |
| `project.members.manage` | Manage members of visible projects |
| `team.read` / `team.manage` | View / manage teams |
| `dashboard.portfolio.view` | Command Center (scoped to visible projects) |

## 3. Role matrix

✓ = granted. (A = assigned projects only.)

| Permission | Org Admin | Delivery Head | Program Mgr | Project Mgr | Eng Mgr | PO/BA | Scrum Master | Dev | QA | Resource Mgr | HR Admin | Finance | Client | AI Operator |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| org.settings.manage | ✓ | | | | | | | | | | | | | |
| org.members.read | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ |
| org.members.manage | ✓ | | | | | | | | | | | | | |
| audit.read | ✓ | ✓ | | | | | | | | | | | | |
| client.read | | ✓ | ✓ | ✓ | ✓ | ✓ | | | | | | ✓ | | |
| client.manage | | ✓ | | | | | | | | | | | | |
| project.read_all | | ✓ | ✓ | | | | | | | ✓ | | ✓ | | |
| project.read_assigned | | | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | | ✓ | |
| project.create | | ✓ | ✓ | ✓ | | | | | | | | | | |
| project.update | | ✓ | ✓ | A | A | A | | | | | | | | |
| project.change_status | | ✓ | ✓ | A | | | | | | | | | | |
| project.archive | | ✓ | | | | | | | | | | | | |
| project.members.manage | | ✓ | ✓ | A | | | | | | | | | | |
| team.read | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | | |
| team.manage | ✓ | ✓ | | | | | | | | ✓ | | | | |
| dashboard.portfolio.view | | ✓ | ✓ | A | A | | | | | | | ✓ | | |

### Notable design choices

- **Organization Administrator ≠ data access.** Admins configure members, roles, teams and settings,
  and read the audit log, but cannot see projects or clients unless also given a delivery role.
  Because admins can assign roles (including to themselves), every role change is audited; dual
  approval for privileged role grants is a Phase 8 item.
- **Client stakeholders** see only projects they are explicitly a member of, only their own project
  membership row, no internal directory and no teams.
- **Finance** reads all projects now so that Phase 5 financial views have context; financial data
  itself will live in separate tables with their own policies.
- **HR Admin** and **AI Agent Operator** have directory access only until their modules exist.

## 4. Enforcement map

| Concern | Where enforced |
|---|---|
| Row visibility | RLS `select` policies via `is_org_member`, `has_permission`, `private.can_read_project_row` |
| Inserts/updates | RLS `with check` + column-level grants |
| Lifecycle validity | BEFORE trigger (cannot be bypassed by any caller, including RPCs) |
| Governed changes | `transition_project_status`, `set_project_health`, `set_project_archived`, `set_member_roles`, `set_membership_status` |
| Tenant consistency of references | Composite foreign keys `(id, organization_id)` |
| Audit immutability | No update/delete grants + trigger that raises on update/delete |
| Rate limits | Org creation (5/user/day), invitations (50/org/hour) in RPCs; Supabase Auth rate limits for sign-in/up |
| Session | `@supabase/ssr` cookies, refreshed in `proxy.ts`; JWT verified with `getClaims()` on every request |
| Redirect safety | `safeNextPath()` only allows same-origin relative paths |

## 5. Tests

`supabase/tests/database/01_tenant_isolation_and_rbac.test.sql` (45 assertions) covers anon denial,
cross-tenant reads/writes, role-scoped visibility, admin-without-data, client isolation, direct
status-update denial, lifecycle and reason rules, cross-tenant FK rejection, invitation flow,
last-admin guard, suspension and audit immutability. Playwright covers the same boundaries through
the UI.

## 6. AI agents (Phase 6 constraint)

Agents will run with the invoking user's (or a dedicated, least-privilege service principal's)
JWT and pass through the same RLS. No agent receives the service-role key. See
`docs/AGENT_ARCHITECTURE.md`.
