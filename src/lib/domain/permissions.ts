/**
 * TypeScript mirror of the permission catalogue and system role templates defined in
 * supabase/migrations/20261026000200_authorization.sql. The database is authoritative;
 * this copy exists for UI decisions (which buttons to render) and documentation.
 * tests/unit/authorization-matrix.test.ts guards the invariants the docs promise.
 *
 * Hiding a button is never the security boundary — RLS and RPC checks are.
 */
export const PERMISSIONS = [
  "org.settings.manage",
  "org.members.read",
  "org.members.manage",
  "org.roles.manage",
  "audit.read",
  "client.read",
  "client.confidential.read",
  "client.manage",
  "project.read_all",
  "project.read_assigned",
  "project.create",
  "project.update",
  "project.change_status",
  "project.archive",
  "project.members.manage",
  "team.read",
  "team.manage",
  "dashboard.portfolio.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_KEYS = [
  "org_admin",
  "delivery_head",
  "program_manager",
  "project_manager",
  "engineering_manager",
  "product_owner",
  "scrum_master",
  "developer",
  "qa_engineer",
  "resource_manager",
  "hr_admin",
  "finance_manager",
  "client_stakeholder",
  "ai_agent_operator",
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

/** Custom (organization-defined) role keys follow the same format as system keys. */
export const ROLE_KEY_PATTERN = /^[a-z][a-z_]{1,48}$/;

export const ROLE_TEMPLATES: Record<RoleKey, readonly Permission[]> = {
  org_admin: [
    "org.settings.manage",
    "org.members.read",
    "org.members.manage",
    "org.roles.manage",
    "audit.read",
    "team.read",
    "team.manage",
  ],
  delivery_head: [
    "org.members.read",
    "audit.read",
    "client.read",
    "client.confidential.read",
    "client.manage",
    "project.read_all",
    "project.create",
    "project.update",
    "project.change_status",
    "project.archive",
    "project.members.manage",
    "team.read",
    "team.manage",
    "dashboard.portfolio.view",
  ],
  program_manager: [
    "org.members.read",
    "client.read",
    "project.read_all",
    "project.create",
    "project.update",
    "project.change_status",
    "project.members.manage",
    "team.read",
    "dashboard.portfolio.view",
  ],
  project_manager: [
    "org.members.read",
    "client.read",
    "project.read_assigned",
    "project.create",
    "project.update",
    "project.change_status",
    "project.members.manage",
    "team.read",
    "dashboard.portfolio.view",
  ],
  engineering_manager: [
    "org.members.read",
    "client.read",
    "project.read_assigned",
    "project.update",
    "team.read",
    "dashboard.portfolio.view",
  ],
  product_owner: ["org.members.read", "client.read", "project.read_assigned", "project.update", "team.read"],
  scrum_master: ["org.members.read", "project.read_assigned", "team.read"],
  developer: ["org.members.read", "project.read_assigned", "team.read"],
  qa_engineer: ["org.members.read", "project.read_assigned", "team.read"],
  resource_manager: ["org.members.read", "project.read_all", "team.read", "team.manage"],
  hr_admin: ["org.members.read", "team.read"],
  finance_manager: ["org.members.read", "client.read", "client.confidential.read", "project.read_all", "dashboard.portfolio.view"],
  client_stakeholder: ["project.read_assigned"],
  ai_agent_operator: ["org.members.read"],
};

export class PermissionSet {
  private readonly keys: ReadonlySet<string>;

  constructor(keys: Iterable<string>) {
    this.keys = new Set(keys);
  }

  has(permission: Permission): boolean {
    return this.keys.has(permission);
  }

  any(...permissions: Permission[]): boolean {
    return permissions.some((p) => this.keys.has(p));
  }

  get canReadProjects(): boolean {
    return this.any("project.read_all", "project.read_assigned");
  }

  toArray(): string[] {
    return [...this.keys].sort();
  }
}
