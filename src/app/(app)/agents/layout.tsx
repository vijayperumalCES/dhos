import { PageHeader } from "@/components/common/page-header";
import { SectionNav } from "@/components/common/section-nav";
import { AccessDenied } from "@/components/common/states";
import { requireOrgContext } from "@/lib/auth/org-context";

export default async function AgentsLayout({ children }: LayoutProps<"/agents">) {
  const ctx = await requireOrgContext();
  const p = ctx.permissions;
  if (!p.any("agent.read", "agent.run", "agent.approve", "agent.manage")) return <AccessDenied what="AI agents" />;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="AI Agents"
        description="Permission-bounded assistants that read only what you can see, cite their sources, and never act without a person's approval."
      />
      <SectionNav
        label="AI agent sections"
        items={[
          { href: "/agents", label: "Agents", exact: true },
          ...(p.has("agent.run") ? [{ href: "/agents/runs", label: "My runs" }] : []),
          ...(p.any("agent.run", "agent.approve") ? [{ href: "/agents/approvals", label: "Approvals" }] : []),
          ...(p.has("agent.read") ? [{ href: "/agents/usage", label: "Usage" }] : []),
          ...(p.has("agent.manage") ? [{ href: "/agents/settings", label: "Settings" }] : []),
        ]}
      />
      {children}
    </div>
  );
}
