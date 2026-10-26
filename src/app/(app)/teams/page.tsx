import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ArchivedBadge } from "@/components/common/badges";
import { FilterBar } from "@/components/common/filter-bar";
import { PageHeader } from "@/components/common/page-header";
import { AccessDenied, EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgContext } from "@/lib/auth/org-context";
import { listTeams } from "@/lib/data/teams";
import { personName } from "@/lib/format";

export const metadata: Metadata = { title: "People & Teams" };

export default async function TeamsPage({ searchParams }: PageProps<"/teams">) {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("team.read")) return <AccessDenied what="teams" />;
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const archived = sp.archived === "include" || sp.archived === "only" ? sp.archived : undefined;
  const teams = await listTeams(ctx, { q, archived });
  const canManage = ctx.permissions.has("team.manage");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="People & Teams"
        description="Organizational teams and their members. Employee profiles, skills and capacity arrive in Phase 3."
        actions={
          <>
            {ctx.permissions.has("org.members.read") && (
              <Button variant="outline" asChild>
                <Link href="/admin/members">Member directory</Link>
              </Button>
            )}
            {canManage && (
              <Button asChild>
                <Link href="/teams/new">
                  <Plus className="size-4" /> New team
                </Link>
              </Button>
            )}
          </>
        }
      />
      <FilterBar
        searchPlaceholder="Search teams"
        filters={[
          {
            key: "archived",
            label: "Archive",
            allLabel: "Active teams",
            options: [
              { value: "include", label: "Include archived" },
              { value: "only", label: "Archived only" },
            ],
          },
        ]}
      />
      {teams.length === 0 ? (
        <EmptyState
          title={q || archived ? "No teams match" : "No teams yet"}
          description={canManage ? "Create teams to organize people and assign primary teams to projects." : undefined}
          action={
            canManage &&
            !q && (
              <Button asChild>
                <Link href="/teams/new">New team</Link>
              </Button>
            )
          }
        />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead className="text-right">Members</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Link href={`/teams/${t.id}`} className="font-medium hover:underline">
                      {t.name}
                    </Link>{" "}
                    {t.archived_at && <ArchivedBadge />}
                    {t.description && <p className="line-clamp-1 text-xs text-muted-foreground">{t.description}</p>}
                  </TableCell>
                  <TableCell>{personName(t.lead)}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.team_members[0]?.count ?? 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
