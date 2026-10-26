import type { Metadata } from "next";

import { FilterBar } from "@/components/common/filter-bar";
import { PageHeader } from "@/components/common/page-header";
import { AccessDenied, EmptyState } from "@/components/common/states";
import { WorkItemList } from "@/components/work/work-item-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/auth/org-context";
import { listMyWork } from "@/lib/data/work";
import { CATEGORY_LABELS, PRIORITIES, PRIORITY_LABELS, TYPE_LABELS, WORK_ITEM_TYPES, type WorkflowCategory } from "@/lib/domain/work";
import { workFiltersSchema } from "@/lib/validation/work";

export const metadata: Metadata = { title: "My Work" };

export default async function MyWorkPage({ searchParams }: PageProps<"/work">) {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("work.read")) return <AccessDenied what="work items" />;
  const raw = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const filters = workFiltersSchema.parse(raw);
  const items = await listMyWork(ctx, filters);
  const order: WorkflowCategory[] = ["in_progress", "todo", "done"];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="My Work" description="Work items assigned to you across every project you can see." />
      <FilterBar
        searchPlaceholder="Search title or key"
        filters={[
          { key: "type", label: "Types", options: WORK_ITEM_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] })) },
          { key: "priority", label: "Priorities", allLabel: "Any priority", options: PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] })) },
          { key: "blocked", label: "Blocked", allLabel: "Blocked or not", options: [{ value: "yes", label: "Blocked only" }] },
        ]}
      />
      {items.length === 0 ? (
        <EmptyState title="Nothing assigned to you" description="Items assigned to you in any project will appear here." />
      ) : (
        <div className="space-y-4">
          {order.map((cat) => {
            const list = items.filter((i) => i.state?.category === cat);
            if (list.length === 0) return null;
            return (
              <Card key={cat} className="gap-0 py-0">
                <CardHeader className="border-b py-3">
                  <CardTitle className="text-base">
                    {CATEGORY_LABELS[cat]} ({list.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-0">
                  <WorkItemList items={list} showProject />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
