import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { AccessDenied } from "@/components/common/states";
import { GateStatusBadge, ReleaseStatusBadge } from "@/components/governance/badges";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgContext } from "@/lib/auth/org-context";
import { loadProjectFormOptions } from "@/lib/data/options";
import { getRelease } from "@/lib/data/releases";
import { GATE_CATEGORY_LABELS } from "@/lib/domain/governance";
import { formatDate, formatDateTime, personName } from "@/lib/format";

import { AddGateDialog, EditReleaseButton, GateRowActions, ReleaseStatusButtons } from "../release-controls";

export const metadata: Metadata = { title: "Release" };

export default async function ReleasePage({ params }: PageProps<"/releases/[releaseId]">) {
  const { releaseId } = await params;
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("release.read")) return <AccessDenied what="releases" />;
  const release = await getRelease(ctx, releaseId);
  if (!release) notFound();
  const canManage = ctx.permissions.has("release.manage");
  const canApprove = ctx.permissions.has("release.approve");
  const options = canManage ? await loadProjectFormOptions(ctx) : { members: [] };
  const locked = release.status === "released" || release.status === "cancelled";
  const gatesLocked = locked || release.status === "approved";
  const s = release.gateSummary;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        breadcrumbs={[{ label: "Releases", href: "/releases" }, { label: release.name }]}
        title={
          <>
            {release.name}
            {release.version && <span className="ml-2 font-mono text-base text-muted-foreground">{release.version}</span>}
          </>
        }
        meta={
          <>
            <ReleaseStatusBadge status={release.status} />
            <Badge variant="outline">
              {release.project?.code} · {release.project?.name}
            </Badge>
          </>
        }
        actions={
          <>
            {canManage && !locked && (
              <EditReleaseButton
                members={options.members}
                item={{
                  id: release.id,
                  projectId: release.project_id,
                  name: release.name,
                  version: release.version ?? "",
                  plannedDate: release.planned_date ?? "",
                  managerId: release.release_manager_membership_id ?? "none",
                  notes: release.notes ?? "",
                }}
              />
            )}
            <ReleaseStatusButtons releaseId={release.id} name={release.name} status={release.status} canManage={canManage} canApprove={canApprove} gatesReady={s.canApprove} />
          </>
        }
      />

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Row label="Planned">{formatDate(release.planned_date)}</Row>
              {release.released_on && <Row label="Released">{formatDate(release.released_on)}</Row>}
              <Row label="Release manager">{personName(release.manager)}</Row>
              {release.approved_at && (
                <Row label="Approved">
                  {personName(release.approver)} · {formatDateTime(release.approved_at, ctx.settings.timezone)}
                </Row>
              )}
              {release.notes && <Row label="Notes">{release.notes}</Row>}
            </dl>
            {(release.openCriticalDefects > 0 || release.openHighDefects > 0) && !locked && (
              <p className="mt-4 flex gap-2 rounded-md bg-health-amber/15 p-3 text-xs">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  This project has {release.openCriticalDefects} open critical (S1) and {release.openHighDefects} open high (S2) defects. They are shown as context and don&apos;t block
                  approval; your gates decide what does.
                </span>
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="pb-0 md:col-span-2">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle>Quality gates</CardTitle>
              <CardDescription>
                {s.requiredReady} of {s.requiredTotal} required gates passed or waived{s.failed > 0 ? ` · ${s.failed} failed` : ""}.{" "}
                {release.status === "approved" ? "Gates are frozen while approved; reopen the review to change them." : ""}
              </CardDescription>
            </div>
            {canManage && !gatesLocked && <AddGateDialog releaseId={release.id} />}
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Gate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Checked</TableHead>
                  <TableHead className="w-12 pr-6">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {release.gates.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="max-w-xs pl-6 whitespace-normal">
                      <div className="font-medium">{g.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {GATE_CATEGORY_LABELS[g.category as keyof typeof GATE_CATEGORY_LABELS]} · {g.is_required ? "Required" : "Optional"}
                      </div>
                      {g.note && <div className="text-xs text-muted-foreground">“{g.note}”</div>}
                    </TableCell>
                    <TableCell>
                      <GateStatusBadge status={g.status} />
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                      {g.checked_at ? `${personName(g.checker)} · ${formatDateTime(g.checked_at, ctx.settings.timezone)}` : "—"}
                    </TableCell>
                    <TableCell className="pr-6">
                      <GateRowActions releaseId={release.id} gate={g} locked={locked} structureLocked={gatesLocked} canManage={canManage} canApprove={canApprove} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap">{children}</dd>
    </div>
  );
}
