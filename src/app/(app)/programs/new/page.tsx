import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import { AccessDenied } from "@/components/common/states";
import { ProgramForm } from "@/components/programs/program-form";
import { requireOrgContext } from "@/lib/auth/org-context";
import { loadProjectFormOptions } from "@/lib/data/options";

export const metadata: Metadata = { title: "New program" };

export default async function NewProgramPage() {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("program.manage")) return <AccessDenied what="program management" />;
  const { members } = await loadProjectFormOptions(ctx);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New program" breadcrumbs={[{ label: "Programs", href: "/programs" }, { label: "New" }]} />
      <ProgramForm members={members} defaultValues={{ ownerId: ctx.membershipId }} />
    </div>
  );
}
