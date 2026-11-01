import type { Metadata } from "next";
import Link from "next/link";

import { FinanceStatusBadge } from "@/components/finance/badges";
import { EmptyState } from "@/components/common/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgContext } from "@/lib/auth/org-context";
import { listProjectFinancials } from "@/lib/data/finance";
import { attentionOrder, formatMoney, formatPercent, formatVariance, rollUp, sumFinancials, type Totals } from "@/lib/domain/finance";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Financials" };

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

function RollupTable({ title, description, groups, currency }: { title: string; description: string; groups: { key: string; label: string; totals: Totals }[]; currency: string }) {
  return (
    <Card className="pb-0">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">{title.replace("By ", "")}</TableHead>
              <TableHead className="text-right">Projects</TableHead>
              <TableHead className="text-right">Budget</TableHead>
              <TableHead className="text-right">Actual</TableHead>
              <TableHead className="text-right">Estimate</TableHead>
              <TableHead className="text-right">Variance</TableHead>
              <TableHead className="pr-6 text-right">Forecast margin</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => (
              <TableRow key={g.key}>
                <TableCell className="pl-6 font-medium">{g.label}</TableCell>
                <TableCell className="text-right tabular-nums">{g.totals.projects}</TableCell>
                <TableCell className="text-right tabular-nums">{g.totals.baselined ? formatMoney(g.totals.budget, currency) : "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(g.totals.actual, currency)}</TableCell>
                <TableCell className="text-right tabular-nums">{g.totals.baselined ? formatMoney(g.totals.eac, currency) : "—"}</TableCell>
                <TableCell className={cn("text-right tabular-nums", tone(g.totals.baselined ? g.totals.variance : null))}>{g.totals.baselined ? formatVariance(g.totals.variance, currency) : "—"}</TableCell>
                <TableCell className="pr-6 text-right tabular-nums">{g.totals.withRevenue ? formatPercent(g.totals.marginForecastPct) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default async function FinancePortfolioPage() {
  const ctx = await requireOrgContext();
  const currency = ctx.settings.currencyCode;
  const items = await listProjectFinancials(ctx);
  if (items.length === 0) {
    return <EmptyState title="No projects to show" description="Finance shows projects you can see. Create a project, then draft its budget from the project's Finance tab." />;
  }

  const rows = items.map((i) => i.financials);
  const totals = sumFinancials(rows);
  const sorted = [...items].sort((a, b) => attentionOrder(a.financials, b.financials) || a.project.code.localeCompare(b.project.code));
  const byClient = rollUp(items, (i) => ({ key: i.project.client_id ?? "internal", label: i.project.clientName }));
  const byProgram = rollUp(items, (i) => ({ key: i.project.program?.id ?? "none", label: i.project.program ? `${i.project.program.code} · ${i.project.program.name}` : "No program" }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Approved budget" value={formatMoney(totals.budget, currency, { compact: true })} hint={`${totals.baselined} of ${totals.projects} projects have a baseline`} />
        <Tile label="Actual to date" value={formatMoney(totals.actual, currency, { compact: true })} hint="Approved timesheet hours at their rate, plus the cost ledger" />
        <Tile
          label="Estimate at completion"
          value={formatMoney(totals.eac, currency, { compact: true })}
          hint={`${formatVariance(totals.variance, currency)} against budget, baselined projects only`}
          className={tone(totals.variance)}
        />
        <Tile
          label="Forecast margin"
          value={totals.withRevenue ? formatPercent(totals.marginForecastPct) : "—"}
          hint={totals.withRevenue ? `${formatMoney(totals.marginForecast, currency, { compact: true })} across ${totals.withRevenue} projects with revenue` : "No revenue recorded yet"}
          className={tone(totals.marginForecast)}
        />
      </div>

      {(totals.overBudget > 0 || totals.atRisk > 0 || totals.noBaseline > 0 || totals.hoursWithoutRate > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {totals.overBudget > 0 && <p><span className="font-medium text-health-red">{totals.overBudget}</span> {totals.overBudget === 1 ? "project is" : "projects are"} forecast to finish over budget.</p>}
            {totals.atRisk > 0 && <p><span className="font-medium text-health-amber">{totals.atRisk}</span> {totals.atRisk === 1 ? "project is" : "projects are"} forecast to use 95% or more of budget.</p>}
            {totals.noBaseline > 0 && <p><span className="font-medium">{totals.noBaseline}</span> {totals.noBaseline === 1 ? "project has" : "projects have"} no approved budget, so no variance can be shown.</p>}
            {totals.hoursWithoutRate > 0 && (
              <p>
                <span className="font-medium">{Math.round(totals.hoursWithoutRate)}</span> worked or planned hours have no rate and are missing from the totals.
                {ctx.permissions.has("finance.manage") && (
                  <>
                    {" "}
                    <Link href="/finance/rates" className="text-primary hover:underline">
                      Fix rates
                    </Link>
                  </>
                )}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="pb-0">
        <CardHeader>
          <CardTitle>Projects</CardTitle>
          <CardDescription>Most at-risk first. Actual is fact; estimate adds forecast labour (dated allocations from today) and forecast non-labour spend.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Project</TableHead>
                <TableHead className="hidden md:table-cell">Client</TableHead>
                <TableHead className="text-right">Budget</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">Estimate</TableHead>
                <TableHead className="text-right">Variance</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Margin</TableHead>
                <TableHead className="pr-6">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map(({ project, financials: f }) => (
                <TableRow key={project.id}>
                  <TableCell className="pl-6">
                    <Link href={`/projects/${project.id}/finance`} className="font-medium hover:underline">
                      <span className="mr-1.5 font-mono text-xs text-muted-foreground">{project.code}</span>
                      {project.name}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{project.clientName}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(f.budgetTotal, currency)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(f.actual, currency)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(f.eac, currency)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", tone(f.variance))}>{formatVariance(f.variance, currency)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums lg:table-cell">{formatPercent(f.marginForecastPct)}</TableCell>
                  <TableCell className="pr-6">
                    <FinanceStatusBadge status={f.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <RollupTable title="By client" description="Internal projects have no client." groups={byClient} currency={currency} />
        <RollupTable title="By program" description="Projects outside a program are grouped together." groups={byProgram} currency={currency} />
      </div>
    </div>
  );
}
