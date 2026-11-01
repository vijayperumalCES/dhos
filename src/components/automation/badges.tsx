import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const RED = "bg-health-red/15";
const AMBER = "bg-health-amber/15";
const GREEN = "bg-health-green/15";
const MUTED = "bg-muted text-muted-foreground";

function Pill({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <Badge variant="secondary" className={cn("font-medium", className)}>
      {children}
    </Badge>
  );
}

const DELIVERY = { pending: [AMBER, "Pending"], succeeded: [GREEN, "Delivered"], dead: [RED, "Failed for good"] } as const;
export const DeliveryStatusBadge = ({ status }: { status: keyof typeof DELIVERY }) => <Pill className={DELIVERY[status][0]}>{DELIVERY[status][1]}</Pill>;

export const EnabledBadge = ({ enabled, offLabel = "Off" }: { enabled: boolean; offLabel?: string }) => <Pill className={enabled ? GREEN : MUTED}>{enabled ? "On" : offLabel}</Pill>;

const SEVERITY = { info: MUTED, warning: AMBER, critical: RED } as const;
export const NotificationSeverityBadge = ({ severity }: { severity: keyof typeof SEVERITY }) => <Pill className={SEVERITY[severity]}>{severity[0].toUpperCase() + severity.slice(1)}</Pill>;

const HEALTH = { never_synced: [MUTED, "Never synced"], healthy: [GREEN, "Healthy"], error: [RED, "Error"] } as const;
export const ConnectionHealthBadge = ({ health }: { health: keyof typeof HEALTH }) => <Pill className={HEALTH[health][0]}>{HEALTH[health][1]}</Pill>;

export const RunResultBadge = ({ status }: { status: string | null }) => (status === null ? <Pill className={MUTED}>Never run</Pill> : <Pill className={status === "failed" ? RED : GREEN}>{status === "failed" ? "Failed" : "Succeeded"}</Pill>);

export const EmailStatusBadge = ({ status }: { status: string | null }) =>
  status === null ? null : <Pill className={status === "failed" ? RED : status === "pending" ? AMBER : MUTED}>{status === "simulated" ? "Email simulated" : status === "sent" ? "Emailed" : status === "pending" ? "Email pending" : "Email failed"}</Pill>;
