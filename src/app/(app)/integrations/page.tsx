import type { Metadata } from "next";
import Link from "next/link";

import { ConnectionHealthBadge, EnabledBadge } from "@/components/automation/badges";
import { AddConnectionButton } from "@/components/automation/integration-controls";
import { PageHeader } from "@/components/common/page-header";
import { AccessDenied, EmptyState } from "@/components/common/states";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgContext } from "@/lib/auth/org-context";
import { PROVIDER_LABELS, type Provider } from "@/lib/automation/adapters";
import { listConnections } from "@/lib/data/automation";
import { formatRelative } from "@/lib/format";

export const metadata: Metadata = { title: "Integrations" };

export default async function IntegrationsPage() {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("automation.read")) return <AccessDenied what="integrations" />;
  const connections = await listConnections(ctx);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Integrations"
        description="Link Stride work items to issues in GitHub, Azure DevOps or Jira and hear when their status changes. Connections use mock adapters for now: they behave like the provider so the flow can be tried end to end, but they do not talk to a real account."
        actions={ctx.permissions.has("automation.manage") && <AddConnectionButton />}
      />
      <Card>
        <CardContent className="pt-6">
          {connections.length === 0 ? (
            <EmptyState title="No connections" description="Add a connection, then link work items to external issues." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Connection</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead className="text-right">Links</TableHead>
                  <TableHead>Last sync</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connections.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <Link href={`/integrations/${c.id}`} className="underline underline-offset-2">
                        {c.name}
                      </Link>{" "}
                      {!c.enabled && <EnabledBadge enabled={false} offLabel="Paused" />}
                    </TableCell>
                    <TableCell>{PROVIDER_LABELS[c.provider as Provider]} (mock)</TableCell>
                    <TableCell>
                      <ConnectionHealthBadge health={c.health as "never_synced" | "healthy" | "error"} />
                      {c.last_error && <div className="max-w-48 text-xs text-destructive">{c.last_error}</div>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.linkCount}</TableCell>
                    <TableCell>{formatRelative(c.last_sync_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
