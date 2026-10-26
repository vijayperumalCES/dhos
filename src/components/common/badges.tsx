import { Badge } from "@/components/ui/badge";
import {
  HEALTH_LABELS,
  STATUS_LABELS,
  type ProjectHealth,
  type ProjectStatus,
} from "@/lib/domain/project-lifecycle";
import { cn } from "@/lib/utils";

const HEALTH_DOT: Record<ProjectHealth, string> = {
  green: "bg-health-green",
  amber: "bg-health-amber",
  red: "bg-health-red",
  not_assessed: "bg-health-none",
};

/** RAG badge: colour is always paired with a text label, never colour alone. */
export function HealthBadge({ health, className }: { health: ProjectHealth; className?: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", className)}>
      <span className={cn("size-2 rounded-full", HEALTH_DOT[health])} aria-hidden />
      {HEALTH_LABELS[health]}
    </Badge>
  );
}

const STATUS_STYLE: Record<ProjectStatus, string> = {
  proposed: "bg-muted text-muted-foreground",
  approved: "bg-secondary text-secondary-foreground",
  planning: "bg-chart-2/15 text-foreground",
  active: "bg-primary/12 text-primary",
  on_hold: "bg-health-amber/15 text-foreground",
  completed: "bg-health-green/15 text-foreground",
  cancelled: "bg-muted text-muted-foreground line-through decoration-1",
};

export function StatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  return (
    <Badge variant="secondary" className={cn("font-medium", STATUS_STYLE[status], className)}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function ArchivedBadge() {
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Archived
    </Badge>
  );
}
