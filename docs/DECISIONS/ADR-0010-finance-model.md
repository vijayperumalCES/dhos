# ADR-0010: Financial data model and access

**Status:** Accepted · 2026-11-03

## Context
Phase 5 adds money: what a project was budgeted, what it has cost, what it is expected to cost, what
it earns and what is left over. Rates and contract values are among the most sensitive data in the
product, and a finance screen is only useful if its numbers can be trusted: a fact must never be
silently edited, and a forecast must never be presented as a fact.

## Decisions

1. **Finance is its own access boundary.** Three permissions: `finance.read` (budgets, actuals,
   forecasts, variance, margin), `finance.manage` (rates, drafts, ledger, forecasts, contract values,
   revenue) and `finance.approve` (approve a budget as the baseline). No project role grants any of
   them; the Delivery Head reads and approves, the Finance Manager does all three. Every policy also
   requires visibility of the project's client (`private.can_see_project_finance`), so a confidential
   client's money is as hidden as the client.
2. **Rates are never exposed by a report.** `rate_card_lines` (cost and bill rate per job title) and
   `member_cost_rates` (a person's own rate) are readable only with `finance.manage`. The report
   functions run as the definer and return project totals; they never return a per-person figure.
   The audit trigger for finance tables (`private.audit_finance_change`) records who changed what
   with every amount redacted, so `audit.read` can't be used to read rates or values.
3. **Rates are effective-dated and never edited.** A change is a new line with a later date, so past
   actuals keep the rate they were earned at. A line can be deleted only before it takes effect. The
   rate for a person on a day is their own rate if they have one, else the rate card line for their
   job title; if neither exists the hours are reported as *without a rate*, never priced at zero.
4. **Actuals are facts, forecasts are opinions, and they live apart.**
   - Labour actual = approved timesheet hours × the rate in force on the day. Submitted or draft time
     does not count. It is computed, not stored.
   - Other actuals are an append-only ledger (`cost_entries`, no update or delete grant). A mistake is
     corrected by `reverse_cost_entry`, which writes a negative entry pointing back; both stay.
   - Labour forecast = dated resource allocations from today × the member's calendar hours × the
     rate on each day. Non-labour forecast = `forecast_entries` per category and month, from the
     current month on. Allocations ignore approved leave (a known overstatement).
   - Estimate at completion (EAC) = actual + forecast. Variance = budget − EAC (negative is an
     overrun). A project is *at risk* from 95% of budget and *over budget* above 100%.
5. **Budgets are versioned and need two people.** A draft is created by `start_budget` (copying the
   baseline's lines for a revision), edited while it is a draft, and made the baseline by
   `approve_budget`, which refuses the drafter, refuses an empty budget and marks the previous
   baseline superseded. One draft and one baseline per project (partial unique indexes). Approved
   content is frozen by trigger.
6. **Revenue is a schedule, not a ledger of invoices.** `contract_values` holds a contract's value and
   billing model in its own table (a column can't have its own row security) with the same visibility
   as the client. `revenue_lines` are planned (forecast) until `recognise_revenue` makes them facts,
   after which they are locked. Margin to date = recognised revenue − actual cost; forecast margin =
   (recognised + planned) − EAC. Both are null for a project with no revenue lines: margin is shown
   only where the data supports it.
7. **Single currency.** Everything is in `organization_settings.currency_code`. No FX table;
   multi-currency would need per-record currency and dated rates, and is deferred.
8. **Portfolio analytics are computed on request** from `project_financials`, which returns only rows
   the viewer may see. Totals compare like with like: budget, EAC and variance cover projects with a
   baseline; margin covers projects with revenue. Roll-ups by client and program are done in
   `src/lib/domain/finance.ts` so one definition feeds every screen.

## Consequences
- A project total can reveal a person's rate on a one-person project; that is accepted for roles
  trusted with `finance.read`.
- Hours worked before a rate exists are priced from the rate in force on the day, so adding a
  rate with an earlier `effective_from` re-prices history. This is deliberate (back-filling a rate
  card) and is visible in the audit log.
- Time and materials billing, invoicing, tax, multi-currency, cost allocation of shared costs and
  nightly snapshots (trend of EAC over time) are not built.
