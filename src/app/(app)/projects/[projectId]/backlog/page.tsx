import { Plus, Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { FilterBar } from "@/components/common/filter-bar";
import { AccessDenied } from "@/components/common/states";
import { BacklogRowActions, QuickAdd } from "@/components/work/backlog-controls";
import { WorkItemList } from "@/components/work/work-item-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/auth/org-context";
import { loadWorkFormOptions, listSprints, listWorkItems, type WorkItemRow } from "@/lib/data/work";
import { PRIORITIES, PRIORITY_LABELS, TYPE_LABELS, WORK_ITEM_TYPES } from "@/lib/domain/work";
import { formatDate } from "@/lib/format";
import { workFiltersSchema } from "@/lib/validation/work";

export const metadata: Metadata = { title: "Backlog" };

export default async function BacklogPage({ params, searchParams }: PageProps<"/projects/[projectId]/backlog">) {
  const { projectId } = await params;
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("work.read")) return <AccessDenied what="work items" />;
  const raw = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const filters = workFiltersSchema.parse(raw);
  const [items, sprints, options] = await Promise.all([listWorkItems(ctx, projectId, filters), listSprints(projectId), loadWorkFormOptions(ctx, projectId)]);

  const canCreate = ctx.permissions.has("work.create");
  const canMove = ctx.permissions.has("work.update");
  const open = sprints.filter((s) => s.state !== "completed").sort((a, b) => (a.state === "active" ? -1 : b.state === "active" ? 1 : a.start_date.localeCompare(b.start_date)));
  const moveTargets = open.map((s) => ({ id: s.id, name: s.name }));
  const sections = [
    ...open.map((s) => ({ key: s.id, sprint: s, items: items.filter((i) => i.sprint_id === s.id) })),
    { key: "backlog", sprint: null, items: items.filter((i) => !i.sprint_id || i.sprint?.state === "completed") },
  ];

  const total = (list: WorkItemRow[]) => list.reduce((sum, i) => sum + Number(i.story_points ?? 0), 0);
  function actionsFor(list: WorkItemRow[]) {
    return function renderActions(item: WorkItemRow) {
      if (!canMove) return null;
      const first = list[0];
      const last = list.at(-1);
      return (
        <BacklogRowActions
          itemId={item.id}
          itemKey={item.key}
          sprints={moveTargets}
          currentSprintId={item.sprint_id && item.sprint?.state !== "completed" ? item.sprint_id : null}
          topRank={first && first.id !== item.id ? first.rank : null}
          bottomRank={last && last.id !== item.id ? last.rank : null}
        />
      );
    };
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <FilterBar
          searchPlaceholder="Search title or key"
          filters={[
            { key: "type", label: "Types", options: WORK_ITEM_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] })) },
            { key: "assignee", label: "Assignees", allLabel: "Anyone", options: [{ value: "me", label: "Me" }, { value: "unassigned", label: "Unassigned" }, ...options.members] },
            { key: "priority", label: "Priorities", allLabel: "Any priority", options: PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] })) },
            { key: "blocked", label: "Blocked", allLabel: "Blocked or not", options: [{ value: "yes", label: "Blocked only" }] },
          ]}
        />
        {canCreate && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/projects/import">
                <Upload className="size-4" /> Import
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href={`/projects/${projectId}/items/new`}>
                <Plus className="size-4" /> New item
              </Link>
            </Button>
          </div>
        )}
      </div>

      {sections.map(({ key, sprint, items: list }) => (
        <Card key={key} className="gap-0 py-0">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b py-3">
            <div className="space-y-0.5">
              <CardTitle className="flex items-center gap-2 text-base">
                {sprint ? sprint.name : "Backlog"}
                {sprint?.state === "active" && <Badge>Active</Badge>}
                {sprint?.state === "planned" && <Badge variant="outline">Planned</Badge>}
              </CardTitle>
              <CardDescription>
                {sprint ? `${formatDate(sprint.start_date)} – ${formatDate(sprint.end_date)} · ` : "Not scheduled · "}
                {list.length} items · {total(list)} points
                {sprint?.goal && <span className="block">Goal: {sprint.goal}</span>}
              </CardDescription>
            </div>
            {sprint && (
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/projects/${projectId}/sprints`}>Manage sprint</Link>
              </Button>
            )}
          </CardHeader>
          <CardContent className="px-0">
            <WorkItemList items={list} projectId={projectId} actions={actionsFor(list)} />
            {canCreate && (
              <div className="border-t p-3">
                <QuickAdd projectId={projectId} sprintId={sprint?.id} placeholder={sprint ? `Add to ${sprint.name}…` : "Add to the backlog…"} />
              </div>
            )}
          </CardContent>
        </Card>
      ))}
      {open.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No planned sprints.{" "}
          <Link href={`/projects/${projectId}/sprints`} className="text-primary hover:underline">
            Plan one
          </Link>{" "}
          to start scheduling work.
        </p>
      )}
    </div>
  );
}
