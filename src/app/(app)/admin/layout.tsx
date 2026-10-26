import { PageHeader } from "@/components/common/page-header";
import { AccessDenied } from "@/components/common/states";
import { requireOrgContext } from "@/lib/auth/org-context";

import { AdminNav } from "./admin-nav";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const ctx = await requireOrgContext();
  const p = ctx.permissions;
  const items = [
    p.has("org.settings.manage") && { href: "/admin", label: "Settings" },
    p.has("org.members.read") && { href: "/admin/members", label: "Members" },
    p.has("org.members.read") && { href: "/admin/roles", label: "Roles & permissions" },
    p.has("audit.read") && { href: "/admin/audit", label: "Audit log" },
  ].filter((x): x is { href: string; label: string } => Boolean(x));

  if (items.length === 0) return <AccessDenied what="administration" />;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Administration" description={`Configuration for ${ctx.organization.name}.`} />
      <AdminNav items={items} />
      {children}
    </div>
  );
}
