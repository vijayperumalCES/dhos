import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ArchiveToggle } from "@/components/common/archive-toggle";
import { AuditTrail } from "@/components/common/audit-trail";
import { ArchivedBadge, HealthBadge, StatusBadge } from "@/components/common/badges";
import { AddMemberDialog, RemoveMemberButton } from "@/components/common/member-management";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgContext } from "@/lib/auth/org-context";
import { listAuditLogs } from "@/lib/data/audit";
import { listMemberOptions } from "@/lib/data/members";
import { getTeam, getTeamMembers, getTeamProjects } from "@/lib/data/teams";
import { formatDate, personName } from "@/lib/format";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage({ params }: PageProps<"/teams/[teamId]">) {
  const { teamId } = await params;
  const ctx = await requireOrgContext();
  const team = await getTeam(ctx, teamId);
  if (!team) notFound();

  const canManage = ctx.permissions.has("team.manage");
  const archived = team.archived_at !== null;
  const [members, projects, options, audit] = await Promise.all([
    getTeamMembers(team.id),
    ctx.permissions.canReadProjects ? getTeamProjects(ctx, team.id) : Promise.resolve([]),
    canManage ? listMemberOptions(ctx) : Promise.resolve([]),
    listAuditLogs(ctx, { entityType: "teams", entityId: team.id, pageSize: 20 }),
  ]);
  const onTeam = new Set(members.map((m) => m.membership_id));
  const candidates = options.filter((m) => !onTeam.has(m.id)).map((m) => ({ value: m.id, label: m.displayName }));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        breadcrumbs={[{ label: "People & Teams", href: "/teams" }, { label: team.name }]}
        title={team.name}
        description={team.description}
        meta={
          <>
            <span className="text-sm text-muted-foreground">Lead: {personName(team.lead)}</span>
            {archived && <ArchivedBadge />}
          </>
        }
        actions={
          canManage && (
            <>
              {!archived && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/teams/${team.id}/edit`}>
                    <Pencil className="size-4" /> Edit
                  </Link>
                </Button>
              )}
              <ArchiveToggle kind="team" id={team.id} archived={archived} label={team.name} />
            </>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="space-y-1.5">
              <CardTitle>Members ({members.length})</CardTitle>
              <CardDescription>Team membership is organizational and does not grant project access.</CardDescription>
            </div>
            {canManage && !archived && <AddMemberDialog target={{ kind: "team", teamId: team.id }} candidates={candidates} />}
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <EmptyState title="No members yet" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Team role</TableHead>
                    <TableHead className="hidden sm:table-cell">Joined</TableHead>
                    {canManage && !archived && <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => {
                    const name = m.member?.user_profiles?.display_name ?? "Member";
                    return (
                      <TableRow key={m.membership_id}>
                        <TableCell>
                          <div className="font-medium">
                            {name}
                            {m.member?.status === "suspended" && <span className="ml-2 text-xs text-muted-foreground">(suspended)</span>}
                          </div>
                          <div className="text-xs text-muted-foreground">{m.member?.user_profiles?.email}</div>
                        </TableCell>
                        <TableCell>{m.team_role ?? "—"}</TableCell>
                        <TableCell className="hidden sm:table-cell">{formatDate(m.joined_at)}</TableCell>
                        {canManage && !archived && (
                          <TableCell>
                            <RemoveMemberButton target={{ kind: "team", teamId: team.id }} membershipId={m.membership_id} name={name} />
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
        <Card>
          <CardHeader>
            <CardTitle>Projects (primary team)</CardTitle>
            <CardDescription>Only projects you can view are listed.</CardDescription>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">None.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {projects.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <Link href={`/projects/${p.id}`} className="truncate hover:underline">
                      <span className="mr-1 font-mono text-xs text-muted-foreground">{p.code}</span>
                      {p.name}
                    </Link>
                    <span className="flex shrink-0 gap-1">
                      <StatusBadge status={p.status} />
                      <HealthBadge health={p.health} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        {ctx.permissions.has("audit.read") && (
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Audit trail</CardTitle>
            </CardHeader>
            <CardContent>
              <AuditTrail rows={audit.rows} names={audit.names} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
