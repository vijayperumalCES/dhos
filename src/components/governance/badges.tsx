import { Badge } from "@/components/ui/badge";
import {
  ACTION_STATUS_LABELS,
  CHANGE_STATUS_LABELS,
  CONTRACT_STATUS_LABELS,
  DECISION_STATUS_LABELS,
  DOCUMENT_VISIBILITY_LABELS,
  ESCALATION_SEVERITY_LABELS,
  ESCALATION_STATUS_LABELS,
  GATE_STATUS_LABELS,
  RAID_STATUS_LABELS,
  RAID_TYPE_LABELS,
  RELEASE_STATUS_LABELS,
  RISK_RATING_LABELS,
  riskRating,
  type ActionStatus,
  type ChangeStatus,
  type ContractStatus,
  type ContractTiming,
  type DecisionStatus,
  type DocumentVisibility,
  type EscalationSeverity,
  type EscalationStatus,
  type EscalationTiming,
  type GateStatus,
  type RaidStatus,
  type RaidType,
  type ReleaseStatus,
} from "@/lib/domain/governance";
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

export const RaidTypeBadge = ({ type }: { type: RaidType }) => <Badge variant="outline">{RAID_TYPE_LABELS[type]}</Badge>;

const RAID_STATUS_STYLE: Record<RaidStatus, string> = { open: AMBER, in_progress: PRIMARY, resolved: GREEN, accepted: MUTED, closed: MUTED };
export const RaidStatusBadge = ({ status }: { status: RaidStatus }) => <Pill className={RAID_STATUS_STYLE[status]}>{RAID_STATUS_LABELS[status]}</Pill>;

const RATING_STYLE = { low: GREEN, medium: AMBER, high: "bg-health-red/10", critical: RED } as const;
/** Score with its band spelled out: colour is never the only signal. */
export function RiskScoreBadge({ score }: { score: number | null }) {
  const rating = riskRating(score);
  if (!rating) return <span className="text-muted-foreground">—</span>;
  return (
    <Pill className={RATING_STYLE[rating]}>
      <span className="tabular-nums">{score}</span> · {RISK_RATING_LABELS[rating]}
    </Pill>
  );
}

const ACTION_STYLE: Record<ActionStatus, string> = { open: AMBER, in_progress: PRIMARY, done: GREEN, cancelled: MUTED };
export const ActionStatusBadge = ({ status }: { status: ActionStatus }) => <Pill className={ACTION_STYLE[status]}>{ACTION_STATUS_LABELS[status]}</Pill>;

export const OverdueBadge = ({ label = "Overdue" }: { label?: string }) => <Pill className={RED}>{label}</Pill>;

const DECISION_STYLE: Record<DecisionStatus, string> = { proposed: AMBER, accepted: GREEN, rejected: RED, superseded: MUTED };
export const DecisionStatusBadge = ({ status }: { status: DecisionStatus }) => <Pill className={DECISION_STYLE[status]}>{DECISION_STATUS_LABELS[status]}</Pill>;

const SEVERITY_STYLE: Record<EscalationSeverity, string> = { medium: AMBER, high: "bg-health-red/10", critical: RED };
export const EscalationSeverityBadge = ({ severity }: { severity: EscalationSeverity }) => (
  <Pill className={SEVERITY_STYLE[severity]}>{ESCALATION_SEVERITY_LABELS[severity]}</Pill>
);

const ESC_STATUS_STYLE: Record<EscalationStatus, string> = { open: AMBER, acknowledged: PRIMARY, resolved: GREEN };
export function EscalationStatusBadge({ status, timing }: { status: EscalationStatus; timing: EscalationTiming }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Pill className={ESC_STATUS_STYLE[status]}>{ESCALATION_STATUS_LABELS[status]}</Pill>
      {timing === "overdue" && <OverdueBadge label="Past deadline" />}
      {timing === "due_soon" && <Pill className={AMBER}>Due within 24 h</Pill>}
    </span>
  );
}

const CHANGE_STYLE: Record<ChangeStatus, string> = { draft: MUTED, submitted: AMBER, approved: GREEN, rejected: RED, implemented: PRIMARY, withdrawn: MUTED };
export const ChangeStatusBadge = ({ status }: { status: ChangeStatus }) => <Pill className={CHANGE_STYLE[status]}>{CHANGE_STATUS_LABELS[status]}</Pill>;

const RELEASE_STYLE: Record<ReleaseStatus, string> = { planned: MUTED, in_review: AMBER, approved: GREEN, released: PRIMARY, cancelled: MUTED };
export const ReleaseStatusBadge = ({ status }: { status: ReleaseStatus }) => <Pill className={RELEASE_STYLE[status]}>{RELEASE_STATUS_LABELS[status]}</Pill>;

const GATE_STYLE: Record<GateStatus, string> = { pending: MUTED, passed: GREEN, failed: RED, waived: AMBER };
export const GateStatusBadge = ({ status }: { status: GateStatus }) => <Pill className={GATE_STYLE[status]}>{GATE_STATUS_LABELS[status]}</Pill>;

const CONTRACT_STYLE: Record<ContractStatus, string> = { draft: MUTED, active: GREEN, expired: MUTED, terminated: RED };
export function ContractStatusBadge({ status, timing }: { status: ContractStatus; timing?: ContractTiming }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Pill className={CONTRACT_STYLE[status]}>{CONTRACT_STATUS_LABELS[status]}</Pill>
      {timing?.kind === "expiring" && <Pill className={AMBER}>Ends in {timing.daysLeft} d</Pill>}
      {timing?.kind === "ended" && <OverdueBadge label="Past end date" />}
    </span>
  );
}

export const VisibilityBadge = ({ visibility }: { visibility: DocumentVisibility }) => (
  <Badge variant={visibility === "client" ? "default" : "outline"}>{DOCUMENT_VISIBILITY_LABELS[visibility]}</Badge>
);
