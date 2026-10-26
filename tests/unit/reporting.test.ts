import { describe, expect, it } from "vitest";

import { buildReportingTree, type ReportingInput } from "@/lib/domain/reporting";

const person = (id: string, managerId: string | null, name = id): ReportingInput => ({ id, managerId, name, jobTitle: null, department: null });

describe("buildReportingTree", () => {
  it("nests reports under their managers", () => {
    const tree = buildReportingTree([person("ceo", null), person("cto", "ceo"), person("dev", "cto"), person("cfo", "ceo")]);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("ceo");
    expect(tree[0].reports.map((r) => r.id)).toEqual(["cto", "cfo"]); // more reports first, then name
    expect(tree[0].reports[0].reports.map((r) => r.id)).toEqual(["dev"]);
  });

  it("promotes people whose manager is not listed to roots", () => {
    const tree = buildReportingTree([person("a", "missing"), person("b", null)]);
    expect(tree.map((n) => n.id).sort()).toEqual(["a", "b"]);
  });

  it("terminates even if the data contains a cycle", () => {
    const tree = buildReportingTree([person("root", null), person("x", "y"), person("y", "x")]);
    expect(tree.map((n) => n.id)).toEqual(["root"]); // cyclic people are unreachable from a root
  });
});
