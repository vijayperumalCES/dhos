import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AuditTrail } from "@/components/common/audit-trail";
import { ArchivedBadge, HealthBadge, StatusBadge } from "@/components/common/badges";
import { AddMemberDialog, RemoveMemberButton } from "@/components/common/member-management";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/states";
import { ProjectGovernanceActions } from "@/components/projects/project-governance-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireOrgContext } from "@/lib/auth/org-context";
import { listAuditLogs } from "@/lib/data/audit";
import { listMemberOptions } from "@/lib/data/members";
import { getProject, getProjectHistory, getProjectMembers, resolveUserNames } from "@/lib/data/projects";
import { isHealthStale, isPastTargetEnd } from "@/lib/domain/kpis";
import { HEALTH_LABELS, METHODOLOGY_LABELS, STATUS_LABELS } from "@/lib/domain/project-lifecycle";
import { formatDate, formatDateTime, formatRelative, personName } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/projects/[projectId]">): Promise<Metadata> {
  const ctx = await requireOrgContext();
  const project = await getProject(ctx, (await params).projectId);
  return { title: project ? `${project.code} · ${project.name}` : "Project" };
}

export default async function ProjectPage({ params }: PageProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  const ctx = await requireOrgContext();
  const project = await getProject(ctx, projectId);
  if (!project) notFound();

  const p = ctx.permissions;
  const [history, members, memberOptions, audit] = await Promise.all([
    getProjectHistory(project.id),
    getProjectMembers(project.id),
    p.has("project.members.manage") ? listMemberOptions(ctx) : Promise.resolve([]),
    listAuditLogs(ctx, { entityType: "projects", entityId: project.id, pageSize: 50 }),
  ]);
  const historyNames = await resolveUserNames(history.map((h) => h.changed_by));
  const archived = project.archived_at !== null;
  const now = new Date();
  const stale = isHealthStale(project, now, ctx.settings.healthStaleAfterDays);
  const overdue = !["completed", "cancelled"].includes(project.status) && isPastTargetEnd(project, now);
  const onProject = new Set(members.map((m) => m.membership_id));
  const candidates = memberOptions
    .filter((m) => !onProject.has(m.id))
    .map((m) => ({ value: m.id, label: m.jobTitle ? `${m.displayName} — ${m.jobTitle}` : m.displayName }));
  const canManageMembers = p.has("project.members.manage") && !archived;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: project.code }]}
        title={
          <>
            <span className="mr-2 font-mono text-base text-muted-foreground">{project.code}</span>
            {project.name}
          </>
        }
        description={project.description}
        meta={
          <>
            <StatusBadge status={project.status} />
            <HealthBadge health={project.health} />
            {archived && <ArchivedBadge />}
            {overdue && <span className="text-xs font-medium text-health-red">Past target end date</span>}
            {stale && !archived && (
              <span className="text-xs text-muted-foreground">
                Health {project.health === "not_assessed" ? "never assessed" : `last confirmed ${formatRelative(project.health_updated_at)}`}
              </span>
            )}
          </>
        }
        actions={
          <>
            {p.has("project.update") && !archived && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/projects/${project.id}/edit`}>
                  <Pencil className="size-4" /> Edit
                </Link>
              </Button>
            )}
            <ProjectGovernanceActions
              projectId={project.id}
              status={project.status}
              health={project.health}
              archived={archived}
              canChangeStatus={p.has("project.change_status")}
              canArchive={p.has("project.archive")}
            />
          </>
        }
      />

      {project.health_reason && (project.health === "amber" || project.health === "red") && (
        <Card className="mb-6 border-l-4 border-l-health-amber data-[health=red]:border-l-health-red" data-health={project.health}>
          <CardContent className="py-4 text-sm">
            <span className="font-medium">{HEALTH_LABELS[project.health]} — </span>
            {project.health_reason}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="team">Team ({members.length})</TabsTrigger>
          <TabsTrigger value="history">Status history</TabsTrigger>
          {p.has("audit.read") && <TabsTrigger value="audit">Audit</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="mt-4 grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <Detail label="Client" value={project.client?.name ?? "Internal"} href={project.client ? `/clients/${project.client.id}` : undefined} />
                <Detail label="Sponsor" value={project.sponsor_name} />
                <Detail label="Project manager" value={personName(project.manager)} />
                <Detail label="Delivery owner" value={personName(project.owner)} />
                <Detail label="Primary team" value={project.team?.name} href={project.team ? `/teams/${project.team.id}` : undefined} />
                <Detail label="Methodology" value={METHODOLOGY_LABELS[project.methodology]} />
                <Detail label="Planned start" value={formatDate(project.planned_start_date)} />
                <Detail label="Target end" value={formatDate(project.target_end_date)} />
                <Detail label="Actual end" value={formatDate(project.actual_end_date)} />
                <Detail label="In stage since" value={formatDate(project.status_changed_at)} />
                <Detail label="Last updated" value={formatDateTime(project.updated_at)} />
              </dl>
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Scope</CardTitle>
              <CardDescription>Objectives, scope, assumptions and constraints as recorded for this project.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
              <Prose label="Objectives" value={project.objectives} />
              <Prose label="Scope" value={project.scope_summary} />
              <Prose label="Assumptions" value={project.assumptions} />
              <Prose label="Constraints" value={project.project_constraints} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="space-y-1.5">
                <CardTitle>Project members</CardTitle>
                <CardDescription>
                  Allocation is indicative only; dated capacity planning arrives with Resource Planning in Phase 3.
                </CardDescription>
              </div>
              {canManageMembers && <AddMemberDialog target={{ kind: "project", projectId: project.id }} candidates={candidates} />}
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <EmptyState title="No members yet" description="Add the people working on this project so they can see it." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Project role</TableHead>
                      <TableHead className="text-right">Allocation</TableHead>
                      {canManageMembers && <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((m) => {
                      const name = m.member?.user_profiles?.display_name ?? "Member";
                      return (
                        <TableRow key={m.membership_id}>
                          <TableCell>
                            <div className="font-medium">{name}</div>
                            <div className="text-xs text-muted-foreground">{m.member?.job_title}</div>
                          </TableCell>
                          <TableCell>{m.project_role}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {m.allocation_percent === null ? "—" : `${m.allocation_percent}%`}
                          </TableCell>
                          {canManageMembers && (
                            <TableCell>
                              <RemoveMemberButton target={{ kind: "project", projectId: project.id }} membershipId={m.membership_id} name={name} />
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Lifecycle and health history</CardTitle>
              <CardDescription>Written by the database whenever status or health changes; cannot be edited.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-l pl-5">
                {history.map((h) => (
                  <li key={h.id} className="text-sm">
                    <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full border-2 border-background bg-primary" aria-hidden />
                    <p className="font-medium">
                      {h.change_type === "created" && `Created as ${STATUS_LABELS[h.to_status!]}`}
                      {h.change_type === "status" && `${STATUS_LABELS[h.from_status!]} → ${STATUS_LABELS[h.to_status!]}`}
                      {h.change_type === "health" && `Health ${HEALTH_LABELS[h.from_health!]} → ${HEALTH_LABELS[h.to_health!]}`}
                    </p>
                    {h.reason && <p className="text-muted-foreground">{h.reason}</p>}
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(h.changed_at)} · {h.changed_by ? (historyNames.get(h.changed_by) ?? "a user") : "system"}
                    </p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </TabsContent>

        {p.has("audit.read") && (
          <TabsContent value="audit" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Audit trail</CardTitle>
                <CardDescription>Every change to this project record, newest first. Append-only.</CardDescription>
              </CardHeader>
              <CardContent>
                <AuditTrail rows={audit.rows} names={audit.names} />
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function Detail({ label, value, href }: { label: string; value: string | null | undefined; href?: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate">
        {href && value ? (
          <Link href={href} className="text-primary hover:underline">
            {value}
          </Link>
        ) : (
          (value ?? "—")
        )}
      </dd>
    </>
  );
}

function Prose({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="mb-1 font-medium">{label}</p>
      <p className="whitespace-pre-wrap text-muted-foreground">{value || "Not recorded."}</p>
    </div>
  );
}
