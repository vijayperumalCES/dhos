import type { Metadata } from "next";

import { ClientForm } from "@/components/clients/client-form";
import { PageHeader } from "@/components/common/page-header";
import { AccessDenied } from "@/components/common/states";
import { requireOrgContext } from "@/lib/auth/org-context";
import { loadProjectFormOptions } from "@/lib/data/options";

export const metadata: Metadata = { title: "New client" };

export default async function NewClientPage() {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("client.manage")) return <AccessDenied what="client management" />;
  const { members } = await loadProjectFormOptions(ctx);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New client" breadcrumbs={[{ label: "Clients", href: "/clients" }, { label: "New" }]} />
      <ClientForm members={members} defaultValues={{ accountOwnerMembershipId: ctx.membershipId }} />
    </div>
  );
}
