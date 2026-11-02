/**
 * Permissions that make a role "privileged" for dual approval. Mirrors
 * `private.is_privileged_permission` in supabase/migrations/20261106000100_security_controls.sql;
 * tests/unit/security.test.ts fails if the two lists drift.
 */
export const PRIVILEGED_PERMISSIONS = ["org.settings.manage", "org.members.manage", "org.roles.manage", "finance.manage", "finance.approve"] as const;

export function isPrivilegedPermission(key: string): boolean {
  return (PRIVILEGED_PERMISSIONS as readonly string[]).includes(key);
}
