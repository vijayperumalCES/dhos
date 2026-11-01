# ADR-0009: Delivery governance data model and access

**Status:** Accepted · 2026-11-02

## Context
Phase 4 adds the records a delivery organization is held to account with: risks, assumptions, issues
and dependencies (RAID), decisions, actions, escalations with evidence and deadlines, change
requests, release governance with quality gates, client contacts and contracts, and versioned
documents. Most of it is project-scoped and internal, some of it is commercially sensitive
(contracts, confidential clients), and several records only mean something if they can't be edited
after the fact (an accepted decision, an approved change, a release sign-off).

## Decisions

1. **One RAID table.** `raid_items` holds risks, assumptions, issues and dependencies, distinguished by
   `type`. They share an owner, a due date, a status flow and a reporting need ("what is open and
   overdue on this project?"); four tables would have meant four copies of every screen, filter and
   policy. Type-specific rules are check constraints: a risk needs probability and impact (1–5, score
   is their product), an issue may carry an impact, only risks can be `accepted`, and resolving,
   closing or accepting an item needs a note.
2. **Access follows the project, not a new boundary.** Every project-scoped table is readable with
   `governance.read` (or `release.read`, `document.read`) on a project the caller can read, and
   writable with the matching `*.manage` permission on a project the caller can read. Organization
   administrators and client stakeholders get none of these by default. The one exception is
   documents marked `client`, which any member who can read the project can open, so a client can be
   given a charter or a report without being given the internal register.
3. **Immutability where it matters.** An accepted or rejected decision can't be edited; the only
   change allowed is accepted → superseded, pointing at the decision that replaced it. A change
   request is editable only while it is a draft. Document versions have no update or delete grant.
   Escalation evidence is append-only. A trigger enforces each rule, so no caller can bypass it.
4. **State changes go through RPCs, content through grants.** Status columns of escalations, change
   requests, releases, gates and documents are not writable through table privileges. The RPCs check
   permission and project visibility, record who and when, and raise a typed error the UI can
   explain.
5. **Escalations need evidence and a deadline.** `raise_escalation` rejects a request with no evidence,
   a deadline in the past, or a recipient who couldn't see the project's governance records. The
   recipient acknowledges; the recipient or any governance manager resolves with a note. "Overdue" is
   an open or acknowledged escalation past `respond_by`.
6. **Change requests are approved by someone else.** `decide_change_request` needs `change.approve`
   and refuses the requester, even with the permission. Rejection needs a reason. Approval does not
   edit milestones or baselines; it records the decision and the impact (schedule days, effort hours,
   scope and risk text). Money is deliberately absent until Phase 5.
7. **Releases are gated.** A release has quality gates (defaults: tests, critical defects, security
   review, UAT, rollback plan; more can be added or removed until the release is approved). A release
   can only move to `approved` when every required gate is passed or waived. Waiving needs
   `release.approve` and a reason. Failing a required gate on an approved release drops it back to
   `in_review`. Open critical and high defects are shown beside the gates as evidence, not enforced:
   the organization decides what "critical" blocks.
8. **Contacts and contracts inherit client visibility.** `client_contacts` and `client_contracts`
   are visible exactly when the client is (`private.can_see_client`), so a confidential client's
   contacts and contracts are hidden from everyone who can't see the client. Writes need
   `client.manage` and the same visibility, minus the "assigned to a project" route that confidential
   clients allow for reading. Contracts carry type, status, dates and notice period, no values.
9. **Documents are versioned text or links.** A document has a type, a visibility (`internal` or
   `client`) and numbered, immutable versions holding Markdown content and/or a URL. File uploads need
   storage, antivirus and retention decisions and wait for Phase 8.
10. **Reports are computed, not stored.** The executive governance report is assembled on request from
   rows the viewer can already see, so it can never show more than the viewer is allowed to read.
   "Red with no recovery action" compares the time the project turned red (status history) with the
   first action, escalation or RAID item raised after that.
11. **New permissions:** `governance.read`, `governance.manage`, `change.approve`, `release.read`,
    `release.manage`, `release.approve`, `document.read`, `document.manage`.

## Consequences
- Because an assigned project member with `governance.read` sees the whole register, a risk the team
  shouldn't see needs a separate confidentiality flag on RAID items. Not built.
- Contracts have no monetary value and the gate catalogue is per release, not an organization
  template. Both are Phase 5 / Phase 7 candidates.
- Client-facing reporting is limited to Phase 2 status reports and `client`-visibility documents.
  Scheduled, branded client reports need the Phase 7 scheduler.
- There is no meeting record. Decisions and actions stand on their own; a `meeting` entity would be
  a thin wrapper to add later.
