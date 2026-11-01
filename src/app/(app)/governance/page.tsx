import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/states";
import { RiskScoreBadge } from "@/components/governance/badges";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgContext } from "@/lib/auth/org-context";
import { getGovernanceReport } from "@/lib/data/governance";
import { buildGovernanceReportMarkdown } from "@/lib/domain/governance";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

import { CopyReportButton } from "./copy-report";

export const metadata: Metadata = { title: "Governance overview" };

function Stat({ label, value, sub, href, tone }: { label: string; value: number; sub: string; href: string; tone?: "warning" | "critical" }) {
  return (
    <Link href={href} className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
      <Card className="h-full gap-0 py-4 transition-colors hover:bg-muted/40">
        <CardContent className="px-4">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className={cn("mt-1 text-3xl font-semibold tabular-nums", tone === "critical" && value > 0 && "text-health-red", tone === "warning" && value > 0 && "text-health-amber")}>{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

export default async function GovernanceOverviewPage() {
  const ctx = await requireOrgContext();
  const r = await getGovernanceReport(ctx);
  const markdown = buildGovernanceReportMarkdown(r);
  const nothing = r.openRisks.total + r.openIssues + r.openActions + r.escalations.open + r.pendingChanges === 0 && r.redWithoutRecovery.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Executive view of the records you can see, as of {formatDate(r.generatedOn)} ({r.timezone}). Counts are live; nothing here is stored.
        </p>
        <CopyReportButton markdown={markdown} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Open risks" value={r.openRisks.total} sub={`${r.openRisks.critical} critical · ${r.openRisks.high} high`} href="/governance/raid?type=risk&status=open" tone="critical" />
        <Stat label="Open issues" value={r.openIssues} sub={`${r.overdueRaid} RAID item${r.overdueRaid === 1 ? "" : "s"} overdue`} href="/governance/raid?type=issue&status=open" tone="warning" />
        <Stat label="Open actions" value={r.openActions} sub={`${r.overdueActions} overdue`} href="/governance/actions?status=open" tone="warning" />
        <Stat label="Open escalations" value={r.escalations.open} sub={`${r.escalations.overdue} past their deadline`} href="/governance/escalations?status=open" tone="critical" />
      </div>

      {nothing && <EmptyState title="Nothing to report yet" description="Add risks, actions and decisions from the other tabs and they will roll up here." />}

      {r.redWithoutRecovery.length > 0 && (
        <Card className="border-health-red/40">
          <CardHeader>
            <CardTitle>Red projects with no recorded recovery action</CardTitle>
            <CardDescription>
              Nothing (no action, escalation or RAID item) has been recorded since these projects turned red. Open the project&apos;s Governance tab to record one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {r.redWithoutRecovery.map((p) => (
                <li key={p.projectId} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/projects/${p.projectId}/governance`} className="hover:underline">
                    <span className="mr-1.5 font-mono text-xs text-muted-foreground">{p.code}</span>
                    {p.name}
                  </Link>
                  <Badge variant="outline">
                    Red for {p.daysRed} day{p.daysRed === 1 ? "" : "s"}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="pb-0">
          <CardHeader>
            <CardTitle>Highest open risks</CardTitle>
            <CardDescription>Probability × impact, top five.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {r.topRisks.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">No open risks.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Risk</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead className="pr-6">Owner</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.topRisks.map((k, i) => (
                    <TableRow key={i}>
                      <TableCell className="max-w-56 pl-6 whitespace-normal">
                        <span className="mr-1.5 font-mono text-xs text-muted-foreground">{k.project}</span>
                        {k.title}
                      </TableCell>
                      <TableCell>
                        <RiskScoreBadge score={k.score} />
                      </TableCell>
                      <TableCell className="pr-6">{k.owner}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Open escalations</CardTitle>
            <CardDescription>Soonest deadline first.</CardDescription>
          </CardHeader>
          <CardContent>
            {r.openEscalations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open escalations.</p>
            ) : (
              <ul className="divide-y text-sm">
                {r.openEscalations.map((e, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <span className="mr-1.5 font-mono text-xs text-muted-foreground">{e.project}</span>
                      {e.title}
                      <span className="block text-xs text-muted-foreground">
                        To {e.to} · respond by {formatDate(e.respondBy)}
                      </span>
                    </span>
                    {e.overdue && <Badge variant="destructive">Past deadline</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change requests</CardTitle>
            <CardDescription>Waiting on an approver.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <Link href="/governance/changes?status=submitted" className="text-primary hover:underline">
              {r.pendingChanges} awaiting a decision
            </Link>
          </CardContent>
        </Card>

        {ctx.permissions.has("release.read") && (
          <Card>
            <CardHeader>
              <CardTitle>Releases in flight</CardTitle>
              <CardDescription>Planned, in review or approved. Gates show required gates ready.</CardDescription>
            </CardHeader>
            <CardContent>
              {r.releasesDue.length === 0 ? (
                <p className="text-sm text-muted-foreground">No releases in flight.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {r.releasesDue.map((x, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 py-2">
                      <span>
                        <span className="mr-1.5 font-mono text-xs text-muted-foreground">{x.project}</span>
                        {x.name}
                        <span className="block text-xs text-muted-foreground">
                          {x.plannedDate ? formatDate(x.plannedDate) : "No date"} · {x.status}
                        </span>
                      </span>
                      <Badge variant="outline">Gates {x.gatesReady}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {r.expiringContracts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Contracts nearing their end</CardTitle>
            <CardDescription>Active contracts inside their notice period (60 days when none is set).</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {r.expiringContracts.map((c, i) => (
                <li key={i} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    {c.client} — {c.title}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    ends {formatDate(c.endDate)} ({c.daysLeft} d)
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
