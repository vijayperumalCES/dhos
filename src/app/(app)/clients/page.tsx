import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ArchivedBadge } from "@/components/common/badges";
import { FilterBar } from "@/components/common/filter-bar";
import { PageHeader } from "@/components/common/page-header";
import { AccessDenied, EmptyState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgContext } from "@/lib/auth/org-context";
import { listClients } from "@/lib/data/clients";
import { personName } from "@/lib/format";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: PageProps<"/clients">) {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("client.read")) return <AccessDenied what="clients" />;
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const archived = sp.archived === "include" || sp.archived === "only" ? sp.archived : undefined;
  const clients = await listClients(ctx, { q, archived });
  const canManage = ctx.permissions.has("client.manage");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Clients"
        description="Client organizations your projects deliver for. Contacts and contract metadata arrive in Phase 4."
        actions={
          canManage && (
            <Button asChild>
              <Link href="/clients/new">
                <Plus className="size-4" /> New client
              </Link>
            </Button>
          )
        }
      />
      <FilterBar
        searchPlaceholder="Search name or code"
        filters={[
          {
            key: "archived",
            label: "Archive",
            allLabel: "Active clients",
            options: [
              { value: "include", label: "Include archived" },
              { value: "only", label: "Archived only" },
            ],
          },
        ]}
      />
      {clients.length === 0 ? (
        <EmptyState
          title={q || archived ? "No clients match" : "No clients yet"}
          action={
            canManage &&
            !q && (
              <Button asChild>
                <Link href="/clients/new">New client</Link>
              </Button>
            )
          }
        />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead className="hidden sm:table-cell">Industry</TableHead>
                <TableHead className="hidden md:table-cell">Account owner</TableHead>
                <TableHead className="text-right">Projects</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/clients/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>{" "}
                    {c.code && <span className="font-mono text-xs text-muted-foreground">{c.code}</span>}{" "}
                    {c.confidentiality === "confidential" && <Badge variant="outline">Confidential</Badge>} {c.archived_at && <ArchivedBadge />}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{c.industry ?? "—"}</TableCell>
                  <TableCell className="hidden md:table-cell">{personName(c.owner)}</TableCell>
                  <TableCell className="text-right tabular-nums" title="Projects visible to you">
                    {c.projects[0]?.count ?? 0}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
