import type { Metadata } from "next";

import { AuditTrail } from "@/components/common/audit-trail";
import { FilterBar } from "@/components/common/filter-bar";
import { Pagination, withParams } from "@/components/common/pagination";
import { AccessDenied } from "@/components/common/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/auth/org-context";
import { AUDITED_ENTITY_TYPES, listAuditLogs } from "@/lib/data/audit";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("audit.read")) return <AccessDenied what="the audit log" />;
  const sp = await searchParams;
  const entity = typeof sp.entity === "string" && (AUDITED_ENTITY_TYPES as readonly string[]).includes(sp.entity) ? sp.entity : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const audit = await listAuditLogs(ctx, { entityType: entity, page });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit log</CardTitle>
        <CardDescription>
          Append-only record of changes, written by database triggers so it cannot be bypassed by the application.
          Records cannot be edited or deleted.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FilterBar
          filters={[
            {
              key: "entity",
              label: "Record types",
              options: AUDITED_ENTITY_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, " ") })),
            },
          ]}
        />
        <AuditTrail rows={audit.rows} names={audit.names} timeZone={ctx.settings.timezone} showEntity />
        <Pagination
          page={audit.page}
          pageSize={audit.pageSize}
          total={audit.total}
          hrefForPage={(n) => withParams("/admin/audit", { entity }, { page: String(n) })}
        />
      </CardContent>
    </Card>
  );
}
