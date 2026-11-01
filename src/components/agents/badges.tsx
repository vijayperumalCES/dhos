import { Badge } from "@/components/ui/badge";
import type { Severity } from "@/lib/ai/registry";
import { cn } from "@/lib/utils";

const RED = "bg-health-red/15";
const AMBER = "bg-health-amber/15";
const GREEN = "bg-health-green/15";
const MUTED = "bg-muted text-muted-foreground";
const PRIMARY = "bg-primary/12 text-primary";

function Pill({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <Badge variant="secondary" className={cn("font-medium", className)}>
      {children}
    </Badge>
  );
}

const SEVERITY_STYLE: Record<Severity, string> = { info: MUTED, low: MUTED, medium: AMBER, high: "bg-health-red/10", critical: RED };
export const SeverityBadge = ({ severity }: { severity: Severity }) => <Pill className={SEVERITY_STYLE[severity]}>{severity[0].toUpperCase() + severity.slice(1)}</Pill>;

const RUN_STYLE = { running: PRIMARY, succeeded: GREEN, failed: RED } as const;
const RUN_LABEL = { running: "Running", succeeded: "Succeeded", failed: "Failed" } as const;
export const RunStatusBadge = ({ status }: { status: keyof typeof RUN_STYLE }) => <Pill className={RUN_STYLE[status]}>{RUN_LABEL[status]}</Pill>;

const APPROVAL_STYLE = { pending: AMBER, approved: PRIMARY, rejected: MUTED, executed: GREEN, failed: RED } as const;
const APPROVAL_LABEL = { pending: "Awaiting approval", approved: "Approved", rejected: "Rejected", executed: "Done", failed: "Action failed" } as const;
export const ApprovalStatusBadge = ({ status }: { status: keyof typeof APPROVAL_STYLE }) => <Pill className={APPROVAL_STYLE[status]}>{APPROVAL_LABEL[status]}</Pill>;

export function AgentStateBadge({ enabled, orgEnabled, hasVersion }: { enabled: boolean; orgEnabled: boolean; hasVersion: boolean }) {
  if (!orgEnabled) return <Pill className={MUTED}>Off for organization</Pill>;
  if (!enabled) return <Pill className={MUTED}>{hasVersion ? "Disabled" : "Needs evaluated version"}</Pill>;
  return <Pill className={GREEN}>Enabled</Pill>;
}
