import type { Metadata } from "next";
import Link from "next/link";

import { HealthBadge, StatusBadge } from "@/components/common/badges";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/auth/org-context";
import { listClients } from "@/lib/data/clients";
import { listProjects } from "@/lib/data/projects";
import { listTeams } from "@/lib/data/teams";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const ctx = await requireOrgContext();
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 100);
  const p = ctx.permissions;

  if (!q) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Search" />
        <EmptyState title="Type in the search box above" description="Search covers projects, teams and clients you can access." />
      </div>
    );
  }

  const [projects, teams, clients] = await Promise.all([
    p.canReadProjects ? listProjects(ctx, { q, status: "all", archived: "include" }).then((r) => r.rows) : [],
    p.has("team.read") ? listTeams(ctx, { q, archived: "include" }) : [],
    p.has("client.read") ? listClients(ctx, { q, archived: "include" }) : [],
  ]);
  const total = projects.length + teams.length + clients.length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={`Results for “${q}”`} description={`${total} match${total === 1 ? "" : "es"} across records you can access.`} />
      {total === 0 && <EmptyState title="No matches" description="Try a project code, part of a name, or a client code." />}
      {projects.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {projects.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/projects/${r.id}`} className="truncate hover:underline">
                    <span className="mr-1.5 font-mono text-xs text-muted-foreground">{r.code}</span>
                    {r.name}
                  </Link>
                  <span className="flex shrink-0 gap-1">
                    <StatusBadge status={r.status} />
                    <HealthBadge health={r.health} />
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {teams.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Teams</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {teams.map((t) => (
                <li key={t.id} className="py-2">
                  <Link href={`/teams/${t.id}`} className="hover:underline">
                    {t.name}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {clients.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Clients</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {clients.map((c) => (
                <li key={c.id} className="py-2">
                  <Link href={`/clients/${c.id}`} className="hover:underline">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
