import type { Metadata } from "next";

import { AccessDenied } from "@/components/common/states";
import { EnabledBadge } from "@/components/automation/badges";
import { ControlsDialog, DecideButtons, LegalHoldDialog, RequestGrantDialog, RetentionDialog } from "@/components/security/security-controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgContext } from "@/lib/auth/org-context";
import { listMembers } from "@/lib/data/members";
import { getSecuritySettings, listGrantRequests, listPrivilegedRoles } from "@/lib/data/security";
import { formatDate, formatRelative } from "@/lib/format";

export const metadata: Metadata = { title: "Security" };

const STATUS_LABEL = { pending: "Waiting", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled", expired: "Expired" } as const;

export default async function SecurityPage() {
  const ctx = await requireOrgContext();
  const canSettings = ctx.permissions.has("org.settings.manage");
  const canMembers = ctx.permissions.has("org.members.manage");
  if (!canSettings && !canMembers) return <AccessDenied what="security settings" />;

  const [settings, requests, roles, members] = await Promise.all([
    getSecuritySettings(ctx),
    listGrantRequests(ctx),
    canMembers ? listPrivilegedRoles(ctx) : Promise.resolve([]),
    canMembers ? listMembers(ctx) : Promise.resolve([]),
  ]);
  const pending = requests.filter((r) => r.status === "pending");
  const history = requests.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Security controls</CardTitle>
            <CardDescription>Off by default. Every change is audited.</CardDescription>
          </div>
          {canSettings && <ControlsDialog values={{ dualApproval: settings.requireDualApproval, requireMfa: settings.requireMfa }} />}
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">Dual approval for privileged roles</p>
              <p className="text-muted-foreground">A second administrator approves any grant of a role that carries administrative or finance permissions.</p>
            </div>
            <EnabledBadge enabled={settings.requireDualApproval} />
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium">Multi-factor authentication required</p>
              <p className="text-muted-foreground">Members must verify an authenticator code in each session before they can see anything here.</p>
            </div>
            <EnabledBadge enabled={settings.requireMfa} />
          </div>
        </CardContent>
      </Card>

      {settings.requireDualApproval && canMembers && (
        <Card className="pb-0">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>Privileged role requests ({pending.length} waiting)</CardTitle>
              <CardDescription>You can&apos;t approve your own request. Requests expire after 7 days.</CardDescription>
            </div>
            <RequestGrantDialog
              members={members.filter((m) => m.status === "active").map((m) => ({ value: m.id, label: m.displayName }))}
              roles={roles.map((r) => ({ value: r.key, label: r.name }))}
            />
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden md:table-cell">Requested by</TableHead>
                  <TableHead className="hidden lg:table-cell">Reason</TableHead>
                  <TableHead className="pr-6 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="pl-6 text-muted-foreground">
                      Nothing is waiting for approval.
                    </TableCell>
                  </TableRow>
                )}
                {pending.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="pl-6 font-medium">{r.memberName}</TableCell>
                    <TableCell>{r.roleName}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {r.requestedByName}
                      <span className="block text-xs text-muted-foreground">
                        {formatRelative(r.createdAt)}
                        {r.expired ? " · expired" : ` · expires ${formatDate(r.expiresAt)}`}
                      </span>
                    </TableCell>
                    <TableCell className="hidden max-w-xs truncate lg:table-cell" title={r.reason}>
                      {r.reason}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <DecideButtons requestId={r.id} own={r.requestedById === ctx.user.id} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {history.length > 0 && canMembers && (
        <Card className="pb-0">
          <CardHeader>
            <CardTitle>Decided requests</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead className="hidden md:table-cell">Decided by</TableHead>
                  <TableHead className="hidden lg:table-cell pr-6">Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="pl-6 font-medium">{r.memberName}</TableCell>
                    <TableCell>{r.roleName}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "approved" ? "default" : "secondary"}>{STATUS_LABEL[r.status]}</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {r.decidedByName ?? "—"}
                      {r.decidedAt && <span className="block text-xs text-muted-foreground">{formatRelative(r.decidedAt)}</span>}
                    </TableCell>
                    <TableCell className="hidden pr-6 lg:table-cell">{r.decisionNote ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Retention and legal hold</CardTitle>
            <CardDescription>The audit log is never deleted. Everything else listed here follows the windows below.</CardDescription>
          </div>
          {canSettings && <RetentionDialog values={{ outboxDays: String(settings.retention.outboxDays), notificationDays: String(settings.retention.notificationDays), logDays: String(settings.retention.logDays) }} />}
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <dl className="grid gap-2 sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Events and deliveries</dt>
              <dd className="font-medium">{settings.retention.outboxDays} days</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Read notifications</dt>
              <dd className="font-medium">{settings.retention.notificationDays} days</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Job and sync logs</dt>
              <dd className="font-medium">{settings.retention.logDays} days</dd>
            </div>
          </dl>
          <div className="flex items-start justify-between gap-4 rounded-md border p-4">
            <div>
              <p className="font-medium">
                Legal hold <EnabledBadge enabled={settings.legalHold} offLabel="None" />
              </p>
              {settings.legalHold ? (
                <p className="text-muted-foreground">
                  {settings.legalHoldReason}
                  {settings.legalHoldSetAt && <> · placed {formatRelative(settings.legalHoldSetAt)}</>}. Retention is suspended.
                </p>
              ) : (
                <p className="text-muted-foreground">No hold: retention deletes data older than its window.</p>
              )}
            </div>
            {canSettings && <LegalHoldDialog active={settings.legalHold} />}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
