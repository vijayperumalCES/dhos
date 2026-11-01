import { PageHeader } from "@/components/common/page-header";
import { SectionNav } from "@/components/common/section-nav";
import { AccessDenied } from "@/components/common/states";
import { requireOrgContext } from "@/lib/auth/org-context";

export default async function GovernanceLayout({ children }: LayoutProps<"/governance">) {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("governance.read")) return <AccessDenied what="governance records" />;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Governance"
        description="Risks, decisions, actions, escalations and change requests across the projects you can see."
      />
      <SectionNav
        label="Governance sections"
        items={[
          { href: "/governance", label: "Overview", exact: true },
          { href: "/governance/raid", label: "RAID register" },
          { href: "/governance/actions", label: "Actions" },
          { href: "/governance/decisions", label: "Decisions" },
          { href: "/governance/escalations", label: "Escalations" },
          { href: "/governance/changes", label: "Change requests" },
        ]}
      />
      {children}
    </div>
  );
}
