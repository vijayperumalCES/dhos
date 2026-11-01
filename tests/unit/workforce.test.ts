import { describe, expect, it } from "vitest";

import {
  allocationRatio,
  canStartWeek,
  capacityStatus,
  daysInRange,
  formatDuration,
  formatHours,
  formatPercent,
  isMonday,
  isoWeekday,
  timeInZone,
  timesheetTotals,
  utilisationRatio,
  weekDates,
  weekStartOf,
  workedMinutes,
  zonedTimeToIso,
} from "@/lib/domain/workforce";
import { allocationSchema, correctionSchema, leaveRequestSchema, leaveTypeSchema, reviewSchema, timeEntrySchema } from "@/lib/validation/workforce";

describe("week helpers", () => {
  it("uses ISO weekdays with Monday first", () => {
    expect(isoWeekday("2026-11-02")).toBe(1);
    expect(isoWeekday("2026-11-01")).toBe(7);
  });

  it("finds the Monday of a week, including across a year end", () => {
    expect(weekStartOf("2026-11-01")).toBe("2026-10-26");
    expect(weekStartOf("2026-11-02")).toBe("2026-11-02");
    expect(weekStartOf("2027-01-01")).toBe("2026-12-28");
  });

  it("lists the seven dates of a week", () => {
    expect(weekDates("2026-12-28")).toEqual(["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
  });

  it("validates Mondays", () => {
    expect(isMonday("2026-11-02")).toBe(true);
    expect(isMonday("2026-11-03")).toBe(false);
    expect(isMonday("not-a-date")).toBe(false);
  });

  it("allows timesheets up to one week ahead", () => {
    expect(canStartWeek("2026-11-02", "2026-11-01")).toBe(true);
    expect(canStartWeek("2026-11-09", "2026-11-01")).toBe(false);
    expect(canStartWeek("2025-01-06", "2026-11-01")).toBe(true);
  });

  it("counts calendar days inclusively", () => {
    expect(daysInRange("2026-11-01", "2026-11-01")).toBe(1);
    expect(daysInRange("2026-02-27", "2026-03-02")).toBe(4);
  });
});

describe("attendance time helpers", () => {
  it("measures worked time only once checked out", () => {
    expect(workedMinutes("2026-11-02T03:30:00Z", null)).toBeNull();
    expect(workedMinutes("2026-11-02T03:30:00Z", "2026-11-02T12:15:00Z")).toBe(525);
    expect(formatDuration(525)).toBe("8h 45m");
    expect(formatDuration(null)).toBe("—");
  });

  it("converts wall-clock times in a zone to UTC", () => {
    expect(zonedTimeToIso("2026-11-02", "09:30", "Asia/Kolkata")).toBe("2026-11-02T04:00:00.000Z");
    expect(zonedTimeToIso("2026-07-01", "09:00", "Europe/London")).toBe("2026-07-01T08:00:00.000Z");
    expect(zonedTimeToIso("2026-12-01", "09:00", "Europe/London")).toBe("2026-12-01T09:00:00.000Z");
    expect(zonedTimeToIso("2026-11-02", "09:00", "Mars/Olympus")).toBe("2026-11-02T09:00:00.000Z");
  });

  it("round-trips through timeInZone", () => {
    expect(timeInZone(zonedTimeToIso("2026-03-29", "10:15", "Europe/Berlin"), "Europe/Berlin")).toBe("10:15");
    expect(timeInZone("2026-11-02T04:00:00Z", "Asia/Kolkata")).toBe("09:30");
  });
});

describe("capacity", () => {
  const base = { capacity_hours: 100, allocated_hours: 0, peak_allocation_percent: 0, logged_hours: 0 };

  it("classifies allocation by peak and average", () => {
    expect(capacityStatus({ ...base, capacity_hours: 0 })).toBe("unavailable");
    expect(capacityStatus({ ...base, allocated_hours: 50, peak_allocation_percent: 120 })).toBe("over");
    expect(capacityStatus({ ...base, allocated_hours: 80, peak_allocation_percent: 100 })).toBe("full");
    expect(capacityStatus({ ...base, allocated_hours: 30, peak_allocation_percent: 50 })).toBe("partial");
    expect(capacityStatus(base)).toBe("bench");
  });

  it("computes ratios without dividing by zero", () => {
    expect(allocationRatio({ ...base, allocated_hours: 40 })).toBe(0.4);
    expect(utilisationRatio({ ...base, logged_hours: 75 })).toBe(0.75);
    expect(allocationRatio({ ...base, capacity_hours: 0 })).toBeNull();
    expect(formatPercent(0.756)).toBe("76%");
    expect(formatPercent(null)).toBe("—");
  });

  it("formats hours", () => {
    expect(formatHours(8)).toBe("8 h");
    expect(formatHours(7.25)).toBe("7.3 h");
  });
});

describe("timesheet totals", () => {
  it("sums by day, by row and overall", () => {
    const t = timesheetTotals([
      { entry_date: "2026-11-02", hours: 4, rowKey: "a" },
      { entry_date: "2026-11-02", hours: 3.5, rowKey: "b" },
      { entry_date: "2026-11-03", hours: 8, rowKey: "a" },
    ]);
    expect(t.byDate.get("2026-11-02")).toBe(7.5);
    expect(t.byRow.get("a")).toBe(12);
    expect(t.total).toBe(15.5);
  });
});

describe("workforce validation", () => {
  const id = "00000000-0000-4000-8000-000000000001";

  it("rejects leave that ends before it starts, half days over several dates and year-crossing leave", () => {
    const ok = { leaveTypeId: id, startDate: "2026-11-02", endDate: "2026-11-04", halfDay: false, reason: "" };
    expect(leaveRequestSchema.safeParse(ok).success).toBe(true);
    expect(leaveRequestSchema.safeParse({ ...ok, endDate: "2026-11-01" }).success).toBe(false);
    expect(leaveRequestSchema.safeParse({ ...ok, halfDay: true }).success).toBe(false);
    expect(leaveRequestSchema.safeParse({ ...ok, startDate: "2026-12-30", endDate: "2027-01-02" }).success).toBe(false);
  });

  it("requires a reason to reject", () => {
    expect(reviewSchema.safeParse({ approve: true, note: "" }).success).toBe(true);
    expect(reviewSchema.safeParse({ approve: false, note: "  " }).success).toBe(false);
    expect(reviewSchema.safeParse({ approve: false, note: "Clashes with go-live" }).success).toBe(true);
  });

  it("requires check-out after check-in", () => {
    const c = { workDate: "2026-10-30", checkIn: "09:00", checkOut: "18:00", workMode: "office", reason: "Forgot" };
    expect(correctionSchema.safeParse(c).success).toBe(true);
    expect(correctionSchema.safeParse({ ...c, checkOut: "08:00" }).success).toBe(false);
    expect(correctionSchema.safeParse({ ...c, checkIn: "9:00" }).success).toBe(false);
  });

  it("ties projects to the project-work category", () => {
    const e = { entryDate: "2026-11-02", category: "delivery", projectId: id, workItemId: "none", hours: "7,5", note: "" };
    const parsed = timeEntrySchema.safeParse(e);
    expect(parsed.success && parsed.data.hours).toBe(7.5);
    expect(timeEntrySchema.safeParse({ ...e, projectId: "none" }).success).toBe(false);
    const internal = timeEntrySchema.safeParse({ ...e, category: "internal" });
    expect(internal.success && internal.data.projectId).toBeNull();
    expect(timeEntrySchema.safeParse({ ...e, hours: "25" }).success).toBe(false);
  });

  it("bounds allocation percentages and leave-type codes", () => {
    const a = { membershipId: id, projectId: id, startDate: "2026-11-02", endDate: "2026-11-30", percent: "50", role: "", notes: "" };
    expect(allocationSchema.safeParse(a).success).toBe(true);
    expect(allocationSchema.safeParse({ ...a, percent: "0" }).success).toBe(false);
    expect(allocationSchema.safeParse({ ...a, percent: "12.5" }).success).toBe(false);
    const t = leaveTypeSchema.safeParse({ name: "Study leave", code: " study ", isPaid: true, requiresApproval: true, annualAllowanceDays: "" });
    expect(t.success && t.data.code).toBe("STUDY");
    expect(t.success && t.data.annualAllowanceDays).toBeNull();
  });
});
