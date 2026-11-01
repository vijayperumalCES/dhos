import { describe, expect, it } from "vitest";

import {
  buildGovernanceReportMarkdown,
  contractTiming,
  escalationTiming,
  raidStatusOptions,
  redWithoutRecovery,
  riskRating,
  summarizeGates,
  RELEASE_TRANSITIONS,
  type GovernanceReport,
} from "@/lib/domain/governance";
import { endOfDayInTimeZone } from "@/lib/domain/time";
import {
  actionSchema,
  contractSchema,
  documentSchema,
  escalationSchema,
  raidItemSchema,
  raidStatusSchema,
} from "@/lib/validation/governance";

const NOW = new Date("2026-11-02T10:00:00Z");

describe("risk rating", () => {
  it("bands the 5×5 score", () => {
    expect([1, 4, 5, 9, 10, 16, 17, 25].map(riskRating)).toEqual(["low", "low", "medium", "medium", "high", "high", "critical", "critical"]);
  });
  it("has no rating without a score", () => {
    expect(riskRating(null)).toBeNull();
  });
});

describe("RAID status", () => {
  it("lets only risks be accepted", () => {
    expect(raidStatusOptions("risk")).toContain("accepted");
    expect(raidStatusOptions("issue")).not.toContain("accepted");
  });
});

describe("escalation timing", () => {
  it("is overdue after the deadline, due soon inside 24 hours, and never overdue once resolved", () => {
    expect(escalationTiming({ status: "open", respond_by: "2026-11-02T09:00:00Z" }, NOW)).toBe("overdue");
    expect(escalationTiming({ status: "acknowledged", respond_by: "2026-11-03T09:00:00Z" }, NOW)).toBe("due_soon");
    expect(escalationTiming({ status: "open", respond_by: "2026-11-05T09:00:00Z" }, NOW)).toBe("on_track");
    expect(escalationTiming({ status: "resolved", respond_by: "2026-10-01T09:00:00Z" }, NOW)).toBe("resolved");
  });
});

describe("quality gates", () => {
  it("allows approval only when every required gate is passed or waived", () => {
    const gates = [
      { is_required: true, status: "passed" as const },
      { is_required: true, status: "waived" as const },
      { is_required: false, status: "failed" as const },
    ];
    expect(summarizeGates(gates)).toMatchObject({ requiredTotal: 2, requiredReady: 2, failed: 1, canApprove: true });
    expect(summarizeGates([...gates, { is_required: true, status: "pending" as const }])).toMatchObject({ pendingRequired: 1, canApprove: false });
  });
  it("offers no moves out of a released or cancelled release", () => {
    expect(RELEASE_TRANSITIONS.released).toEqual([]);
    expect(RELEASE_TRANSITIONS.cancelled).toEqual([]);
    expect(RELEASE_TRANSITIONS.planned).not.toContain("approved");
  });
});

describe("contract timing", () => {
  const base = { status: "active" as const, renewal_notice_days: null };
  it("flags contracts inside the notice window or the default 60 days", () => {
    expect(contractTiming({ ...base, end_date: "2026-12-15" }, "2026-11-02")).toEqual({ kind: "expiring", daysLeft: 43 });
    expect(contractTiming({ ...base, end_date: "2027-06-01" }, "2026-11-02").kind).toBe("ongoing");
    expect(contractTiming({ ...base, renewal_notice_days: 180, end_date: "2027-03-01" }, "2026-11-02").kind).toBe("expiring");
  });
  it("marks an active contract past its end date as ended and ignores inactive ones", () => {
    expect(contractTiming({ ...base, end_date: "2026-10-01" }, "2026-11-02").kind).toBe("ended");
    expect(contractTiming({ status: "draft", renewal_notice_days: null, end_date: "2026-11-05" }, "2026-11-02").kind).toBe("ongoing");
  });
});

describe("red projects without recovery", () => {
  const red = [
    { projectId: "a", code: "A", name: "Alpha", redSince: "2026-10-20T00:00:00Z" },
    { projectId: "b", code: "B", name: "Beta", redSince: "2026-10-30T00:00:00Z" },
  ];
  it("lists projects with nothing recorded since they turned red, longest first", () => {
    const events = [
      { projectId: "a", at: "2026-10-10T00:00:00Z" }, // before it turned red: doesn't count
      { projectId: "b", at: "2026-10-31T00:00:00Z" },
    ];
    expect(redWithoutRecovery(red, events, NOW)).toEqual([{ ...red[0], daysRed: 13 }]);
  });
  it("is empty when every red project has an event after the turn", () => {
    expect(redWithoutRecovery(red, [{ projectId: "a", at: "2026-10-21T00:00:00Z" }, { projectId: "b", at: "2026-10-30T00:00:00Z" }], NOW)).toEqual([]);
  });
});

describe("governance report", () => {
  const report: GovernanceReport = {
    organization: "Acme | Co",
    generatedOn: "2026-11-02",
    timezone: "UTC",
    openRisks: { total: 3, high: 1, critical: 1 },
    openIssues: 2,
    overdueRaid: 1,
    overdueActions: 4,
    openActions: 9,
    escalations: { open: 1, overdue: 1 },
    pendingChanges: 2,
    releasesDue: [],
    topRisks: [{ project: "GVA", title: "Key engineer\nmay leave", score: 12, owner: "Dev", due: null }],
    openEscalations: [{ project: "GVA", title: "Vendor stalled", severity: "high", to: "DH", respondBy: "2026-11-01", overdue: true }],
    redWithoutRecovery: [{ projectId: "p", code: "GVB", name: "Project B", redSince: "2026-10-20T00:00:00Z", daysRed: 1 }],
    expiringContracts: [],
  };
  it("renders the summary and the sections that have rows, and escapes table characters", () => {
    const md = buildGovernanceReportMarkdown(report);
    expect(md).toContain("# Delivery governance report — Acme \\| Co");
    expect(md).toContain("Open risks: **3** (1 critical, 1 high)");
    expect(md).toContain("red for 1 day");
    expect(md).toContain("| GVA | Key engineer may leave | 12 | Dev | — |");
    expect(md).toContain("2026-11-01 (overdue)");
    expect(md).not.toContain("Releases in flight");
    expect(md.endsWith("\n")).toBe(true);
  });
});

describe("end of day in a time zone", () => {
  it("converts the local deadline to the right instant", () => {
    expect(endOfDayInTimeZone("2026-11-05", "Asia/Kolkata")).toBe("2026-11-05T18:29:00.000Z");
    expect(endOfDayInTimeZone("2026-11-05", "America/New_York")).toBe("2026-11-06T04:59:00.000Z");
    expect(endOfDayInTimeZone("2026-11-05", "UTC")).toBe("2026-11-05T23:59:00.000Z");
  });
  it("follows daylight saving", () => {
    expect(endOfDayInTimeZone("2026-03-08", "America/New_York")).toBe("2026-03-09T03:59:00.000Z");
    expect(endOfDayInTimeZone("2026-03-07", "America/New_York")).toBe("2026-03-08T04:59:00.000Z");
  });
  it("falls back to UTC for an unknown zone", () => {
    expect(endOfDayInTimeZone("2026-11-05", "Mars/Olympus")).toBe("2026-11-05T23:59:00.000Z");
  });
});

describe("governance validation", () => {
  const raid = { type: "risk", title: "Vendor slips", description: "", probability: "3", impact: "4", ownerId: "none", dueDate: "", mitigation: "", contingency: "" };

  it("requires probability and impact for a risk and drops them for the wrong type", () => {
    expect(raidItemSchema.safeParse({ ...raid, probability: "" }).success).toBe(false);
    const dependency = raidItemSchema.parse({ ...raid, type: "dependency" });
    expect(dependency).toMatchObject({ probability: null, impact: null });
    const issue = raidItemSchema.parse({ ...raid, type: "issue" });
    expect(issue).toMatchObject({ probability: null, impact: 4 });
  });
  it("rejects a score outside 1 to 5", () => {
    expect(raidItemSchema.safeParse({ ...raid, impact: "6" }).success).toBe(false);
    expect(raidItemSchema.safeParse({ ...raid, impact: "0" }).success).toBe(false);
  });
  it("needs a note to resolve, close or accept", () => {
    expect(raidStatusSchema.safeParse({ status: "closed", note: "" }).success).toBe(false);
    expect(raidStatusSchema.safeParse({ status: "closed", note: "Fixed in 2.1" }).success).toBe(true);
    expect(raidStatusSchema.safeParse({ status: "in_progress", note: "" }).success).toBe(true);
  });
  it("needs an owner and a due date for an action", () => {
    expect(actionSchema.safeParse({ title: "Do it", description: "", ownerId: "none", dueDate: "2026-11-09", raidItemId: "", decisionId: "" }).success).toBe(false);
    expect(
      actionSchema.safeParse({ title: "Do it", description: "", ownerId: "f0000000-0000-4000-8000-000000000003", dueDate: "", raidItemId: "", decisionId: "" }).success,
    ).toBe(false);
  });

  const escalation = {
    title: "Vendor stalled",
    description: "No delivery in three weeks",
    severity: "high",
    toId: "f0000000-0000-4000-8000-000000000004",
    respondBy: "2026-11-05",
    raidItemId: "",
    evidence: [{ kind: "note", title: "Status", url: "", note: "Three milestones missed" }],
  };
  it("requires evidence on an escalation and checks each piece", () => {
    expect(escalationSchema.safeParse(escalation).success).toBe(true);
    expect(escalationSchema.safeParse({ ...escalation, evidence: [] }).success).toBe(false);
    expect(escalationSchema.safeParse({ ...escalation, evidence: [{ kind: "link", title: "Tracker", url: "not a url", note: "" }] }).success).toBe(false);
    expect(escalationSchema.safeParse({ ...escalation, evidence: [{ kind: "link", title: "Tracker", url: "javascript:alert(1)", note: "" }] }).success).toBe(false);
    expect(escalationSchema.safeParse({ ...escalation, evidence: [{ kind: "link", title: "Tracker", url: "https://example.com/t/1", note: "" }] }).success).toBe(true);
  });

  it("requires content or a link for a document", () => {
    const doc = { title: "Charter", docType: "charter", visibility: "internal", description: "", content: "", url: "", note: "" };
    expect(documentSchema.safeParse(doc).success).toBe(false);
    expect(documentSchema.safeParse({ ...doc, content: "# Charter" }).success).toBe(true);
    expect(documentSchema.safeParse({ ...doc, url: "https://example.com/charter" }).success).toBe(true);
  });

  it("keeps a contract's end date on or after its start date", () => {
    const contract = { title: "MSA", reference: "", contractType: "msa", status: "active", startDate: "2026-01-01", endDate: "2026-12-31", renewalNoticeDays: "90", notes: "" };
    expect(contractSchema.safeParse(contract).success).toBe(true);
    expect(contractSchema.safeParse({ ...contract, endDate: "2025-12-31" }).success).toBe(false);
    expect(contractSchema.safeParse({ ...contract, renewalNoticeDays: "-1" }).success).toBe(false);
  });
});
