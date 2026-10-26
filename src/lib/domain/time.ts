/**
 * Calendar-date helpers that respect the organization's IANA time zone. Date-only columns
 * (target_end_date etc.) are compared as `YYYY-MM-DD` strings against "today" in that zone, so a
 * project in Asia/Kolkata becomes overdue at local midnight, not at UTC midnight.
 */

export type DateString = string; // YYYY-MM-DD

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The calendar date it currently is in `timeZone`. Falls back to UTC for an unknown zone. */
export function todayInTimeZone(now: Date, timeZone: string): DateString {
  const tz = isValidTimeZone(timeZone) ? timeZone : "UTC";
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDaysToDate(date: DateString, days: number): DateString {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** All IANA zones the runtime knows, for pickers. */
export function supportedTimeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  const zones = intl.supportedValuesOf?.("timeZone") ?? [];
  return zones.includes("UTC") ? zones : ["UTC", ...zones];
}
