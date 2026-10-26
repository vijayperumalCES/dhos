import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import { AccessDenied } from "@/components/common/states";
import { TeamForm } from "@/components/teams/team-form";
import { requireOrgContext } from "@/lib/auth/org-context";
import { loadProjectFormOptions } from "@/lib/data/options";

export const metadata: Metadata = { title: "New team" };

export default async function NewTeamPage() {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("team.manage")) return <AccessDenied what="team management" />;
  const { members } = await loadProjectFormOptions(ctx);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New team" breadcrumbs={[{ label: "People & Teams", href: "/teams" }, { label: "New" }]} />
      <TeamForm members={members} />
    </div>
  );
}
