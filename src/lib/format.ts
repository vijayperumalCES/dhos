import { format, formatDistanceToNowStrict, parseISO } from "date-fns";

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

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return format(parseISO(value), "d MMM yyyy, HH:mm");
}

export function formatRelative(value: string | null | undefined): string {
  if (!value) return "never";
  return `${formatDistanceToNowStrict(parseISO(value))} ago`;
}

export function personName(m: { user_profiles: { display_name: string } | null } | null | undefined): string {
  return m?.user_profiles?.display_name ?? "—";
}
