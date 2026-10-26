import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { HealthBadge, StatusBadge } from "@/components/common/badges";
import { MilestoneStatusBadge, VarianceLabel } from "@/components/common/milestone-badge";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/states";
import { ProgramStatusButton } from "@/components/programs/program-status-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgContext } from "@/lib/auth/org-context";
import { getProgram, getProgramProjects } from "@/lib/data/programs";
import { todayInTimeZone } from "@/lib/domain/time";
import { milestoneStatus } from "@/lib/domain/work";
import { formatDate, personName } from "@/lib/format";

export const metadata: Metadata = { title: "Program" };

export default async function ProgramPage({ params }: PageProps<"/programs/[programId]">) {
  const { programId } = await params;
  const ctx = await requireOrgContext();
  const program = await getProgram(ctx, programId);
  if (!program) notFound();
  const projects = await getProgramProjects(ctx, program.id);
  const today = todayInTimeZone(new Date(), ctx.settings.timezone);
  const canManage = ctx.permissions.has("program.manage");

  const milestones = projects
    .flatMap((p) => p.project_milestones.map((m) => ({ ...m, project: p, status: milestoneStatus(m, today) })))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const open = milestones.filter((m) => m.status !== "achieved");
  const overdue = open.filter((m) => m.status === "overdue").length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Programs", href: "/programs" }, { label: program.code }]}
        title={program.name}
        description={program.description}
        meta={
          <>
            <span className="font-mono text-xs text-muted-foreground">{program.code}</span>
            <span className="text-sm text-muted-foreground">Owner: {personName(program.owner)}</span>
            {program.status === "closed" && <Badge variant="outline">Closed</Badge>}
          </>
        }
        actions={
          canManage && (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/programs/${program.id}/edit`}>
                  <Pencil className="size-4" /> Edit
                </Link>
              </Button>
              <ProgramStatusButton id={program.id} status={program.status} />
            </>
          )
        }
      />

      <Card className="pb-0">
        <CardHeader>
          <CardTitle>Projects ({projects.length})</CardTitle>
          <CardDescription>Assign a project to this program from the project&apos;s Edit page.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {projects.length === 0 ? (
            <EmptyState className="mx-6 mb-6" title="No visible projects in this program" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead className="hidden md:table-cell">Manager</TableHead>
                  <TableHead className="hidden sm:table-cell">Target end</TableHead>
                  <TableHead className="pr-6 text-right">Overdue milestones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((p) => {
                  const late = p.project_milestones.filter((m) => milestoneStatus(m, today) === "overdue").length;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="pl-6">
                        <Link href={`/projects/${p.id}`} className="font-medium hover:underline">
                          <span className="mr-1.5 font-mono text-xs text-muted-foreground">{p.code}</span>
                          {p.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={p.status} />
                      </TableCell>
                      <TableCell>
                        <HealthBadge health={p.health} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{personName(p.manager)}</TableCell>
                      <TableCell className="hidden sm:table-cell">{formatDate(p.target_end_date)}</TableCell>
                      <TableCell className={late ? "pr-6 text-right font-medium text-health-red tabular-nums" : "pr-6 text-right tabular-nums"}>{late}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="pb-0">
        <CardHeader>
          <CardTitle>Milestones across the program</CardTitle>
          <CardDescription>
            {open.length} open · {overdue} overdue. Variance compares the current due date with the last baseline.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {milestones.length === 0 ? (
            <EmptyState className="mx-6 mb-6" title="No milestones yet" description="Add milestones on each project's Milestones tab." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Milestone</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Variance</TableHead>
                  <TableHead className="pr-6">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {milestones.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="pl-6 font-medium">{m.name}</TableCell>
                    <TableCell>
                      <Link href={`/projects/${m.project.id}/milestones`} className="font-mono text-xs hover:underline">
                        {m.project.code}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">{formatDate(m.due_date)}</TableCell>
                    <TableCell>
                      <VarianceLabel milestone={m} />
                    </TableCell>
                    <TableCell className="pr-6">
                      <MilestoneStatusBadge status={m.status} />
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
