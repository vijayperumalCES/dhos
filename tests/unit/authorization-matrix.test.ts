import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PermissionSet, PERMISSIONS, ROLE_KEYS, ROLE_TEMPLATES } from "@/lib/domain/permissions";
import { buildNavigation } from "@/lib/navigation";

const migration = readFileSync(join(__dirname, "../../supabase/migrations/20261026000200_authorization.sql"), "utf8");

/** Extracts role -> permissions from the role_templates insert in the migration. */
function sqlRoleTemplates(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const m of migration.matchAll(/\('(\w+)',\s*'[^']*',\s*'[^']*',\s*\d+,\s*array\[([^\]]*)\]\)/g)) {
    out[m[1]] = [...m[2].matchAll(/'([\w.]+)'/g)].map((x) => x[1]).sort();
  }
  return out;
}

describe("authorization matrix", () => {
  it("mirrors the database permission catalogue", () => {
    const catalogue = migration.slice(migration.indexOf("insert into public.permissions"), migration.indexOf("create table private.role_templates"));
    const keys = [...catalogue.matchAll(/\('([\w.]+)',\s*'\w+'/g)].map((m) => m[1]).sort();
    expect(keys).toEqual([...PERMISSIONS].sort());
  });

  it("mirrors the database role templates exactly", () => {
    const sql = sqlRoleTemplates();
    expect(Object.keys(sql).sort()).toEqual([...ROLE_KEYS].sort());
    for (const role of ROLE_KEYS) expect([...ROLE_TEMPLATES[role]].sort(), role).toEqual(sql[role]);
  });

  it("does not give the organization administrator project, client or financial data", () => {
    const admin = new PermissionSet(ROLE_TEMPLATES.org_admin);
    expect(admin.canReadProjects).toBe(false);
    expect(admin.has("client.read")).toBe(false);
  });

  it("limits client stakeholders to assigned projects with no internal directory", () => {
    expect([...ROLE_TEMPLATES.client_stakeholder]).toEqual(["project.read_assigned"]);
  });

  it("never combines read_all with read_assigned redundantly", () => {
    for (const role of ROLE_KEYS) {
      const p = ROLE_TEMPLATES[role];
      expect(p.includes("project.read_all") && p.includes("project.read_assigned"), role).toBe(false);
    }
  });

  it("grants every write permission only alongside a matching read", () => {
    for (const role of ROLE_KEYS) {
      const p = new PermissionSet(ROLE_TEMPLATES[role]);
      if (p.any("project.update", "project.change_status", "project.archive", "project.members.manage")) expect(p.canReadProjects, role).toBe(true);
      if (p.has("team.manage")) expect(p.has("team.read"), role).toBe(true);
      if (p.has("client.manage")) expect(p.has("client.read"), role).toBe(true);
      if (p.has("org.members.manage")) expect(p.has("org.members.read"), role).toBe(true);
    }
  });

  it("filters navigation by permission", () => {
    const devNav = buildNavigation(new PermissionSet(ROLE_TEMPLATES.developer)).flatMap((g) => g.items.map((i) => i.title));
    expect(devNav).toContain("Projects");
    expect(devNav).not.toContain("Command Center");
    expect(devNav).not.toContain("Clients");
    expect(devNav).not.toContain("Administration");
    const dhNav = buildNavigation(new PermissionSet(ROLE_TEMPLATES.delivery_head)).flatMap((g) => g.items.map((i) => i.title));
    expect(dhNav).toEqual(expect.arrayContaining(["Command Center", "Projects", "Clients", "People & Teams", "Administration"]));
  });
});
