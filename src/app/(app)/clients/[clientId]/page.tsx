import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ArchiveToggle } from "@/components/common/archive-toggle";
import { ArchivedBadge, HealthBadge, StatusBadge } from "@/components/common/badges";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/auth/org-context";
import { getClient, getClientProjects } from "@/lib/data/clients";
import { personName } from "@/lib/format";

export const metadata: Metadata = { title: "Client" };

export default async function ClientPage({ params }: PageProps<"/clients/[clientId]">) {
  const { clientId } = await params;
  const ctx = await requireOrgContext();
  const client = await getClient(ctx, clientId);
  if (!client) notFound();
  const projects = ctx.permissions.canReadProjects ? await getClientProjects(ctx, client.id) : [];
  const canManage = ctx.permissions.has("client.manage");
  const archived = client.archived_at !== null;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        breadcrumbs={[{ label: "Clients", href: "/clients" }, { label: client.name }]}
        title={client.name}
        meta={
          <>
            {client.code && <span className="font-mono text-xs text-muted-foreground">{client.code}</span>}
            {client.confidentiality === "confidential" && <Badge variant="outline">Confidential</Badge>}
            {archived && <ArchivedBadge />}
          </>
        }
        actions={
          canManage && (
            <>
              {!archived && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/clients/${client.id}/edit`}>
                    <Pencil className="size-4" /> Edit
                  </Link>
                </Button>
              )}
              <ArchiveToggle kind="client" id={client.id} archived={archived} label={client.name} />
            </>
          )
        }
      />
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Industry</dt>
                <dd>{client.industry ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Website</dt>
                <dd className="truncate">
                  {client.website ? (
                    <a href={client.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {client.website}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Account owner</dt>
                <dd>{personName(client.owner)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Notes</dt>
                <dd className="whitespace-pre-wrap">{client.notes ?? "—"}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Projects</CardTitle>
            <CardDescription>Active projects for this client that you can view.</CardDescription>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">None.</p>
            ) : (
              <ul className="divide-y text-sm">
                {projects.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                    <Link href={`/projects/${p.id}`} className="truncate hover:underline">
                      <span className="mr-1.5 font-mono text-xs text-muted-foreground">{p.code}</span>
                      {p.name}
                    </Link>
                    <span className="flex shrink-0 gap-1">
                      <StatusBadge status={p.status} />
                      <HealthBadge health={p.health} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
