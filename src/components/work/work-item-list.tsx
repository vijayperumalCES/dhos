import Link from "next/link";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { WorkItemRow } from "@/lib/data/work";
import { initials } from "@/lib/format";

import { BlockedBadge, PointsBadge, PriorityIcon, StateBadge, TypeIcon } from "./work-badges";

/** Compact, accessible list of work items shared by the backlog, sprints and My Work. */
export function WorkItemList({
  items,
  projectId,
  showProject,
  actions,
}: {
  items: (WorkItemRow & { project?: { id: string; code: string } | null })[];
  projectId?: string;
  showProject?: boolean;
  actions?: (item: WorkItemRow, index: number) => React.ReactNode;
}) {
  if (items.length === 0) return <p className="px-3 py-4 text-sm text-muted-foreground">No items.</p>;
  return (
    <ul className="divide-y">
      {items.map((item, i) => {
        const pid = projectId ?? item.project?.id ?? item.project_id;
        const name = item.assignee?.user_profiles?.display_name;
        return (
          <li key={item.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40">
            <TypeIcon type={item.type} />
            <Link href={`/projects/${pid}/items/${item.key}`} className="shrink-0 font-mono text-xs text-muted-foreground hover:underline">
              {item.key}
            </Link>
            <Link href={`/projects/${pid}/items/${item.key}`} className="min-w-0 flex-1 truncate hover:underline">
              {item.title}
            </Link>
            {showProject && item.project && <span className="hidden text-xs text-muted-foreground sm:inline">{item.project.code}</span>}
            {item.blocked && <BlockedBadge reason={item.blocked_reason} />}
            <span className="hidden md:inline-flex">
              <StateBadge state={item.state} />
            </span>
            <PriorityIcon priority={item.priority} />
            <PointsBadge points={item.story_points} />
            {name ? (
              <Avatar className="size-6" title={name}>
                <AvatarFallback className="text-[10px]">{initials(name)}</AvatarFallback>
              </Avatar>
            ) : (
              <span className="size-6 rounded-full border border-dashed" title="Unassigned" aria-label="Unassigned" />
            )}
            {actions?.(item, i)}
          </li>
        );
      })}
    </ul>
  );
}
