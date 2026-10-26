import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import { AccessDenied } from "@/components/common/states";
import { ProjectForm } from "@/components/projects/project-form";
import { requireOrgContext } from "@/lib/auth/org-context";
import { loadProjectFormOptions } from "@/lib/data/options";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage() {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("project.create")) return <AccessDenied what="project creation" />;
  const options = await loadProjectFormOptions(ctx);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="New project"
        description="New projects start in the Proposed stage with health Not assessed."
        breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: "New" }]}
      />
      <ProjectForm {...options} defaultValues={{ projectManagerId: ctx.membershipId }} />
    </div>
  );
}
