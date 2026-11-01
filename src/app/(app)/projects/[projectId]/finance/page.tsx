import type { Metadata } from "next";

import { AccessDenied, EmptyState } from "@/components/common/states";
import { FinanceStatusBadge } from "@/components/finance/badges";
import {
  BudgetDraftButtons,
  BudgetLineActions,
  BudgetLineDialog,
  CostEntryActions,
  CostEntryDialog,
  ForecastActions,
  ForecastDialog,
  RevenueActions,
  RevenueLineDialog,
  StartBudgetDialog,
} from "@/components/finance/finance-controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgContext } from "@/lib/auth/org-context";
import { getProjectFinance } from "@/lib/data/finance";
import {
  BUDGET_STATUS_LABELS,
  COST_CATEGORIES,
  COST_CATEGORY_LABELS,
  firstOfMonth,
  formatMoney,
  formatMonth,
  formatPercent,
  formatVariance,
  type BudgetStatus,
  type CostCategory,
} from "@/lib/domain/finance";
import { todayInTimeZone } from "@/lib/domain/time";
import { formatDate, personName } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Project finance" };

const tone = (n: number | null) => (n === null ? "" : n < 0 ? "text-health-red" : "");

function Tile({ label, value, hint, className }: { label: string; value: string; hint: string; className?: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", className)}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

export default async function ProjectFinancePage({ params }: PageProps<"/projects/[projectId]/finance">) {
  const { projectId } = await params;
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("finance.read")) return <AccessDenied what="this project's finances" />;
  const data = await getProjectFinance(ctx, projectId);
  const f = data.financials;
  if (!f) return <AccessDenied what="this project's finances" />;

  const currency = ctx.settings.currencyCode;
  const money = (n: number | null) => formatMoney(n, currency);
  const canManage = ctx.permissions.has("finance.manage");
  const canApprove = ctx.permissions.has("finance.approve");
  const today = todayInTimeZone(new Date(), ctx.settings.timezone);
  const currentMonth = firstOfMonth(today);

  const baseline = data.budgets.find((b) => b.status === "approved") ?? null;
  const draft = data.budgets.find((b) => b.status === "draft") ?? null;
  const history = data.budgets.filter((b) => b.status === "superseded");
  const budgetBy = (b: typeof baseline, c: CostCategory) => Number(b?.lines.find((l) => l.category === c)?.amount ?? 0);

  // Per category: budget (baseline), actual (facts), forecast to come, estimate and variance.
  const reversedIds = new Set(data.costs.map((c) => c.reverses_id).filter((x): x is string => !!x));
  const rows = COST_CATEGORIES.map((c) => {
    const actual = c === "labour" ? f.labourActual : data.costs.filter((e) => e.category === c).reduce((s, e) => s + Number(e.amount), 0);
    const forecast = c === "labour" ? f.labourForecast : data.forecasts.filter((e) => e.category === c && e.period >= currentMonth).reduce((s, e) => s + Number(e.amount), 0);
    const budget = baseline ? budgetBy(baseline, c) : null;
    const eac = actual + forecast;
    return { category: c, budget, actual, forecast, eac, variance: budget === null ? null : budget - eac };
  }).filter((r) => r.budget !== 0 || r.actual !== 0 || r.forecast !== 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Baseline budget"
          value={money(f.budgetTotal)}
          hint={f.budgetVersion ? `Version ${f.budgetVersion}, approved ${formatDate(f.baselineApprovedAt?.slice(0, 10))}` : "No approved budget yet"}
        />
        <Tile label="Actual to date" value={money(f.actual)} hint={`${formatPercent(f.burnPct)} of budget · ${f.approvedHours} approved hours`} />
        <Tile label="Estimate at completion" value={money(f.eac)} hint={`${money(f.forecastRemaining)} still forecast`} className={tone(f.variance)} />
        <Tile label="Variance" value={formatVariance(f.variance, currency)} hint={f.variancePct === null ? "Needs a baseline" : `${formatPercent(f.variancePct, 1)} of budget`} className={tone(f.variance)} />
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <FinanceStatusBadge status={f.status} />
        {f.hasRevenue && (
          <span className="text-muted-foreground">
            Revenue {money(f.revenueRecognised)} recognised of {money(f.revenueTotal)} · margin to date <span className={cn("tabular-nums", tone(f.marginToDate))}>{formatVariance(f.marginToDate, currency)}</span>, forecast{" "}
            <span className={cn("tabular-nums", tone(f.marginForecast))}>{formatPercent(f.marginForecastPct)}</span>
          </span>
        )}
        {f.hoursWithoutRate > 0 && <span className="text-health-amber">{Math.round(f.hoursWithoutRate)} hours have no rate and aren&apos;t priced.</span>}
      </div>

      <Card className="pb-0">
        <CardHeader>
          <CardTitle>Budget against actuals</CardTitle>
          <CardDescription>Actual is fact: approved timesheet hours at the rate in force on the day, plus the ledger. Forecast is opinion: dated allocations from today for labour, monthly forecasts from this month for the rest.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {rows.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">Nothing budgeted or spent yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Category</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">Forecast to come</TableHead>
                  <TableHead className="text-right">Estimate</TableHead>
                  <TableHead className="pr-6 text-right">Variance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.category}>
                    <TableCell className="pl-6 font-medium">{COST_CATEGORY_LABELS[r.category]}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(r.budget)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(r.actual)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(r.forecast)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(r.eac)}</TableCell>
                    <TableCell className={cn("pr-6 text-right tabular-nums", tone(r.variance))}>{formatVariance(r.variance, currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="pb-0">
        <CardHeader>
          <CardTitle>Actual spend by month</CardTitle>
          <CardDescription>Last twelve months, by the date the work was done or the cost incurred.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Month</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="text-right">Labour</TableHead>
                <TableHead className="text-right">Other</TableHead>
                <TableHead className="pr-6 text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.monthly.map((m) => (
                <TableRow key={m.month} className={cn(m.labour === 0 && m.other === 0 && "text-muted-foreground")}>
                  <TableCell className="pl-6">{formatMonth(m.month)}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.hours}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(m.labour)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(m.other)}</TableCell>
                  <TableCell className="pr-6 text-right tabular-nums">{money(m.labour + m.other)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="pb-0">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Budget</CardTitle>
            <CardDescription>
              The approved budget is the baseline the variance is measured against. To change it, draft a revision: someone other than the drafter approves it, and the earlier baseline is kept.
            </CardDescription>
          </div>
          {canManage && !draft && <StartBudgetDialog projectId={projectId} revision={!!baseline} />}
        </CardHeader>
        <CardContent className="space-y-6 px-0">
          {draft && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-2">
                <div>
                  <span className="font-medium">{draft.name}</span> <Badge variant="outline">Draft v{draft.version}</Badge>
                  <p className="text-xs text-muted-foreground">Drafted by {personName(draft.drafter)}. Only a draft can be edited.</p>
                </div>
                <div className="flex items-center gap-2">
                  {canManage && <BudgetLineDialog projectId={projectId} budgetId={draft.id} />}
                  {(canManage || canApprove) && <BudgetDraftButtons projectId={projectId} budgetId={draft.id} canApprove={canApprove} hasLines={draft.lines.some((l) => Number(l.amount) > 0)} />}
                </div>
              </div>
              {draft.lines.length === 0 ? (
                <p className="px-6 text-sm text-muted-foreground">No lines yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Category</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead className="w-12 pr-6">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {draft.lines.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="pl-6 font-medium">{COST_CATEGORY_LABELS[l.category]}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(Number(l.amount))}</TableCell>
                        <TableCell className="text-muted-foreground">{l.note}</TableCell>
                        <TableCell className="pr-6">{canManage && <BudgetLineActions projectId={projectId} line={{ id: l.id, budgetId: draft.id, category: l.category, amount: Number(l.amount), note: l.note }} />}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell className="pl-6 font-medium">Total</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{money(draft.lines.reduce((s, l) => s + Number(l.amount), 0))}</TableCell>
                      <TableCell />
                      <TableCell className="pr-6" />
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </div>
          )}
          {!draft && !baseline && <EmptyState className="mx-6 mb-6" title="No budget yet" description="Draft a budget, then have someone else approve it to set the baseline." />}
          {history.length > 0 && (
            <div className="px-6 pb-6">
              <p className="mb-2 text-sm font-medium">Earlier baselines</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {history.map((b) => (
                  <li key={b.id}>
                    v{b.version} {b.name} · {money(b.lines.reduce((s, l) => s + Number(l.amount), 0))} · approved {formatDate(b.approved_at?.slice(0, 10))} by {personName(b.approver)} · <Badge variant="outline">{BUDGET_STATUS_LABELS[b.status as BudgetStatus]}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="pb-0">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Cost ledger</CardTitle>
            <CardDescription>Non-labour actuals, append-only. Labour is not entered here: it comes from approved timesheets.</CardDescription>
          </div>
          {canManage && <CostEntryDialog projectId={projectId} today={today} />}
        </CardHeader>
        <CardContent className="px-0">
          {data.costs.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">No costs recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="hidden md:table-cell">Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-12 pr-6">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.costs.map((c) => (
                  <TableRow key={c.id} className={cn(c.reverses_id && "text-muted-foreground")}>
                    <TableCell className="pl-6 tabular-nums">{formatDate(c.entry_date)}</TableCell>
                    <TableCell>
                      {c.description}
                      <div className="text-xs text-muted-foreground">{[c.vendor, c.reference, reversedIds.has(c.id) ? "reversed" : null].filter(Boolean).join(" · ")}</div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{COST_CATEGORY_LABELS[c.category]}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(Number(c.amount))}</TableCell>
                    <TableCell className="pr-6">
                      <CostEntryActions projectId={projectId} canManage={canManage} entry={{ id: c.id, description: c.description, reversible: !c.reverses_id && !reversedIds.has(c.id) }} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="pb-0">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Non-labour forecast</CardTitle>
            <CardDescription>Expected spend by month. Labour is forecast automatically from dated resource allocations.</CardDescription>
          </div>
          {canManage && <ForecastDialog projectId={projectId} currentMonth={currentMonth.slice(0, 7)} />}
        </CardHeader>
        <CardContent className="px-0">
          {data.forecasts.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">No forecasts entered.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Month</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="hidden md:table-cell">Note</TableHead>
                  <TableHead className="w-12 pr-6">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.forecasts.map((e) => (
                  <TableRow key={e.id} className={cn(e.period < currentMonth && "text-muted-foreground")}>
                    <TableCell className="pl-6">
                      {formatMonth(e.period)}
                      {e.period < currentMonth && <span className="ml-2 text-xs">(past, not counted)</span>}
                    </TableCell>
                    <TableCell>{COST_CATEGORY_LABELS[e.category]}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(Number(e.amount))}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{e.note}</TableCell>
                    <TableCell className="pr-6">{canManage && <ForecastActions projectId={projectId} currentMonth={currentMonth.slice(0, 7)} forecast={{ id: e.id, category: e.category, period: e.period, amount: Number(e.amount), note: e.note }} />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="pb-0">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Revenue</CardTitle>
            <CardDescription>Planned lines are the revenue forecast; recognised lines are facts and are locked. Margin needs at least one line.</CardDescription>
          </div>
          {canManage && <RevenueLineDialog projectId={projectId} contracts={data.contracts} today={today} />}
        </CardHeader>
        <CardContent className="px-0">
          {data.revenue.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">No revenue recorded, so no margin is shown.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Description</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12 pr-6">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.revenue.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="pl-6">
                      {r.description}
                      {r.contract && <div className="text-xs text-muted-foreground">{r.contract.title}</div>}
                    </TableCell>
                    <TableCell className="tabular-nums">{r.status === "recognised" ? formatDate(r.recognised_on) : formatDate(r.planned_date)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(Number(r.amount))}</TableCell>
                    <TableCell>
                      {r.status === "recognised" ? (
                        <Badge variant="secondary">Recognised</Badge>
                      ) : (
                        <Badge variant="outline" className={cn(r.planned_date < today && "text-health-amber")}>
                          {r.planned_date < today ? "Planned, past due" : "Planned"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="pr-6">{canManage && r.status === "planned" && <RevenueActions projectId={projectId} today={today} line={{ id: r.id, description: r.description }} />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
