import { Badge } from "@/components/ui/badge";
import {
  CAPACITY_STATUS_LABELS,
  REQUEST_STATUS_LABELS,
  TIMESHEET_STATUS_LABELS,
  type CapacityStatus,
  type RequestStatus,
  type TimesheetStatus,
} from "@/lib/domain/workforce";
import { cn } from "@/lib/utils";

const REQUEST_STYLE: Record<RequestStatus, string> = {
  pending: "bg-health-amber/15 text-foreground",
  approved: "bg-health-green/15 text-foreground",
  rejected: "bg-health-red/15 text-foreground",
  cancelled: "bg-muted text-muted-foreground line-through decoration-1",
};

export function RequestStatusBadge({ status, className }: { status: RequestStatus; className?: string }) {
  return (
    <Badge variant="secondary" className={cn("font-medium", REQUEST_STYLE[status], className)}>
      {REQUEST_STATUS_LABELS[status]}
    </Badge>
  );
}

const TIMESHEET_STYLE: Record<TimesheetStatus, string> = {
  missing: "bg-health-red/15 text-foreground",
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-health-amber/15 text-foreground",
  approved: "bg-health-green/15 text-foreground",
  rejected: "bg-health-red/15 text-foreground",
};

export function TimesheetStatusBadge({ status, className }: { status: TimesheetStatus; className?: string }) {
  return (
    <Badge variant="secondary" className={cn("font-medium", TIMESHEET_STYLE[status], className)}>
      {TIMESHEET_STATUS_LABELS[status]}
    </Badge>
  );
}

const CAPACITY_STYLE: Record<CapacityStatus, string> = {
  unavailable: "bg-muted text-muted-foreground",
  over: "bg-health-red/15 text-foreground",
  full: "bg-health-green/15 text-foreground",
  partial: "bg-health-amber/15 text-foreground",
  bench: "bg-muted text-muted-foreground",
};

export function CapacityBadge({ status, className }: { status: CapacityStatus; className?: string }) {
  return (
    <Badge variant="secondary" className={cn("font-medium", CAPACITY_STYLE[status], className)}>
      {CAPACITY_STATUS_LABELS[status]}
    </Badge>
  );
}
