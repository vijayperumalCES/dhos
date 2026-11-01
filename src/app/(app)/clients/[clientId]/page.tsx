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
import { ContactDialog, ContactRowActions, ContractDialog, ContractRowActions } from "@/components/clients/client-records";
import { ContractStatusBadge } from "@/components/governance/badges";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ContractValueDialog } from "@/components/finance/finance-controls";
import { listClientContacts, listClientContracts } from "@/lib/data/client-records";
import { listContractValues } from "@/lib/data/finance";
import { BILLING_MODEL_LABELS, formatMoney, type BillingModel } from "@/lib/domain/finance";
import { getClient, getClientProjects } from "@/lib/data/clients";
import { CONTRACT_TYPE_LABELS, contractTiming } from "@/lib/domain/governance";
import { todayInTimeZone } from "@/lib/domain/time";
import { formatDate, personName } from "@/lib/format";

export const metadata: Metadata = { title: "Client" };

export default async function ClientPage({ params }: PageProps<"/clients/[clientId]">) {
  const { clientId } = await params;
  const ctx = await requireOrgContext();
  const client = await getClient(ctx, clientId);
  if (!client) notFound();
  const projects = ctx.permissions.canReadProjects ? await getClientProjects(ctx, client.id) : [];
  const canManage = ctx.permissions.has("client.manage");
  const archived = client.archived_at !== null;
  const canSeeValues = ctx.permissions.has("finance.read");
  const canSetValues = ctx.permissions.has("finance.manage");
  const [contacts, contracts, values] = await Promise.all([
    listClientContacts(client.id),
    listClientContracts(client.id),
    canSeeValues ? listContractValues(client.id) : Promise.resolve(new Map<string, { totalValue: number; billingModel: string; notes: string | null }>()),
  ]);
  const today = todayInTimeZone(new Date(), ctx.settings.timezone);
  const activeContacts = contacts.filter((c) => !c.archived_at);
  const activeContracts = contracts.filter((c) => !c.archived_at);

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

      <div className="mt-6 space-y-6">
        <Card className="pb-0">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle>Contacts</CardTitle>
              <CardDescription>
                People at the client. {client.confidentiality === "confidential" ? "Visible only to people who can see this confidential client." : "Visible to anyone who can see this client."}
              </CardDescription>
            </div>
            {canManage && !archived && <ContactDialog clientId={client.id} />}
          </CardHeader>
          <CardContent className="px-0">
            {activeContacts.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">No contacts recorded.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="hidden md:table-cell">Phone</TableHead>
                    {canManage && (
                      <TableHead className="w-12 pr-6">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeContacts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="pl-6">
                        <div className="font-medium">
                          {c.name} {c.is_primary && <Badge variant="outline">Primary</Badge>}
                        </div>
                        {c.job_title && <div className="text-xs text-muted-foreground">{c.job_title}</div>}
                      </TableCell>
                      <TableCell>{c.email ? <a href={`mailto:${c.email}`} className="text-primary hover:underline">{c.email}</a> : "—"}</TableCell>
                      <TableCell className="hidden md:table-cell">{c.phone ?? "—"}</TableCell>
                      {canManage && (
                        <TableCell className="pr-6">
                          <ContactRowActions clientId={client.id} contact={c} />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="pb-0">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle>Contracts</CardTitle>
              <CardDescription>Terms and dates. Active contracts inside their notice period (60 days when none is set) are flagged.</CardDescription>
            </div>
            {canManage && !archived && <ContractDialog clientId={client.id} />}
          </CardHeader>
          <CardContent className="px-0">
            {activeContracts.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">No contracts recorded.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Contract</TableHead>
                    <TableHead>Term</TableHead>
                    <TableHead>Status</TableHead>
                    {canSeeValues && <TableHead className="text-right">Value</TableHead>}
                    {canManage && (
                      <TableHead className="w-12 pr-6">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeContracts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="pl-6">
                        <div className="font-medium">{c.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {CONTRACT_TYPE_LABELS[c.contract_type]}
                          {c.reference ? ` · ${c.reference}` : ""}
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatDate(c.start_date)} – {formatDate(c.end_date)}
                      </TableCell>
                      <TableCell>
                        <ContractStatusBadge status={c.status} timing={contractTiming(c, today)} />
                      </TableCell>
                      {canSeeValues && (
                        <TableCell className="text-right">
                          {values.get(c.id) ? (
                            <div className="tabular-nums">
                              {formatMoney(values.get(c.id)!.totalValue, ctx.settings.currencyCode)}
                              <div className="text-xs text-muted-foreground">{BILLING_MODEL_LABELS[values.get(c.id)!.billingModel as BillingModel]}</div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          {canSetValues && !archived && <ContractValueDialog clientId={client.id} contractId={c.id} title={c.title} current={values.get(c.id)} />}
                        </TableCell>
                      )}
                      {canManage && (
                        <TableCell className="pr-6">
                          <ContractRowActions clientId={client.id} contract={c} />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
