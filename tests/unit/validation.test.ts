import { describe, expect, it } from "vitest";

import { fromPostgrestError, humanizeRpcMessage } from "@/lib/actions/result";
import { sanitizeSearch } from "@/lib/data/search";
import { safeNextPath, signUpSchema } from "@/lib/validation/auth";
import { NONE } from "@/lib/validation/common";
import { clientFormSchema, createOrganizationSchema } from "@/lib/validation/organization";
import { healthUpdateSchema, projectFormSchema, projectMemberSchema, statusTransitionSchema } from "@/lib/validation/project";

const validProject = {
  code: "pay-01",
  name: "Payments",
  description: "",
  clientId: NONE,
  programId: NONE,
  sponsorName: "",
  projectManagerId: NONE,
  deliveryOwnerId: NONE,
  primaryTeamId: NONE,
  methodology: "scrum",
  plannedStartDate: "",
  targetEndDate: "",
  objectives: "",
  scopeSummary: "",
  assumptions: "",
  projectConstraints: "",
};
const ID = "6f1c1f0e-5d3b-4f63-9c2a-1b2c3d4e5f60";

describe("project form schema", () => {
  it("normalizes code to upper case and empty values to null", () => {
    const v = projectFormSchema.parse(validProject);
    expect(v.code).toBe("PAY-01");
    expect(v.clientId).toBeNull();
    expect(v.description).toBeNull();
    expect(v.plannedStartDate).toBeNull();
  });

  it("rejects malformed codes", () => {
    expect(projectFormSchema.safeParse({ ...validProject, code: "x" }).success).toBe(false);
    expect(projectFormSchema.safeParse({ ...validProject, code: "-AB" }).success).toBe(false);
    expect(projectFormSchema.safeParse({ ...validProject, code: "has space" }).success).toBe(false);
  });

  it("rejects a target end before the planned start", () => {
    const r = projectFormSchema.safeParse({ ...validProject, plannedStartDate: "2026-11-10", targetEndDate: "2026-11-01" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["targetEndDate"]);
  });

  it("rejects non-UUID references", () => {
    expect(projectFormSchema.safeParse({ ...validProject, clientId: "not-a-uuid" }).success).toBe(false);
  });
});

describe("governance schemas", () => {
  it("requires a reason for on hold and cancelled", () => {
    expect(statusTransitionSchema.safeParse({ projectId: ID, toStatus: "on_hold", reason: "  " }).success).toBe(false);
    expect(statusTransitionSchema.safeParse({ projectId: ID, toStatus: "cancelled", reason: "Client exit" }).success).toBe(true);
    expect(statusTransitionSchema.safeParse({ projectId: ID, toStatus: "approved", reason: "" }).success).toBe(true);
  });

  it("requires a reason for amber and red health", () => {
    expect(healthUpdateSchema.safeParse({ projectId: ID, health: "red", reason: "" }).success).toBe(false);
    expect(healthUpdateSchema.safeParse({ projectId: ID, health: "green", reason: "" }).success).toBe(true);
  });

  it("bounds project allocation to whole percentages", () => {
    expect(projectMemberSchema.safeParse({ projectId: ID, membershipId: ID, projectRole: "Dev", allocationPercent: "150" }).success).toBe(false);
    expect(projectMemberSchema.safeParse({ projectId: ID, membershipId: ID, projectRole: "Dev", allocationPercent: "12.5" }).success).toBe(false);
    expect(projectMemberSchema.parse({ projectId: ID, membershipId: ID, projectRole: "Dev", allocationPercent: "" }).allocationPercent).toBeNull();
  });
});

describe("organization and auth schemas", () => {
  it("validates organization slugs", () => {
    expect(createOrganizationSchema.safeParse({ name: "Acme", slug: "Acme-Delivery" }).data?.slug).toBe("acme-delivery");
    expect(createOrganizationSchema.safeParse({ name: "Acme", slug: "-acme" }).success).toBe(false);
    expect(createOrganizationSchema.safeParse({ name: "Acme", slug: "ab" }).success).toBe(false);
  });

  it("only accepts http(s) client websites", () => {
    const base = { name: "Contoso", code: "", industry: "", accountOwnerMembershipId: NONE, confidentiality: "standard", notes: "" };
    expect(clientFormSchema.safeParse({ ...base, website: "javascript:alert(1)" }).success).toBe(false);
    expect(clientFormSchema.safeParse({ ...base, website: "https://contoso.example" }).success).toBe(true);
  });

  it("enforces the password policy configured in Supabase", () => {
    const base = { displayName: "A", email: "a@b.co" };
    expect(signUpSchema.safeParse({ ...base, password: "short1A" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...base, password: "alllowercase123" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...base, password: "GoodPassword123" }).success).toBe(true);
  });

  it("only allows same-origin redirects after sign-in", () => {
    expect(safeNextPath("/projects?status=active")).toBe("/projects?status=active");
    expect(safeNextPath("//evil.example")).toBe("/dashboard");
    expect(safeNextPath("https://evil.example")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.example")).toBe("/dashboard");
    expect(safeNextPath(undefined)).toBe("/dashboard");
  });
});

describe("error mapping and search sanitizing", () => {
  it("never leaks raw database messages except our own RPC exceptions", () => {
    const err = (code: string, message: string) => ({ code, message, details: "", hint: "", name: "PostgrestError" }) as never;
    expect(fromPostgrestError(err("42501", 'new row violates row-level security policy for table "projects"'))).toEqual({
      ok: false,
      error: "You don't have permission to do that.",
      fieldErrors: undefined,
    });
    expect(fromPostgrestError(err("P0001", "invalid_transition: proposed -> active"))).toMatchObject({ error: "That lifecycle transition is not allowed." });
    expect(humanizeRpcMessage("reason_required: a reason is required")).toBe("A reason is required for this change.");
  });

  it("strips PostgREST filter syntax from search terms", () => {
    expect(sanitizeSearch("pay),status.eq.active")).not.toMatch(/[,()]/);
    expect(sanitizeSearch("   ")).toBeUndefined();
    expect(sanitizeSearch("NW-PAY")).toBe("NW-PAY");
  });
});
