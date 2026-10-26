import Link from "next/link";
import { notFound } from "next/navigation";

import { ArchivedBadge, HealthBadge, StatusBadge } from "@/components/common/badges";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { requireOrgContext } from "@/lib/auth/org-context";
import { getProject } from "@/lib/data/projects";
import { isHealthStale, isPastTargetEnd } from "@/lib/domain/kpis";
import { formatRelative } from "@/lib/format";

import { ProjectNav } from "./project-nav";

export default async function ProjectLayout({ children, params }: LayoutProps<"/projects/[projectId]">) {
  const { projectId } = await params;
  const ctx = await requireOrgContext();
  const project = await getProject(ctx, projectId);
  if (!project) notFound();

  const now = new Date();
  const archived = project.archived_at !== null;
  const stale = isHealthStale(project, now, ctx.settings.healthStaleAfterDays);
  const overdue = !["completed", "cancelled"].includes(project.status) && isPastTargetEnd(project, now, ctx.settings.timezone);
  const canWork = ctx.permissions.has("work.read");

  const tabs = [
    { segment: "", label: "Overview" },
    ...(canWork
      ? [
          { segment: "backlog", label: "Backlog" },
          { segment: "board", label: "Board" },
          { segment: "sprints", label: "Sprints" },
        ]
      : []),
    { segment: "milestones", label: "Milestones" },
    { segment: "reports", label: "Status reports" },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        breadcrumbs={[
          { label: "Projects", href: "/projects" },
          ...(project.program ? [{ label: project.program.name, href: `/programs/${project.program.id}` }] : []),
          { label: project.code },
        ]}
        title={
          <>
            <span className="mr-2 font-mono text-base text-muted-foreground">{project.code}</span>
            {project.name}
          </>
        }
        meta={
          <>
            <StatusBadge status={project.status} />
            <HealthBadge health={project.health} />
            {archived && <ArchivedBadge />}
            {project.program && (
              <Badge variant="outline" asChild>
                <Link href={`/programs/${project.program.id}`}>Program: {project.program.code}</Link>
              </Badge>
            )}
            {overdue && <span className="text-xs font-medium text-health-red">Past target end date</span>}
            {stale && !archived && (
              <span className="text-xs text-muted-foreground">
                Health {project.health === "not_assessed" ? "never assessed" : `last confirmed ${formatRelative(project.health_updated_at)}`}
              </span>
            )}
          </>
        }
      />
      <ProjectNav projectId={project.id} tabs={tabs} />
      {children}
    </div>
  );
}
