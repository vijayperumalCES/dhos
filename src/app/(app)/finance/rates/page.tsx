import type { Metadata } from "next";

import { AccessDenied, EmptyState } from "@/components/common/states";
import { MemberRateDialog, RateLineDialog, RateRowActions } from "@/components/finance/finance-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgContext } from "@/lib/auth/org-context";
import { getRates } from "@/lib/data/finance";
import { todayInTimeZone } from "@/lib/domain/time";
import { formatMoney } from "@/lib/domain/finance";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Rates" };

export default async function RatesPage() {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("finance.manage")) return <AccessDenied what="rate cards" />;
  const currency = ctx.settings.currencyCode;
  const today = todayInTimeZone(new Date(), ctx.settings.timezone);
  const rates = await getRates(ctx);

  return (
    <div className="space-y-6">
      <Card className="pb-0">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Rate card</CardTitle>
            <CardDescription>
              Hourly cost by role, matched to people by job title. Rates are effective-dated and never edited: add a newer line to change one, so past actuals keep the rate they were earned at.
            </CardDescription>
          </div>
          <RateLineDialog today={today} currency={currency} />
        </CardHeader>
        <CardContent className="px-0">
          {rates.lines.length === 0 ? (
            <EmptyState className="mx-6 mb-6" title="No rates yet" description="Without rates, approved timesheet hours are counted but not priced, and show up as hours without a rate." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Role</TableHead>
                  <TableHead>Effective from</TableHead>
                  <TableHead className="text-right">Cost / hour</TableHead>
                  <TableHead className="text-right">Bill / hour</TableHead>
                  <TableHead className="w-12 pr-6">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rates.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="pl-6 font-medium">{l.role_title}</TableCell>
                    <TableCell className="tabular-nums">{formatDate(l.effective_from)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(l.cost_rate, currency)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(l.bill_rate, currency)}</TableCell>
                    <TableCell className="pr-6">
                      <RateRowActions kind="card" id={l.id} label={l.role_title} removable={l.effective_from > today} />
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
            <CardTitle>Personal rates</CardTitle>
            <CardDescription>Override the rate card for one person from a date. These are the most sensitive numbers in Stride: only people who manage finance can read them, and the audit log records changes without the amounts.</CardDescription>
          </div>
          <MemberRateDialog members={rates.members} today={today} currency={currency} />
        </CardHeader>
        <CardContent className="px-0">
          {rates.overrides.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">No personal rates. Everyone is priced from the rate card.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Person</TableHead>
                  <TableHead>Effective from</TableHead>
                  <TableHead className="text-right">Cost / hour</TableHead>
                  <TableHead className="w-12 pr-6">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rates.overrides.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="pl-6 font-medium">{o.member?.user_profiles?.display_name ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{formatDate(o.effective_from)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(o.cost_rate, currency)}</TableCell>
                    <TableCell className="pr-6">
                      <RateRowActions kind="member" id={o.id} label={o.member?.user_profiles?.display_name ?? "person"} removable={o.effective_from > today} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>People with no rate today</CardTitle>
          <CardDescription>No personal rate and no rate card line for their job title. Their approved hours are counted but not priced.</CardDescription>
        </CardHeader>
        <CardContent>
          {rates.unrated.length === 0 ? (
            <p className="text-sm text-muted-foreground">Everyone has a rate.</p>
          ) : (
            <ul className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {rates.unrated.map((m) => (
                <li key={m.id}>
                  <span className="font-medium">{m.name}</span> <span className="text-muted-foreground">{m.jobTitle ? `· ${m.jobTitle}` : "· no job title"}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
