import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { AccessDenied } from "@/components/common/states";
import { TeamForm } from "@/components/teams/team-form";
import { requireOrgContext } from "@/lib/auth/org-context";
import { loadProjectFormOptions } from "@/lib/data/options";
import { getTeam } from "@/lib/data/teams";
import { NONE } from "@/lib/validation/common";

export const metadata: Metadata = { title: "Edit team" };

export default async function EditTeamPage({ params }: PageProps<"/teams/[teamId]/edit">) {
  const { teamId } = await params;
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("team.manage")) return <AccessDenied what="team management" />;
  const [team, { members }] = await Promise.all([getTeam(ctx, teamId), loadProjectFormOptions(ctx)]);
  if (!team) notFound();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={`Edit ${team.name}`}
        breadcrumbs={[{ label: "People & Teams", href: "/teams" }, { label: team.name, href: `/teams/${team.id}` }, { label: "Edit" }]}
      />
      <TeamForm
        teamId={team.id}
        members={members}
        defaultValues={{ name: team.name, description: team.description ?? "", leadMembershipId: team.lead_membership_id ?? NONE }}
      />
    </div>
  );
}
