import { Check } from "lucide-react";
import type { Metadata } from "next";

import { AccessDenied } from "@/components/common/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/auth/org-context";
import { listPermissionCatalogue, listRoles } from "@/lib/data/members";

export const metadata: Metadata = { title: "Roles & permissions" };

export default async function RolesPage() {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("org.members.read")) return <AccessDenied what="roles" />;
  const [roles, permissions] = await Promise.all([listRoles(ctx), listPermissionCatalogue()]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Permission matrix</CardTitle>
        <CardDescription>
          System roles copied into this organization at creation. Editing roles and creating custom roles is planned;
          today this view is read-only and reflects exactly what the database enforces.
        </CardDescription>
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
                {roles.map((r) => {
                  const has = r.permissions.includes(p.key);
                  return (
                    <td key={r.id} className="border-t p-2 text-center">
                      {has ? <Check className="mx-auto size-4 text-primary" aria-label="Granted" /> : <span className="sr-only">Not granted</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
