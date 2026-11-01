/**
 * Workforce domain rules shared by the attendance, leave, timesheet and resource pages.
 * The database is authoritative for every rule that protects data (balances, locks, approvals);
 * these helpers only shape what the UI shows. Capacity is computed from calendars, holidays and
 * approved leave — never from attendance, which records presence, not availability.
 */
import { addDaysToDate, isValidTimeZone, type DateString } from "./time";

export const REQUEST_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const TIMESHEET_STATUSES = ["missing", "draft", "submitted", "approved", "rejected"] as const;
export type TimesheetStatus = (typeof TIMESHEET_STATUSES)[number];
export const TIMESHEET_STATUS_LABELS: Record<TimesheetStatus, string> = {
  missing: "Not started",
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Returned",
};

export const TIME_CATEGORIES = ["delivery", "internal", "training", "presales"] as const;
export type TimeCategory = (typeof TIME_CATEGORIES)[number];
export const TIME_CATEGORY_LABELS: Record<TimeCategory, string> = {
  delivery: "Project work",
  internal: "Internal",
  training: "Training",
  presales: "Pre-sales",
};

export const WORK_MODES = ["office", "remote"] as const;
export type WorkMode = (typeof WORK_MODES)[number];
export const WORK_MODE_LABELS: Record<WorkMode, string> = { office: "Office", remote: "Remote" };

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** ISO weekday of a calendar date: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: DateString): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Monday of the ISO week containing `date`. */
export function weekStartOf(date: DateString): DateString {
  return addDaysToDate(date, 1 - isoWeekday(date));
}

export function weekDates(weekStart: DateString): DateString[] {
  return Array.from({ length: 7 }, (_, i) => addDaysToDate(weekStart, i));
}

export function isMonday(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && isoWeekday(date) === 1;
}

/** Minutes between check-in and check-out, or null while still checked in. */
export function workedMinutes(checkIn: string, checkOut: string | null): number | null {
  if (!checkOut) return null;
  return Math.max(0, Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 60000));
}

export function formatDuration(minutes: number | null): string {
  if (minutes === null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)} h`;
}

/** "HH:MM" wall-clock time of a timestamp in the organization's time zone. */
export function timeInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: isValidTimeZone(timeZone) ? timeZone : "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(utcMs))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - utcMs;
}

/**
 * Converts a wall-clock date and time in `timeZone` to a UTC ISO timestamp, e.g. a correction
 * entered as 09:30 in Asia/Kolkata. Resolves daylight-saving transitions to the later offset.
 */
export function zonedTimeToIso(date: DateString, time: string, timeZone: string): string {
  const tz = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let ts = guess - zoneOffsetMs(guess, tz);
  ts = guess - zoneOffsetMs(ts, tz);
  return new Date(ts).toISOString();
}

export type CapacityFigures = {
  capacity_hours: number;
  allocated_hours: number;
  peak_allocation_percent: number;
  logged_hours: number;
};

export type CapacityStatus = "unavailable" | "over" | "full" | "partial" | "bench";

export const CAPACITY_STATUS_LABELS: Record<CapacityStatus, string> = {
  unavailable: "Unavailable",
  over: "Over-allocated",
  full: "Fully allocated",
  partial: "Partly allocated",
  bench: "Unallocated",
};

/** Share of available capacity that is allocated (0–∞), or null when there is no capacity. */
export function allocationRatio(row: CapacityFigures): number | null {
  return row.capacity_hours > 0 ? row.allocated_hours / row.capacity_hours : null;
}

/** Logged delivery hours against available capacity, or null when there is no capacity. */
export function utilisationRatio(row: CapacityFigures): number | null {
  return row.capacity_hours > 0 ? row.logged_hours / row.capacity_hours : null;
}

/**
 * Over-allocation looks at the busiest day, not the average: someone at 130% for two weeks of a
 * quarter is over-allocated even if the quarter averages below 100%.
 */
export function capacityStatus(row: CapacityFigures): CapacityStatus {
  if (row.capacity_hours <= 0) return "unavailable";
  if (row.peak_allocation_percent > 100) return "over";
  const ratio = row.allocated_hours / row.capacity_hours;
  if (ratio >= 0.8) return "full";
  if (ratio > 0) return "partial";
  return "bench";
}

export function formatPercent(ratio: number | null): string {
  return ratio === null ? "—" : `${Math.round(ratio * 100)}%`;
}

export type TimesheetEntryLike = { entry_date: string; hours: number; rowKey: string };

/** Totals per day, per row and overall for a weekly timesheet grid. */
export function timesheetTotals(entries: TimesheetEntryLike[]) {
  const byDate = new Map<string, number>();
  const byRow = new Map<string, number>();
  let total = 0;
  for (const e of entries) {
    byDate.set(e.entry_date, (byDate.get(e.entry_date) ?? 0) + e.hours);
    byRow.set(e.rowKey, (byRow.get(e.rowKey) ?? 0) + e.hours);
    total += e.hours;
  }
  return { byDate, byRow, total };
}

/** Timesheets can be opened from far back up to one week ahead (the database enforces the same). */
export function canStartWeek(weekStart: DateString, today: DateString): boolean {
  return weekStart <= addDaysToDate(weekStartOf(today), 7);
}

/** Inclusive number of calendar days in a range. */
export function daysInRange(from: DateString, to: DateString): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
}
