import { format, formatDistanceToNowStrict, parseISO } from "date-fns";

import { isValidTimeZone } from "@/lib/domain/time";

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return format(parseISO(value), "d MMM yyyy");
}

/** Formats a timestamp in the organization's time zone (server-rendered pages run in UTC). */
export function formatDateTime(value: string | null | undefined, timeZone: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: isValidTimeZone(timeZone) ? timeZone : "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(parseISO(value));
}

export function formatRelative(value: string | null | undefined): string {
  if (!value) return "never";
  return `${formatDistanceToNowStrict(parseISO(value))} ago`;
}

/**
 * Client label for a project. A project can reference a client the viewer may not see
 * (confidential clients): the embed is then null while client_id is set.
 */
export function clientLabel(p: { client_id: string | null; client: { name: string } | null }): string {
  if (p.client) return p.client.name;
  return p.client_id ? "Restricted client" : "Internal";
}

export function personName(m: { user_profiles: { display_name: string } | null } | null | undefined): string {
  return m?.user_profiles?.display_name ?? "—";
}
