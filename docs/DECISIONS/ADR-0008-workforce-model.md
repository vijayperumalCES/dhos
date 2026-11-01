# ADR-0008: Workforce data model and HR access policy

**Status:** Accepted · 2026-11-01

## Context
Phase 3 adds work calendars and holidays, attendance with corrections, leave types, balances and
requests, weekly timesheets, dated resource allocations, and capacity and utilisation. This data is
personal: who is on leave and why, when someone checked in, and how they spent their week. It needs
a stricter visibility rule than delivery data, and approvals that can't be gamed.

## Decisions

1. **A separate HR visibility policy.** A person's attendance, leave requests and balances are visible
   to that person, their direct manager (`manager_membership_id`) and holders of `hr.read`. Timesheets
   follow the same shape with `timesheet.read_all` in place of `hr.read`. Holding `org.members.read`,
   or being on the same project or team, grants nothing here. The rules live in
   `private.can_view_hr_of` and `private.can_view_timesheets_of` and back every RLS policy.
2. **Team availability without detail.** Anyone who can read the directory (`org.members.read` or
   `team.read`) can call `team_availability`, which says only "On leave" (plus half day) and default
   calendar holidays. Leave type, reason and status are never exposed through it.
3. **Reviewers.** Leave, attendance corrections and timesheets are reviewed by the direct manager or by
   an override permission (`hr.manage` for leave and attendance, `timesheet.approve` for timesheets).
   Nobody reviews their own request, even with the override. Rejections need a reason.
4. **Writes go through RPCs.** Leave requests, balances, attendance and corrections have no insert or
   update grants; `request_leave`, `check_in`, `request_attendance_correction` and the review RPCs
   are the only paths. Timesheets and time entries are written directly by their owner, under triggers
   that force ownership and lock entries once a sheet is submitted or approved.
5. **Leave days are computed in the database** from the member's calendar (or the organization
   default): working weekdays minus holidays, or 0.5 for a half day. Requests stay within one calendar
   year; overlapping requests and requests beyond the remaining balance are rejected. Pending requests
   count against the balance.
6. **Balances are a yearly grant, not an accrual.** `leave_balances` holds granted days per person, type
   and year; used and pending are derived from requests. HR grants each tracked type's allowance with
   `grant_annual_leave_allowances` (existing balances are kept) and can adjust any balance. Accrual,
   carry-over and expiry need a scheduler and wait for Phase 7.
7. **Leave types that skip approval** (sick leave by default) are approved on submission. Types with no
   allowance (unpaid leave) are recorded but not limited.
8. **Attendance uses the server clock** and the organization's time zone for "today". Corrections cover
   the last 60 days, one pending correction per day; approval writes the record with source
   `correction`, and the original stays in the audit log.
9. **Weekly timesheets** start on Monday (ISO week), can be opened up to one week ahead, and hold
   entries per day by category: project work (needs a project the member can see, optionally a work
   item of that project), internal, training or pre-sales. A day holds at most 24 hours.
10. **Dated allocations** (`resource_allocations`: person, project, date range, percent) replace the
    indicative `project_memberships.allocation_percent`, which stays for display but is not used for
    planning. Overlaps above 100% are allowed and reported, not blocked.
11. **Capacity is kept apart from attendance.** `capacity_overview` computes capacity as working days
    on the member's calendar minus holidays and approved leave, times hours per day. Allocated hours
    use the same days. Over-allocation is judged on the busiest day (peak percent), not the average.
    Utilisation is project time on submitted or approved timesheets divided by capacity. Attendance
    never feeds capacity: it records presence, not availability.
12. **New permissions:** `workforce.self`, `hr.read`, `hr.manage`, `timesheet.read_all`,
    `timesheet.approve`, `resource.read`, `resource.manage`. Client stakeholders and the org
    administrator get none of them by default.

## Consequences
- Managers see their reports' leave reasons and attendance; that is intended. Hiding reasons from
  managers would need a per-field privacy setting, which is a later change.
- Changing a calendar or adding a holiday doesn't recount existing requests; their day count is
  fixed when they are made.
- Capacity is computed on read, which is fine for one organization's directory over at most 184 days.
  A materialised daily table would be needed for portfolio-wide forecasting in Phase 5.
- Scheduled jobs (accrual, reminders for missing timesheets, auto-checkout) arrive with Phase 7's
  workflow engine.
