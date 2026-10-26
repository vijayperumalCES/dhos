import type { Metadata } from "next";

import { AccessDenied, EmptyState } from "@/components/common/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/auth/org-context";
import { buildReportingTree, type ReportingNode } from "@/lib/domain/reporting";
import { listMembers } from "@/lib/data/members";

export const metadata: Metadata = { title: "Org chart" };

export default async function OrgChartPage() {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("org.members.read")) return <AccessDenied what="the org chart" />;
  const members = await listMembers(ctx);
  const roots = buildReportingTree(
    members.map((m) => ({
      id: m.id,
      managerId: m.managerMembershipId,
      name: m.displayName,
      jobTitle: m.jobTitle,
      department: m.departmentName,
    })),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reporting lines</CardTitle>
        <CardDescription>
          Who reports to whom among active members. Set someone&apos;s manager from the Members tab.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {roots.length === 0 ? (
          <EmptyState title="No members" />
        ) : (
          <ul role="tree" aria-label="Organization chart" className="space-y-1">
            {roots.map((n) => (
              <Node key={n.id} node={n} level={1} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Node({ node, level }: { node: ReportingNode; level: number }) {
  return (
    <li role="treeitem" aria-level={level} aria-selected={false} aria-expanded={node.reports.length ? true : undefined}>
      <div className="flex flex-wrap items-baseline gap-x-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
        <span className="font-medium">{node.name}</span>
        {node.jobTitle && <span className="text-sm text-muted-foreground">{node.jobTitle}</span>}
        {node.department && <span className="text-xs text-muted-foreground">· {node.department}</span>}
        {node.reports.length > 0 && (
          <span className="text-xs text-muted-foreground">
            · {node.reports.length} direct report{node.reports.length === 1 ? "" : "s"}
          </span>
        )}
      </div>
      {node.reports.length > 0 && (
        <ul role="group" className="ml-4 space-y-1 border-l pl-3">
          {node.reports.map((r) => (
            <Node key={r.id} node={r} level={level + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
