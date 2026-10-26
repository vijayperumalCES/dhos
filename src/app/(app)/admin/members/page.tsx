import type { Metadata } from "next";

import { AccessDenied } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgContext } from "@/lib/auth/org-context";
import { listInvitations, listMembers, listRoles } from "@/lib/data/members";
import { formatDate } from "@/lib/format";

import { InviteMemberCard, MemberActions, RevokeInvitationButton } from "./member-controls";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage() {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("org.members.read")) return <AccessDenied what="the member directory" />;
  const canManage = ctx.permissions.has("org.members.manage");
  const [members, roles, invitations] = await Promise.all([
    listMembers(ctx, { includeSuspended: canManage }),
    listRoles(ctx),
    listInvitations(ctx),
  ]);
  const roleOptions = roles.map((r) => ({ key: r.key, name: r.name, description: r.description }));
  const roleName = new Map(roles.map((r) => [r.key, r.name]));

  return (
    <div className="space-y-6">
      <Card className="pb-0">
        <CardHeader>
          <CardTitle>Members ({members.length})</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Name</TableHead>
                <TableHead>Roles</TableHead>
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
                        <div className="text-xs text-muted-foreground">Expires {formatDate(i.expires_at)}</div>
                      </div>
                      <RevokeInvitationButton id={i.id} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <InviteMemberCard roles={roleOptions} />
        </>
      )}
    </div>
  );
}
