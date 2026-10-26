import { Badge } from "@/components/ui/badge";
import { MILESTONE_STATUS_LABELS, scheduleVarianceDays, type MilestoneStatus } from "@/lib/domain/work";
import { cn } from "@/lib/utils";

const STYLE: Record<MilestoneStatus, string> = {
  achieved: "bg-health-green/15",
  overdue: "bg-health-red/15",
  due_soon: "bg-health-amber/15",
  on_track: "bg-muted text-muted-foreground",
};

export function MilestoneStatusBadge({ status }: { status: MilestoneStatus }) {
  return (
    <Badge variant="secondary" className={cn("font-medium", STYLE[status])}>
      {MILESTONE_STATUS_LABELS[status]}
    </Badge>
  );
}

/** "+21 d" slipped / "−3 d" earlier / "On baseline" / "No baseline". */
export function VarianceLabel({ milestone }: { milestone: { due_date: string; baseline_due_date: string | null } }) {
  const v = scheduleVarianceDays(milestone);
  if (v === null) return <span className="text-muted-foreground">No baseline</span>;
  if (v === 0) return <span className="text-muted-foreground">On baseline</span>;
  return (
    <span className={cn("tabular-nums", v > 0 ? "font-medium text-health-red" : "text-health-green")}>
      {v > 0 ? `+${v}` : `−${Math.abs(v)}`} d<span className="sr-only">{v > 0 ? " later than baseline" : " earlier than baseline"}</span>
    </span>
  );
}
