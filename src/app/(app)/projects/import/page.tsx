import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import { AccessDenied } from "@/components/common/states";
import { requireOrgContext } from "@/lib/auth/org-context";
import { PROJECT_IMPORT_COLUMNS } from "@/lib/data/project-import";

import { ProjectImport } from "./project-import";

export const metadata: Metadata = { title: "Import projects" };

export default async function ImportProjectsPage() {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("project.create")) return <AccessDenied what="project import" />;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Import projects"
        description="Create many projects at once from a CSV file. Up to 500 rows per file."
        breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: "Import" }]}
      />
      <ProjectImport columns={PROJECT_IMPORT_COLUMNS} />
    </div>
  );
}
