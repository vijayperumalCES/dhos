import type { Metadata } from "next";
import Link from "next/link";

import { AccessDenied } from "@/components/common/states";
import { QuickAdd } from "@/components/work/backlog-controls";
import { Board } from "@/components/work/board";
import { Button } from "@/components/ui/button";
import { requireOrgContext } from "@/lib/auth/org-context";
import { DONE_WINDOW_DAYS, fetchBoardItems, type BoardScope } from "@/lib/board";
import { listSprints, listWorkflowStates } from "@/lib/data/work";
import { formatDate } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Board" };

export default async function BoardPage({ params, searchParams }: PageProps<"/projects/[projectId]/board">) {
  const { projectId } = await params;
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("work.read")) return <AccessDenied what="the board" />;
  const view = (await searchParams).view === "all" ? "all" : "sprint";

  const [states, sprints] = await Promise.all([listWorkflowStates(ctx), listSprints(projectId)]);
  const activeSprint = sprints.find((s) => s.state === "active") ?? null;
  const scope: BoardScope = view === "sprint" && activeSprint ? { kind: "sprint", sprintId: activeSprint.id } : { kind: "all" };
  const items = await fetchBoardItems(await createSupabaseServerClient(), projectId, scope);
  const columns = states.map((s) => ({ id: s.id, name: s.name, category: s.category, wipLimit: s.wip_limit }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border p-1" role="group" aria-label="Board scope">
          <Button asChild size="sm" variant="ghost" className={cn(scope.kind === "sprint" && "bg-muted")} aria-pressed={scope.kind === "sprint"}>
            <Link href={`/projects/${projectId}/board`}>Active sprint</Link>
          </Button>
          <Button asChild size="sm" variant="ghost" className={cn(scope.kind === "all" && "bg-muted")} aria-pressed={scope.kind === "all"}>
            <Link href={`/projects/${projectId}/board?view=all`}>All open work</Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {scope.kind === "sprint" && activeSprint
            ? `${activeSprint.name} · ${formatDate(activeSprint.start_date)} – ${formatDate(activeSprint.end_date)}`
            : view === "sprint"
              ? "No active sprint — showing all open work."
              : `All open work, plus items finished in the last ${DONE_WINDOW_DAYS} days.`}
        </p>
      </div>
      {ctx.permissions.has("work.create") && (
        <div className="max-w-xl">
          <QuickAdd projectId={projectId} sprintId={scope.kind === "sprint" ? scope.sprintId : undefined} placeholder="Add to the first column…" />
        </div>
      )}
      <Board projectId={projectId} scope={scope} columns={columns} initialItems={items} canMove={ctx.permissions.has("work.update")} />
      {ctx.permissions.has("workflow.manage") && (
        <p className="text-xs text-muted-foreground">
          Columns come from the organization workflow.{" "}
          <Link href="/admin/workflow" className="text-primary hover:underline">
            Configure states and rules
          </Link>
        </p>
      )}
    </div>
  );
}
