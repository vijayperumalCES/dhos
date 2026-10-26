import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  allowedTransitions,
  isTerminal,
  isValidTransition,
  PROJECT_STATUSES,
  PROJECT_TRANSITIONS,
} from "@/lib/domain/project-lifecycle";

/** Parses the transition pairs out of public.is_valid_project_transition() in the migration. */
function sqlTransitions(): Set<string> {
  const sql = readFileSync(join(__dirname, "../../supabase/migrations/20261026000300_portfolio.sql"), "utf8");
  const body = sql.slice(sql.indexOf("function public.is_valid_project_transition"), sql.indexOf("$$;", sql.indexOf("function public.is_valid_project_transition")));
  const pairs = [...body.matchAll(/\('(\w+)'(?:::public\.project_status)?,\s*'(\w+)'(?:::public\.project_status)?\)/g)];
  return new Set(pairs.map(([, from, to]) => `${from}->${to}`));
}

describe("project lifecycle", () => {
  it("matches the database state machine exactly", () => {
    const ts = new Set(Object.entries(PROJECT_TRANSITIONS).flatMap(([from, tos]) => tos.map((to) => `${from}->${to}`)));
    const sql = sqlTransitions();
    expect(sql.size).toBe(14);
    expect([...ts].sort()).toEqual([...sql].sort());
  });

  it("treats completed and cancelled as terminal", () => {
    expect(isTerminal("completed")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(PROJECT_STATUSES.filter(isTerminal)).toEqual(["completed", "cancelled"]);
  });

  it("requires approval and planning before a project becomes active", () => {
    expect(isValidTransition("proposed", "active")).toBe(false);
    expect(isValidTransition("approved", "active")).toBe(false);
    expect(isValidTransition("planning", "active")).toBe(true);
  });

  it("never offers a transition to the current status", () => {
    for (const s of PROJECT_STATUSES) expect(allowedTransitions(s)).not.toContain(s);
  });

  it("lets every non-terminal stage be cancelled", () => {
    for (const s of PROJECT_STATUSES.filter((s) => !isTerminal(s))) expect(isValidTransition(s, "cancelled")).toBe(true);
  });
});
