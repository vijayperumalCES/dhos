import {
  AlertOctagon,
  ArrowDown,
  ArrowUp,
  Bug,
  ChevronsUp,
  CircleDot,
  FileDiff,
  Layers,
  ListChecks,
  ListTree,
  Minus,
  Puzzle,
  Siren,
  SquareCheck,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  TYPE_LABELS,
  type WorkflowCategory,
  type WorkItemPriority,
  type WorkItemType,
} from "@/lib/domain/work";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<WorkItemType, { icon: LucideIcon; className: string }> = {
  epic: { icon: Layers, className: "text-chart-5" },
  feature: { icon: Puzzle, className: "text-chart-1" },
  story: { icon: CircleDot, className: "text-chart-3" },
  task: { icon: SquareCheck, className: "text-chart-2" },
  subtask: { icon: ListChecks, className: "text-chart-2" },
  bug: { icon: Bug, className: "text-health-red" },
  incident: { icon: Siren, className: "text-health-red" },
  change_request: { icon: FileDiff, className: "text-chart-4" },
};

/** Type icon with an accessible label; colour is decorative, the label carries meaning. */
export function TypeIcon({ type, className }: { type: WorkItemType; className?: string }) {
  const { icon: Icon, className: tone } = TYPE_ICON[type];
  return <Icon className={cn("size-4 shrink-0", tone, className)} aria-label={TYPE_LABELS[type]} role="img" />;
}

const PRIORITY_ICON: Record<WorkItemPriority, { icon: LucideIcon; className: string }> = {
  critical: { icon: ChevronsUp, className: "text-health-red" },
  high: { icon: ArrowUp, className: "text-health-amber" },
  medium: { icon: Minus, className: "text-muted-foreground" },
  low: { icon: ArrowDown, className: "text-muted-foreground" },
};

export function PriorityIcon({ priority }: { priority: WorkItemPriority }) {
  const { icon: Icon, className } = PRIORITY_ICON[priority];
  return <Icon className={cn("size-4 shrink-0", className)} aria-label={`${PRIORITY_LABELS[priority]} priority`} role="img" />;
}

const CATEGORY_STYLE: Record<WorkflowCategory, string> = {
  todo: "bg-muted text-muted-foreground",
  in_progress: "bg-primary/12 text-primary",
  done: "bg-health-green/15 text-foreground",
};

export function StateBadge({ state }: { state: { name: string; category: WorkflowCategory } | null }) {
  if (!state) return null;
  return (
    <Badge variant="secondary" className={cn("font-medium", CATEGORY_STYLE[state.category])} title={CATEGORY_LABELS[state.category]}>
      {state.name}
    </Badge>
  );
}

export function PointsBadge({ points }: { points: number | null }) {
  if (points === null || points === undefined) return null;
  return (
    <span className="inline-flex min-w-6 justify-center rounded-full bg-muted px-1.5 text-xs font-medium tabular-nums" title="Story points">
      {Number(points)}
      <span className="sr-only"> story points</span>
    </span>
  );
}

export function BlockedBadge({ reason }: { reason?: string | null }) {
  return (
    <Badge variant="outline" className="gap-1 border-health-red/40 text-health-red" title={reason ?? undefined}>
      <AlertOctagon className="size-3" aria-hidden /> Blocked
    </Badge>
  );
}

export function HierarchyIcon() {
  return <ListTree className="size-4 text-muted-foreground" aria-hidden />;
}
