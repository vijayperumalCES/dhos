import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PermissionSet, PERMISSIONS, ROLE_KEYS, ROLE_TEMPLATES } from "@/lib/domain/permissions";
import { buildNavigation } from "@/lib/navigation";

const migrationsDir = join(__dirname, "../../supabase/migrations");
/** All migrations in apply order, concatenated — later statements override earlier ones. */
const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
  .join("\n");

/** Keys inserted into public.permissions across all migrations. */
function sqlPermissionKeys(): string[] {
  const keys: string[] = [];
  for (const block of migrations.split("insert into public.permissions").slice(1)) {
    const values = block.slice(0, block.search(/\);\s*\n/) + 1);
    keys.push(...[...values.matchAll(/\('([\w.]+)',\s*'\w+'/g)].map((m) => m[1]));
  }
  return keys.sort();
}

/** Role -> permissions from the role_templates insert, with later `update ... set permissions` applied. */
function sqlRoleTemplates(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const parse = (list: string) => [...list.matchAll(/'([\w.]+)'/g)].map((x) => x[1]).sort();
  for (const m of migrations.matchAll(/\('(\w+)',\s*'[^']*',\s*'[^']*',\s*\d+,\s*array\[([^\]]*)\]\)/g)) out[m[1]] = parse(m[2]);
  for (const m of migrations.matchAll(/update private\.role_templates set permissions = array\[([^\]]*)\] where key = '(\w+)'/g)) out[m[2]] = parse(m[1]);
  return out;
}

describe("authorization matrix", () => {
  it("mirrors the database permission catalogue", () => {
    expect(sqlPermissionKeys()).toEqual([...PERMISSIONS].sort());
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
