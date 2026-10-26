import type { Metadata } from "next";

import { ArchivedBadge } from "@/components/common/badges";
import { AccessDenied, EmptyState } from "@/components/common/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgContext } from "@/lib/auth/org-context";
import { listDepartments } from "@/lib/data/members";
import { loadProjectFormOptions } from "@/lib/data/options";
import { personName } from "@/lib/format";
import { NONE } from "@/lib/validation/common";

import { DepartmentArchiveButton, DepartmentDialog } from "./department-controls";

export const metadata: Metadata = { title: "Departments" };

export default async function DepartmentsPage() {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("org.members.read")) return <AccessDenied what="departments" />;
  const canManage = ctx.permissions.has("org.members.manage");
  const [departments, { members }] = await Promise.all([listDepartments(ctx, { includeArchived: canManage }), loadProjectFormOptions(ctx)]);

  return (
    <Card className="pb-0">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle>Departments</CardTitle>
          <CardDescription>Assign people to a department from the Members tab. Reporting lines are shown in the Org chart.</CardDescription>
        </div>
        {canManage && <DepartmentDialog members={members} />}
      </CardHeader>
      <CardContent className="px-0">
        {departments.length === 0 ? (
          <EmptyState className="mx-6 mb-6" title="No departments yet" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Department</TableHead>
                <TableHead>Head</TableHead>
                <TableHead className="text-right">Members</TableHead>
                {canManage && <TableHead className="w-24 pr-6"><span className="sr-only">Actions</span></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments.map((d) => (
                <TableRow key={d.id} className={d.archived_at ? "opacity-60" : undefined}>
                  <TableCell className="pl-6">
                    <span className="font-medium">{d.name}</span>{" "}
                    {d.code && <code className="text-xs text-muted-foreground">{d.code}</code>} {d.archived_at && <ArchivedBadge />}
                    {d.description && <p className="text-xs text-muted-foreground">{d.description}</p>}
                  </TableCell>
                  <TableCell>{personName(d.head)}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.memberCount}</TableCell>
                  {canManage && (
                    <TableCell className="pr-6 text-right">
                      {!d.archived_at && (
                        <DepartmentDialog
                          members={members}
                          department={{
                            id: d.id,
                            name: d.name,
                            code: d.code ?? "",
                            description: d.description ?? "",
                            headMembershipId: d.head_membership_id ?? NONE,
                          }}
                        />
                      )}
                      <DepartmentArchiveButton id={d.id} name={d.name} archived={d.archived_at !== null} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
