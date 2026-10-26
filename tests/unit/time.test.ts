import { describe, expect, it } from "vitest";

import { addDaysToDate, isValidTimeZone, supportedTimeZones, todayInTimeZone } from "@/lib/domain/time";
import { formatDateTime } from "@/lib/format";

describe("time zone helpers", () => {
  const instant = new Date("2026-10-26T20:00:00Z");

  it("returns the local calendar date for a zone", () => {
    expect(todayInTimeZone(instant, "UTC")).toBe("2026-10-26");
    expect(todayInTimeZone(instant, "Asia/Kolkata")).toBe("2026-10-27");
    expect(todayInTimeZone(instant, "Pacific/Honolulu")).toBe("2026-10-26");
  });

  it("falls back to UTC for unknown zones", () => {
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(todayInTimeZone(instant, "Mars/Olympus")).toBe("2026-10-26");
  });

  it("adds days across month and year boundaries", () => {
    expect(addDaysToDate("2026-10-26", 30)).toBe("2026-11-25");
    expect(addDaysToDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToDate("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("lists IANA zones including UTC", () => {
    const zones = supportedTimeZones();
    expect(zones).toContain("UTC");
    expect(zones.length).toBeGreaterThan(300);
  });

  it("formats timestamps in the given zone", () => {
    expect(formatDateTime("2026-10-26T20:00:00Z", "Asia/Kolkata")).toBe("27 Oct 2026, 01:30");
    expect(formatDateTime("2026-10-26T20:00:00Z", "UTC")).toBe("26 Oct 2026, 20:00");
  });
});
