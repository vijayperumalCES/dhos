import { Suspense } from "react";

import { AppSidebar } from "@/components/shell/app-sidebar";
import { DemoBanner } from "@/components/shell/demo-banner";
import { TopBar, type QuickCreate } from "@/components/shell/top-bar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requireOrgContext } from "@/lib/auth/org-context";
import { buildNavigation } from "@/lib/navigation";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await requireOrgContext();
  const p = ctx.permissions;

  const quickCreate: QuickCreate = [
    p.has("project.create") && { label: "New project", href: "/projects/new" },
    p.has("team.manage") && { label: "New team", href: "/teams/new" },
    p.has("client.manage") && { label: "New client", href: "/clients/new" },
    p.has("org.members.manage") && { label: "Invite member", href: "/admin/members#invite" },
  ].filter((x): x is QuickCreate[number] => Boolean(x));

  return (
    <SidebarProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>
      <AppSidebar
        navigation={buildNavigation(p)}
        organization={ctx.organization}
        organizations={ctx.organizations}
        user={{ displayName: ctx.user.displayName, email: ctx.user.email }}
        roleNames={ctx.roles.map((r) => r.name)}
      />
      <SidebarInset>
        {ctx.organization.isDemo && <DemoBanner orgName={ctx.organization.name} />}
        <Suspense>
          <TopBar quickCreate={quickCreate} />
        </Suspense>
        <main id="main" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
