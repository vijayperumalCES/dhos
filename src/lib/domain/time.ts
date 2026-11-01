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

/** Minutes the zone is ahead of UTC at the given instant (e.g. 330 for Asia/Kolkata). */
function zoneOffsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** The instant 23:59:00 on a calendar date in the organization's zone, as an ISO timestamp (deadlines are end of day). */
export function endOfDayInTimeZone(date: DateString, timeZone: string): string {
  const tz = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const guess = new Date(`${date}T23:59:00Z`);
  const first = new Date(guess.getTime() - zoneOffsetMinutes(guess, tz) * 60000);
  // One more pass settles dates where the offset differs between the guess and the result (DST changes).
  return new Date(guess.getTime() - zoneOffsetMinutes(first, tz) * 60000).toISOString();
}
