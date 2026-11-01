import type { Metadata } from "next";
import Link from "next/link";

import { EmailStatusBadge, NotificationSeverityBadge } from "@/components/automation/badges";
import { MarkAllReadButton, NotificationRowActions, PreferencesForm } from "@/components/automation/notification-controls";
import { PageHeader } from "@/components/common/page-header";
import { Pagination, withParams } from "@/components/common/pagination";
import { EmptyState } from "@/components/common/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/auth/org-context";
import { CATEGORY_LABELS, type EventCategory } from "@/lib/automation/events";
import { getPreferences, listNotifications } from "@/lib/data/automation";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const ctx = await requireOrgContext();
  const raw = await searchParams;
  const one = (k: string) => (Array.isArray(raw[k]) ? raw[k][0] : raw[k]) as string | undefined;
  const filter = one("show") === "all" ? "all" : "unread";
  const page = Math.max(1, Number(one("page")) || 1);
  const [{ rows, total, pageSize }, prefs] = await Promise.all([listNotifications(ctx, filter, page), getPreferences(ctx)]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Notifications"
        description="What needs your attention, from the projects and records you can see. Repeats of the same thing collapse into one line while it is unread."
        actions={<MarkAllReadButton disabled={rows.every((r) => r.read_at !== null)} />}
      />
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Inbox</CardTitle>
            <nav aria-label="Inbox filter" className="flex gap-1 text-sm">
              {(["unread", "all"] as const).map((f) => (
                <Link key={f} href={withParams("/notifications", {}, { show: f === "all" ? "all" : undefined })} aria-current={filter === f ? "page" : undefined} className={cn("rounded-md px-2.5 py-1", filter === f ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}>
                  {f === "unread" ? "Unread" : "All"}
                </Link>
              ))}
            </nav>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState title={filter === "unread" ? "You're all caught up" : "No notifications yet"} description="Alerts about health changes, assignments, approvals, escalations and reminders arrive here." />
          ) : (
            <ul className="divide-y">
              {rows.map((n) => (
                <li key={n.id} className="flex items-start gap-3 py-3">
                  <span aria-hidden className={cn("mt-2 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-primary")} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {n.link ? (
                        <Link href={n.link} className={cn("underline-offset-2 hover:underline", !n.read_at && "font-medium")}>
                          {n.title}
                        </Link>
                      ) : (
                        <span className={cn(!n.read_at && "font-medium")}>{n.title}</span>
                      )}
                      {n.occurrences > 1 && <span className="text-xs text-muted-foreground">×{n.occurrences}</span>}
                      {n.severity !== "info" && <NotificationSeverityBadge severity={n.severity as "warning" | "critical"} />}
                      <EmailStatusBadge status={n.email_status} />
                    </div>
                    {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
                    <p className="text-xs text-muted-foreground">
                      {CATEGORY_LABELS[n.category as EventCategory]} · {formatDateTime(n.updated_at, ctx.settings.timezone)}
                    </p>
                  </div>
                  <NotificationRowActions id={n.id} read={n.read_at !== null} />
                </li>
              ))}
            </ul>
          )}
          <Pagination page={page} pageSize={pageSize} total={total} hrefForPage={(p) => withParams("/notifications", { show: filter === "all" ? "all" : undefined }, { page: String(p) })} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>Choose where each kind of notification reaches you. Email is sent only when your organization has configured an email provider; otherwise it is recorded as simulated.</CardDescription>
        </CardHeader>
        <CardContent>
          <PreferencesForm initial={Object.fromEntries([...prefs].map(([k, v]) => [k, { inApp: v.in_app, email: v.email }]))} />
        </CardContent>
      </Card>
    </div>
  );
}
