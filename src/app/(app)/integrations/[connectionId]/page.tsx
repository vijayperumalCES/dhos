import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ConnectionHealthBadge, RunResultBadge } from "@/components/automation/badges";
import { ConnectionActions, UnlinkButton } from "@/components/automation/integration-controls";
import { PageHeader } from "@/components/common/page-header";
import { AccessDenied, EmptyState } from "@/components/common/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgContext } from "@/lib/auth/org-context";
import { PROVIDER_LABELS, type Provider } from "@/lib/automation/adapters";
import { getConnectionDetail } from "@/lib/data/automation";
import { formatDateTime, formatRelative } from "@/lib/format";

export const metadata: Metadata = { title: "Integration" };

export default async function ConnectionPage({ params }: PageProps<"/integrations/[connectionId]">) {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("automation.read")) return <AccessDenied what="integrations" />;
  const { connectionId } = await params;
  const detail = await getConnectionDetail(ctx, connectionId);
  if (!detail) notFound();
  const { conn, links, runs } = detail;
  const canManage = ctx.permissions.has("automation.manage");
  const tz = ctx.settings.timezone;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={conn.name}
        breadcrumbs={[{ label: "Integrations", href: "/integrations" }, { label: conn.name }]}
        description={`${PROVIDER_LABELS[conn.provider as Provider]} · mock adapter. ${Object.entries((conn.config ?? {}) as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join(", ")}`}
        meta={<ConnectionHealthBadge health={conn.health as "never_synced" | "healthy" | "error"} />}
        actions={canManage && <ConnectionActions connection={{ id: conn.id, name: conn.name, provider: conn.provider, enabled: conn.enabled }} />}
      />
      <Card>
        <CardHeader>
          <CardTitle>Linked work items</CardTitle>
          <CardDescription>Last sync {formatRelative(conn.last_sync_at)}. A status change on the external side is announced to the project manager and the assignee.</CardDescription>
        </CardHeader>
        <CardContent>
          {links.length === 0 ? (
            <EmptyState title="Nothing linked yet" description="Link a work item by its key and the external issue's id." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Work item</TableHead>
                  <TableHead>External issue</TableHead>
                  <TableHead>External status</TableHead>
                  <TableHead>Synced</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      {l.work_item ? (
                        <Link href={`/projects/${l.work_item.project_id}/items/${l.work_item.key}`} className="underline underline-offset-2">
                          {l.work_item.key}
                        </Link>
                      ) : (
                        "—"
                      )}
                      <div className="max-w-xs truncate text-xs text-muted-foreground">{l.work_item?.title}</div>
                    </TableCell>
                    <TableCell>
                      {l.external_url ? (
                        <a href={l.external_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                          {l.external_id}
                        </a>
                      ) : (
                        l.external_id
                      )}
                    </TableCell>
                    <TableCell>{l.external_status ?? "—"}</TableCell>
                    <TableCell>{formatRelative(l.last_synced_at)}</TableCell>
                    <TableCell>{canManage && <UnlinkButton linkId={l.id} />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Sync history</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sync has run yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {runs.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <RunResultBadge status={r.status} />
                  <span>{formatDateTime(r.created_at, tz)}</span>
                  <span className="text-muted-foreground">{r.error ?? Object.entries((r.summary ?? {}) as Record<string, unknown>).filter(([k]) => k !== "connections").map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
