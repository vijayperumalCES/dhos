import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PRIVILEGED_PERMISSIONS, isPrivilegedPermission } from "@/lib/domain/security";
import { controlsSchema, decisionSchema, grantRequestSchema, legalHoldSchema, retentionSchema } from "@/lib/validation/security";

const MIGRATION = readFileSync(join(process.cwd(), "supabase/migrations/20261106000100_security_controls.sql"), "utf8");

describe("privileged permissions", () => {
  it("matches the list the database uses", () => {
    const fn = MIGRATION.match(/function private\.is_privileged_permission[\s\S]*?select p_key in \(([^)]*)\)/);
    expect(fn).not.toBeNull();
    const inSql = [...fn![1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    expect([...PRIVILEGED_PERMISSIONS].sort()).toEqual(inSql);
  });

  it("recognises privileged and ordinary permissions", () => {
    expect(isPrivilegedPermission("org.members.manage")).toBe(true);
    expect(isPrivilegedPermission("finance.approve")).toBe(true);
    expect(isPrivilegedPermission("project.read_all")).toBe(false);
  });
});

describe("grant request form", () => {
  const base = { membershipId: "6f0f9f58-8c1f-4f0f-9f0f-0f0f0f0f0f0f", roleKey: "org_admin", reason: "Covers leave" };
  it("accepts a complete request", () => {
    expect(grantRequestSchema.safeParse(base).success).toBe(true);
  });
  it("needs a member, a role and a real reason", () => {
    expect(grantRequestSchema.safeParse({ ...base, membershipId: "" }).success).toBe(false);
    expect(grantRequestSchema.safeParse({ ...base, roleKey: " " }).success).toBe(false);
    expect(grantRequestSchema.safeParse({ ...base, reason: "ok" }).success).toBe(false);
    expect(grantRequestSchema.safeParse({ ...base, reason: "x".repeat(501) }).success).toBe(false);
  });
});

describe("decision, controls and hold forms", () => {
  it("turns an empty decision note into null", () => {
    expect(decisionSchema.parse({ note: "  " }).note).toBeNull();
    expect(decisionSchema.parse({}).note).toBeNull();
    expect(decisionSchema.parse({ note: " fine " }).note).toBe("fine");
  });
  it("requires both control flags to be booleans", () => {
    expect(controlsSchema.safeParse({ dualApproval: true, requireMfa: false }).success).toBe(true);
    expect(controlsSchema.safeParse({ dualApproval: "yes", requireMfa: false }).success).toBe(false);
  });
  it("needs a reason for a legal hold", () => {
    expect(legalHoldSchema.safeParse({ reason: "" }).success).toBe(false);
    expect(legalHoldSchema.safeParse({ reason: "Matter 12" }).success).toBe(true);
  });
});

describe("retention windows", () => {
  it("parses whole days within 7 to 3650", () => {
    expect(retentionSchema.parse({ outboxDays: "30", notificationDays: "90", logDays: "3650" })).toEqual({ outboxDays: 30, notificationDays: 90, logDays: 3650 });
  });
  it.each(["6", "3651", "abc", "", "12.5", "-30"])("rejects %j", (bad) => {
    expect(retentionSchema.safeParse({ outboxDays: bad, notificationDays: "90", logDays: "90" }).success).toBe(false);
  });
});
