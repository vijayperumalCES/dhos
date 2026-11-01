import type { Metadata } from "next";
import Link from "next/link";

import { FilterBar } from "@/components/common/filter-bar";
import { PageHeader } from "@/components/common/page-header";
import { AccessDenied, EmptyState } from "@/components/common/states";
import { ReleaseStatusBadge } from "@/components/governance/badges";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgContext } from "@/lib/auth/org-context";
import { listGovernanceProjects } from "@/lib/data/governance";
import { loadProjectFormOptions } from "@/lib/data/options";
import { listReleases } from "@/lib/data/releases";
import { RELEASE_STATUS_LABELS, RELEASE_STATUSES } from "@/lib/domain/governance";
import { formatDate, personName } from "@/lib/format";
import { governanceFilterSchema } from "@/lib/validation/governance";

import { ReleaseDialog } from "./release-controls";

export const metadata: Metadata = { title: "Releases & quality" };

export default async function ReleasesPage({ searchParams }: PageProps<"/releases">) {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("release.read")) return <AccessDenied what="releases" />;
  const raw = await searchParams;
  const filters = governanceFilterSchema.parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
  const canManage = ctx.permissions.has("release.manage");

  const [releases, projects, options] = await Promise.all([listReleases(ctx, { project: filters.project, status: filters.status }), listGovernanceProjects(ctx), loadProjectFormOptions(ctx)]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Releases & quality" description="Release governance: every release carries quality gates that must pass, or be waived with a reason, before it can be approved." />
      <Card className="pb-0">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Releases</CardTitle>
            <CardDescription>{releases.filter((r) => ["planned", "in_review", "approved"].includes(r.status)).length} in flight</CardDescription>
          </div>
          {canManage && <ReleaseDialog projects={projects} members={options.members} fixedProject={filters.project} />}
        </CardHeader>
        <CardContent className="px-0">
          <div className="px-6">
            <FilterBar
              filters={[
                { key: "project", label: "Project", options: projects },
                {
                  key: "status",
                  label: "Status",
                  allLabel: "Any status",
                  options: [
                    { value: "active", label: "In flight" },
                    { value: "done", label: "Released or cancelled" },
                    ...RELEASE_STATUSES.map((s) => ({ value: s, label: RELEASE_STATUS_LABELS[s] })),
                  ],
                },
              ]}
            />
          </div>
          {releases.length === 0 ? (
            <EmptyState className="mx-6 mb-6" title="No releases" description="Plan a release to track its quality gates through review, approval and go-live." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Release</TableHead>
                  <TableHead>Planned</TableHead>
                  <TableHead>Required gates</TableHead>
                  <TableHead className="hidden md:table-cell">Manager</TableHead>
                  <TableHead className="pr-6">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {releases.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="pl-6">
                      <Link href={`/releases/${r.id}`} className="font-medium hover:underline">
                        {r.name}
                        {r.version ? ` · ${r.version}` : ""}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        <span className="font-mono">{r.project?.code}</span> {r.project?.name}
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums">{r.status === "released" ? `Released ${formatDate(r.released_on)}` : formatDate(r.planned_date)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="tabular-nums">
                        {r.gateSummary.requiredReady}/{r.gateSummary.requiredTotal} ready
                      </Badge>
                      {r.gateSummary.failed > 0 && <span className="ml-2 text-xs font-medium text-health-red">{r.gateSummary.failed} failed</span>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{personName(r.manager)}</TableCell>
                    <TableCell className="pr-6">
                      <ReleaseStatusBadge status={r.status} />
                    </TableCell>
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
