import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { AccessDenied } from "@/components/common/states";
import { ProgramForm } from "@/components/programs/program-form";
import { requireOrgContext } from "@/lib/auth/org-context";
import { loadProjectFormOptions } from "@/lib/data/options";
import { getProgram } from "@/lib/data/programs";
import { NONE } from "@/lib/validation/common";

export const metadata: Metadata = { title: "Edit program" };

export default async function EditProgramPage({ params }: PageProps<"/programs/[programId]/edit">) {
  const { programId } = await params;
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("program.manage")) return <AccessDenied what="program management" />;
  const [program, { members }] = await Promise.all([getProgram(ctx, programId), loadProjectFormOptions(ctx)]);
  if (!program) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`Edit ${program.name}`}
        breadcrumbs={[{ label: "Programs", href: "/programs" }, { label: program.code, href: `/programs/${program.id}` }, { label: "Edit" }]}
      />
      <ProgramForm
        programId={program.id}
        members={members}
        defaultValues={{ code: program.code, name: program.name, description: program.description ?? "", ownerId: program.owner_membership_id ?? NONE }}
      />
    </div>
  );
}
