import { PageHeader } from "@/components/common/page-header";
import { SectionNav } from "@/components/common/section-nav";
import { AccessDenied } from "@/components/common/states";
import { requireOrgContext } from "@/lib/auth/org-context";

export default async function AutomationLayout({ children }: LayoutProps<"/automation">) {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("automation.read")) return <AccessDenied what="workflow automation" />;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Workflow Automation" description="Rules, webhooks and scheduled jobs that react to what happens in Stride. Everything here runs from recorded events, never from free text." />
      <SectionNav
        label="Automation sections"
        items={[
          { href: "/automation", label: "Rules", exact: true },
          { href: "/automation/webhooks", label: "Webhooks" },
          { href: "/automation/deliveries", label: "Deliveries" },
          { href: "/automation/events", label: "Event stream" },
          { href: "/automation/scheduler", label: "Scheduler" },
        ]}
      />
      {children}
    </div>
  );
}
