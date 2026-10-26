import { Download } from "lucide-react";
import type { Metadata } from "next";

import { AccessDenied } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgContext } from "@/lib/auth/org-context";
import { listDepartments, listInvitations, listMembers, listRoles } from "@/lib/data/members";
import { formatDate, formatRelative } from "@/lib/format";

import { BulkInviteCard, InviteMemberCard, MemberActions, ResendInvitationButton, RevokeInvitationButton } from "./member-controls";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage() {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("org.members.read")) return <AccessDenied what="the member directory" />;
  const canManage = ctx.permissions.has("org.members.manage");
  const [members, roles, invitations, departments] = await Promise.all([
    listMembers(ctx, { includeSuspended: canManage }),
    listRoles(ctx),
    listInvitations(ctx),
    listDepartments(ctx),
  ]);
  const nameById = new Map(members.map((m) => [m.id, m.displayName]));
  const departmentChoices = departments.map((d) => ({ value: d.id, label: d.name }));
  const peopleChoices = members.filter((m) => m.status === "active").map((m) => ({ value: m.id, label: m.displayName }));
  const roleOptions = roles.map((r) => ({ key: r.key, name: r.name, description: r.description }));
  const roleName = new Map(roles.map((r) => [r.key, r.name]));

  return (
    <div className="space-y-6">
      <Card className="pb-0">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Members ({members.length})</CardTitle>
          <Button variant="outline" size="sm" asChild>
            <a href="/api/export/members">
              <Download className="size-4" /> Export CSV
            </a>
          </Button>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Name</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead className="hidden lg:table-cell">Department</TableHead>
                <TableHead className="hidden lg:table-cell">Reports to</TableHead>
                <TableHead className="hidden md:table-cell">Joined</TableHead>
                {canManage && <TableHead className="w-12 pr-6"><span className="sr-only">Actions</span></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id} className={m.status === "suspended" ? "opacity-60" : undefined}>
                  <TableCell className="pl-6">
                    <div className="font-medium">
                      {m.displayName}
                      {m.status === "suspended" && (
                        <Badge variant="outline" className="ml-2">
                          Suspended
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {m.email}
                      {m.jobTitle && ` · ${m.jobTitle}`}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {m.roles.map((r) => (
                        <Badge key={r.key} variant="secondary">
                          {r.name}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">{m.departmentName ?? "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {m.managerMembershipId ? (nameById.get(m.managerMembershipId) ?? "—") : "—"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{formatDate(m.joinedAt)}</TableCell>
                  {canManage && (
                    <TableCell className="pr-6">
                      <MemberActions
                        membershipId={m.id}
                        name={m.displayName}
                        status={m.status}
                        currentRoles={m.roles.map((r) => r.key)}
                        roles={roleOptions}
                        isSelf={m.userId === ctx.user.id}
                        details={{ jobTitle: m.jobTitle, departmentId: m.departmentId, managerMembershipId: m.managerMembershipId }}
                        departments={departmentChoices}
                        people={peopleChoices}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {canManage && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Pending invitations ({invitations.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {invitations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending invitations.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {invitations.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div>
                        <span className="font-medium">{i.email}</span>
                        <span className="text-muted-foreground"> · {i.role_keys.map((k) => roleName.get(k) ?? k).join(", ")}</span>
                        <div className="text-xs text-muted-foreground">
                          {i.email_last_sent_at
                            ? `Emailed ${formatRelative(i.email_last_sent_at)}${i.email_sent_count > 1 ? ` (${i.email_sent_count} times)` : ""}`
                            : "Email not sent"}{" "}
                          · Expires {formatDate(i.expires_at)}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <ResendInvitationButton id={i.id} />
                        <RevokeInvitationButton id={i.id} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <InviteMemberCard roles={roleOptions} />
          <BulkInviteCard />
        </>
      )}
    </div>
  );
}
