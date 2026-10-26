import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { AccessDenied } from "@/components/common/states";
import { ProjectForm } from "@/components/projects/project-form";
import { requireOrgContext } from "@/lib/auth/org-context";
import { loadProjectFormOptions } from "@/lib/data/options";
import { getProject } from "@/lib/data/projects";
import { NONE } from "@/lib/validation/common";

export const metadata: Metadata = { title: "Edit project" };

export default async function EditProjectPage({ params }: PageProps<"/projects/[projectId]/edit">) {
  const { projectId } = await params;
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("project.update")) return <AccessDenied what="project editing" />;
  const [project, options] = await Promise.all([getProject(ctx, projectId), loadProjectFormOptions(ctx)]);
  if (!project) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={`Edit ${project.code}`}
        breadcrumbs={[
          { label: "Projects", href: "/projects" },
          { label: project.code, href: `/projects/${project.id}` },
          { label: "Edit" },
        ]}
      />
      <ProjectForm
        projectId={project.id}
        {...options}
        defaultValues={{
          code: project.code,
          name: project.name,
          description: project.description ?? "",
          clientId: project.client_id ?? NONE,
          sponsorName: project.sponsor_name ?? "",
          projectManagerId: project.project_manager_id ?? NONE,
          deliveryOwnerId: project.delivery_owner_id ?? NONE,
          primaryTeamId: project.primary_team_id ?? NONE,
          methodology: project.methodology,
          plannedStartDate: project.planned_start_date ?? "",
          targetEndDate: project.target_end_date ?? "",
          objectives: project.objectives ?? "",
          scopeSummary: project.scope_summary ?? "",
          assumptions: project.assumptions ?? "",
          projectConstraints: project.project_constraints ?? "",
        }}
      />
    </div>
  );
}
