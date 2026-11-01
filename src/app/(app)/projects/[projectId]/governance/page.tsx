import type { Metadata } from "next";
import Link from "next/link";

import { AccessDenied } from "@/components/common/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/auth/org-context";
import { getProjectGovernanceCounts } from "@/lib/data/governance";

export const metadata: Metadata = { title: "Project governance" };

export default async function ProjectGovernancePage({ params }: PageProps<"/projects/[projectId]/governance">) {
  const { projectId } = await params;
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("governance.read")) return <AccessDenied what="this project's governance records" />;
  const c = await getProjectGovernanceCounts(projectId);
  const q = `project=${projectId}`;

  const tiles = [
    { label: "Open risks", value: c.openRisks, href: `/governance/raid?${q}&type=risk&status=open`, hint: "Probability × impact" },
    { label: "Open issues", value: c.openIssues, href: `/governance/raid?${q}&type=issue&status=open`, hint: "Problems happening now" },
    { label: "Open actions", value: c.openActions, href: `/governance/actions?${q}&status=open`, hint: "Owned, with due dates" },
    { label: "Open escalations", value: c.openEscalations, href: `/governance/escalations?${q}&status=open`, hint: "Awaiting a response or resolution" },
    { label: "Changes awaiting a decision", value: c.pendingChanges, href: `/governance/changes?${q}&status=submitted`, hint: "Submitted, not yet decided" },
    { label: "Proposed decisions", value: c.proposedDecisions, href: `/governance/decisions?${q}&status=proposed`, hint: "Not yet accepted or rejected" },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Governance</CardTitle>
          <CardDescription>
            Each tile opens the register filtered to this project, where items are added. Releases and documents have their own pages:{" "}
            <Link href={`/releases?${q}`} className="text-primary hover:underline">
              Releases
            </Link>
            ,{" "}
            <Link href={`/documents?${q}`} className="text-primary hover:underline">
              Documents
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => (
            <Link key={t.label} href={t.href} className="rounded-lg border p-4 transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <p className="text-sm text-muted-foreground">{t.label}</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">{t.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t.hint}</p>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
