"use client";

import {
  AlertTriangle,
  Bell,
  Bot,
  Briefcase,
  Building2,
  Calendar,
  ChartGantt,
  Clock,
  FileText,
  Folder,
  Gauge,
  KanbanSquare,
  Layers,
  MessagesSquare,
  Plug,
  Rocket,
  ScrollText,
  Settings,
  Timer,
  Users,
  Wallet,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import type { OrgSummary } from "@/lib/auth/org-context";
import type { NavGroup, NavIcon } from "@/lib/navigation";

import { OrgSwitcher } from "./org-switcher";
import { UserMenu } from "./user-menu";

const ICONS: Record<NavIcon, LucideIcon> = {
  gauge: Gauge,
  briefcase: Briefcase,
  folder: Folder,
  layers: Layers,
  building: Building2,
  kanban: KanbanSquare,
  rocket: Rocket,
  users: Users,
  clock: Clock,
  calendar: Calendar,
  timer: Timer,
  chart: ChartGantt,
  alert: AlertTriangle,
  wallet: Wallet,
  messages: MessagesSquare,
  report: ScrollText,
  file: FileText,
  bot: Bot,
  workflow: Workflow,
  plug: Plug,
  bell: Bell,
  settings: Settings,
};

type Props = {
  navigation: NavGroup[];
  organization: OrgSummary;
  organizations: OrgSummary[];
  user: { displayName: string; email: string };
  roleNames: string[];
};

export function AppSidebar({ navigation, organization, organizations, user, roleNames }: Props) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <OrgSwitcher current={organization} organizations={organizations} />
      </SidebarHeader>
      <SidebarContent>
        {navigation.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = ICONS[item.icon];
                  const href = item.href ?? `/roadmap/${item.slug}`;
                  const active = pathname === href || pathname.startsWith(`${href}/`);
                  const planned = item.plannedPhase !== undefined;
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={planned ? `${item.title} — planned for Phase ${item.plannedPhase}` : item.title}
                        className={planned ? "text-sidebar-foreground/55" : undefined}
                      >
                        <Link href={href} prefetch={planned ? false : undefined}>
                          <Icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                      {planned && (
                        <SidebarMenuBadge
                          className="text-[10px] font-medium text-sidebar-foreground/50"
                          aria-label={`Planned for phase ${item.plannedPhase}`}
                        >
                          P{item.plannedPhase}
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <UserMenu user={user} roleNames={roleNames} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
