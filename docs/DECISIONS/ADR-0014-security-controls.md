# ADR-0014: Security controls — dual approval, MFA enforcement, legal hold

**Status:** Accepted · 2026-11-06

## Context
Organization Administrators can assign roles, including to themselves, and the only safeguard was an
audit entry written afterwards (ADR-0004, AUTHORIZATION.md). Organizations with stricter needs also
want to require a second authentication factor and to stop automatic deletion while a legal matter
is open. All three must be optional (off by default), enforced where the data is, and changeable only
through audited functions.

## Decisions

1. **Dual approval is a rule about roles that matter, not about every role.** A role is *privileged*
   when it carries `org.settings.manage`, `org.members.manage`, `org.roles.manage`, `finance.manage` or
   `finance.approve` (`private.is_privileged_permission`; `src/lib/domain/security.ts` mirrors the list
   and a unit test fails on drift). With the control on:
   - `set_member_roles`, `invite_member` and `accept_pending_invitations` refuse to *add* a privileged
     role (removal is always allowed; an invitation written before the control was switched on has the
     privileged role dropped on acceptance, not honoured).
   - `update_role` refuses to add a privileged permission to a role that members already hold, since that
     would grant it to all of them at once.
   - The only way in is `request_role_grant` then `decide_role_grant` by a **different** administrator
     (`org.members.manage`). Self-approval is refused even for someone with MFA. Requests expire after
     7 days, one pending request per member and role, every step audited with both people named.
   - Switching it on needs at least two active people who can manage members, so the control can't
     lock the organization out of its own approvals.
2. **MFA is enforced in the database helpers every policy already uses.** `private.active_membership_id`
   and `has_permission` (and `my_permissions`) additionally require `private.mfa_ok(org)`: true when the
   organization does not require MFA, or the session's JWT carries `aal = aal2` (a second factor was
   verified in this session). A session at `aal1` is therefore simply not a member of that organization
   and sees none of its data through any path (PostgREST, server actions, RPCs), not only through our UI.
   The one exception is a member's own `organization_memberships` row, which the existing policy lets
   them read.
   - `mfa_required_organizations()` is deliberately *not* gated: it tells the app that an organization
     exists and requires MFA, so `getOrgContext` can send the person to `/mfa` instead of onboarding.
   - Requiring MFA needs your own session to be `aal2`, so an administrator cannot lock themselves out
     by switching it on without having an authenticator.
   - Factor type is TOTP (Supabase Auth). WebAuthn and phone are not enabled.
3. **A legal hold suspends the retention job for that organization**, with a mandatory reason, who and
   when recorded. The audit log is never purged, with or without a hold.
4. **Retention windows are editable** (`set_retention_windows`, 7 to 3650 days each), audited with the
   before and after values. They live in the existing `retention` job's config.
5. **No new permissions.** Security settings use `org.settings.manage`; requests and decisions use
   `org.members.manage`. The new columns are not in the column-level UPDATE grant on
   `organization_settings`, and `role_grant_requests` has no write grant: the functions are the only
   writers.

## Consequences
- A single administrator can still switch dual approval **off** (audited) and then grant directly.
  The control protects against mistakes and unilateral grants made through the normal paths; it is not
  a defence against an administrator who is willing to change the setting first. Requiring approval to
  *lower* the control is a possible later hardening.
- With MFA on, losing an authenticator locks that person out until an operator removes the factor in
  Supabase Auth (see RUNBOOKS.md). The Stride administrators cannot remove a factor.
- Policies that don't use the shared helpers (a member reading their own notifications, for example)
  are not gated; they expose only the person's own rows.
- Hosted Supabase must have TOTP MFA enabled (Authentication → Multi-Factor); `supabase/config.toml`
  now enables it locally.
- Each request to `mfa_required_organizations` adds one query per page load for signed-in people.

## Not decided here
Break-glass access, per-role MFA (only privileged roles), session length limits, and IP allow-lists.
