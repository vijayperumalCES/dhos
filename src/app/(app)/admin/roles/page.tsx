import { Check } from "lucide-react";
import type { Metadata } from "next";

import { AccessDenied } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/auth/org-context";
import { listPermissionCatalogue, listRoles } from "@/lib/data/members";

import { DeleteRoleButton, RoleDialog } from "./role-editor";

export const metadata: Metadata = { title: "Roles & permissions" };

export default async function RolesPage() {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("org.members.read")) return <AccessDenied what="roles" />;
  const [roles, permissions] = await Promise.all([listRoles(ctx), listPermissionCatalogue()]);
  const canManage = ctx.permissions.has("org.roles.manage");
  const custom = roles.filter((r) => !r.is_system);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle>Custom roles</CardTitle>
            <CardDescription>
              Roles specific to {ctx.organization.name}, built from the permission catalogue. System roles below are
              fixed so their meaning is the same in every organization.
            </CardDescription>
          </div>
          {canManage && <RoleDialog catalogue={permissions} />}
        </CardHeader>
        <CardContent>
          {custom.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No custom roles yet.{canManage ? " Create one when no system role fits." : ""}
            </p>
          ) : (
            <ul className="divide-y">
              {custom.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {r.name} <code className="ml-1 text-xs text-muted-foreground">{r.key}</code>
                    </p>
                    {r.description && <p className="text-sm text-muted-foreground">{r.description}</p>}
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {r.permissions.map((p) => (
                        <Badge key={p} variant="secondary" className="font-mono text-[10px]">
                          {p}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="mr-2 text-xs text-muted-foreground">
                      {r.memberCount} member{r.memberCount === 1 ? "" : "s"}
                    </span>
                    {canManage && (
                      <>
                        <RoleDialog
                          catalogue={permissions}
                          role={{ id: r.id, key: r.key, name: r.name, description: r.description, permissions: r.permissions }}
                        />
                        <DeleteRoleButton id={r.id} name={r.name} memberCount={r.memberCount} />
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Permission matrix</CardTitle>
          <CardDescription>Exactly what the database enforces for each role in this organization.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-separate border-spacing-0 text-xs">
            <caption className="sr-only">Roles by permission</caption>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 bg-card p-2 text-left font-medium">
                  Permission
                </th>
                {roles.map((r) => (
                  <th key={r.id} scope="col" className="p-2 align-bottom font-medium" title={r.description}>
                    <span className="block w-20 leading-tight">{r.name}</span>
                    {!r.is_system && <span className="mt-0.5 block text-[10px] font-normal text-primary">custom</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {permissions.map((p) => (
                <tr key={p.key} className="hover:bg-muted/50">
                  <th scope="row" className="sticky left-0 border-t bg-card p-2 text-left font-normal">
                    <code className="font-medium">{p.key}</code>
                    <span className="block text-muted-foreground">{p.description}</span>
                  </th>
                  {roles.map((r) => (
                    <td key={r.id} className="border-t p-2 text-center">
                      {r.permissions.includes(p.key) ? (
                        <Check className="mx-auto size-4 text-primary" aria-label="Granted" />
                      ) : (
                        <span className="sr-only">Not granted</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
