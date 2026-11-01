import { Badge } from "@/components/ui/badge";
import { FINANCE_STATUS_LABELS, type FinanceStatus } from "@/lib/domain/finance";
import { cn } from "@/lib/utils";

const STYLES: Record<FinanceStatus, string> = {
  over_budget: "bg-health-red/15",
  at_risk: "bg-health-amber/15",
  on_track: "bg-health-green/15",
  no_baseline: "bg-muted text-muted-foreground",
};

export function FinanceStatusBadge({ status }: { status: FinanceStatus }) {
  return (
    <Badge variant="secondary" className={cn("font-medium", STYLES[status])}>
      {FINANCE_STATUS_LABELS[status]}
    </Badge>
  );
}
