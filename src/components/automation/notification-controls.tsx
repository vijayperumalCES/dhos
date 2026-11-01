"use client";

import { Bell, Check, CheckCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { deleteNotification, markAllNotificationsRead, markNotificationRead, savePreferences } from "@/lib/actions/automation";
import { CATEGORY_LABELS, type EventCategory } from "@/lib/automation/events";
import { NOTIFICATION_CATEGORIES } from "@/lib/validation/automation";

export type BellItem = { id: string; title: string; body: string | null; link: string | null; severity: string; occurrences: number };

export function NotificationBell({ unread, recent }: { unread: number; recent: BellItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"} className="relative">
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 font-medium text-primary-foreground" data-testid="unread-count">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-1rem)] p-0 text-sm">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="font-medium">Notifications</p>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await markAllNotificationsRead();
                  if (!r.ok) toast.error(r.error);
                  router.refresh();
                })
              }
            >
              <CheckCheck className="size-4" /> Mark all read
            </Button>
          )}
        </div>
        {recent.length === 0 ? (
          <p className="px-3 py-6 text-center text-muted-foreground">You&apos;re all caught up.</p>
        ) : (
          <ul className="max-h-80 divide-y overflow-y-auto">
            {recent.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.link ?? "/notifications"}
                  className="block px-3 py-2 hover:bg-muted"
                  onClick={() => {
                    setOpen(false);
                    void markNotificationRead(n.id).then(() => router.refresh());
                  }}
                >
                  <span className="flex items-center gap-2">
                    {n.severity !== "info" && <span aria-hidden className={`size-2 shrink-0 rounded-full ${n.severity === "critical" ? "bg-health-red" : "bg-health-amber"}`} />}
                    <span className="font-medium">{n.title}</span>
                    {n.occurrences > 1 && <span className="text-xs text-muted-foreground">×{n.occurrences}</span>}
                  </span>
                  {n.body && <span className="mt-0.5 line-clamp-2 block text-muted-foreground">{n.body}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t px-3 py-2">
          <Link href="/notifications" className="text-sm underline underline-offset-2" onClick={() => setOpen(false)}>
            Open the notification center
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function MarkAllReadButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled || pending}
      onClick={() =>
        start(async () => {
          const r = await markAllNotificationsRead();
          if (r.ok) toast.success(r.message);
          else toast.error(r.error);
          router.refresh();
        })
      }
    >
      <CheckCheck className="size-4" /> Mark all read
    </Button>
  );
}

export function NotificationRowActions({ id, read }: { id: string; read: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok && r.error) toast.error(r.error);
      router.refresh();
    });
  return (
    <div className="flex items-center justify-end gap-1">
      {!read && (
        <Button variant="ghost" size="icon" aria-label="Mark as read" disabled={pending} onClick={() => run(() => markNotificationRead(id))}>
          <Check className="size-4" />
        </Button>
      )}
      <Button variant="ghost" size="icon" aria-label="Delete notification" disabled={pending} onClick={() => run(() => deleteNotification(id))}>
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

export function PreferencesForm({ initial }: { initial: Record<string, { inApp: boolean; email: boolean }> }) {
  const router = useRouter();
  const [prefs, setPrefs] = useState(() => Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c, initial[c] ?? { inApp: true, email: false }])));
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-2 font-medium">Category</th>
            <th className="py-2 text-center font-medium">In-app</th>
            <th className="py-2 text-center font-medium">Email</th>
          </tr>
        </thead>
        <tbody>
          {NOTIFICATION_CATEGORIES.map((c) => (
            <tr key={c} className="border-t">
              <td className="py-2">{CATEGORY_LABELS[c as EventCategory]}</td>
              {(["inApp", "email"] as const).map((ch) => (
                <td key={ch} className="py-2 text-center">
                  <Checkbox
                    aria-label={`${CATEGORY_LABELS[c as EventCategory]} ${ch === "inApp" ? "in-app" : "email"}`}
                    checked={prefs[c][ch]}
                    onCheckedChange={(v) => setPrefs((p) => ({ ...p, [c]: { ...p[c], [ch]: v === true } }))}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground">Critical notifications always appear in your inbox, whatever you choose here.</p>
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await savePreferences({ prefs: NOTIFICATION_CATEGORIES.map((c) => ({ category: c, inApp: prefs[c].inApp, email: prefs[c].email })) });
            if (r.ok) toast.success(r.message);
            else toast.error(r.error);
            router.refresh();
          })
        }
      >
        {pending ? "Saving…" : "Save preferences"}
      </Button>
    </div>
  );
}
