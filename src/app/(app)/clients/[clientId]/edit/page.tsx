import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ClientForm } from "@/components/clients/client-form";
import { PageHeader } from "@/components/common/page-header";
import { AccessDenied } from "@/components/common/states";
import { requireOrgContext } from "@/lib/auth/org-context";
import { getClient } from "@/lib/data/clients";
import { loadProjectFormOptions } from "@/lib/data/options";
import { NONE } from "@/lib/validation/common";

export const metadata: Metadata = { title: "Edit client" };

export default async function EditClientPage({ params }: PageProps<"/clients/[clientId]/edit">) {
  const { clientId } = await params;
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("client.manage")) return <AccessDenied what="client management" />;
  const [client, { members }] = await Promise.all([getClient(ctx, clientId), loadProjectFormOptions(ctx)]);
  if (!client) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`Edit ${client.name}`}
        breadcrumbs={[{ label: "Clients", href: "/clients" }, { label: client.name, href: `/clients/${client.id}` }, { label: "Edit" }]}
      />
      <ClientForm
        clientId={client.id}
        members={members}
        defaultValues={{
          name: client.name,
          code: client.code ?? "",
          industry: client.industry ?? "",
          website: client.website ?? "",
          accountOwnerMembershipId: client.account_owner_membership_id ?? NONE,
          confidentiality: client.confidentiality,
          notes: client.notes ?? "",
        }}
      />
    </div>
  );
}
