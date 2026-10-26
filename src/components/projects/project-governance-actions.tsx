"use client";

import { Activity, Archive, ArchiveRestore, ArrowRightLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { setProjectArchived, setProjectHealth, transitionProjectStatus } from "@/lib/actions/projects";
import type { ActionResult } from "@/lib/actions/result";
import {
  allowedTransitions,
  HEALTH_LABELS,
  HEALTHS_REQUIRING_REASON,
  PROJECT_HEALTHS,
  STATUS_LABELS,
  STATUSES_REQUIRING_REASON,
  type ProjectHealth,
  type ProjectStatus,
} from "@/lib/domain/project-lifecycle";

type Props = {
  projectId: string;
  status: ProjectStatus;
  health: ProjectHealth;
  archived: boolean;
  canChangeStatus: boolean;
  canArchive: boolean;
};

export function ProjectGovernanceActions(props: Props) {
  const { canChangeStatus, canArchive, archived } = props;
  return (
    <>
      {canChangeStatus && !archived && <StatusDialog {...props} />}
      {canChangeStatus && !archived && <HealthDialog {...props} />}
      {canArchive && <ArchiveButton projectId={props.projectId} archived={archived} />}
    </>
  );
}

function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  function run(fn: () => Promise<ActionResult>, onDone: () => void) {
    startTransition(async () => {
      setError(null);
      setFieldError(null);
      const result = await fn();
      if (result.ok) {
        toast.success(result.message);
        onDone();
        router.refresh();
      } else {
        setError(result.error);
        setFieldError(result.fieldErrors?.reason?.[0] ?? null);
      }
    });
  }
  return { pending, error, fieldError, run, reset: () => {
      setError(null);
      setFieldError(null);
    },
  };
}

function StatusDialog({ projectId, status }: Props) {
  const options = allowedTransitions(status);
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState<ProjectStatus | "">("");
  const [reason, setReason] = useState("");
  const { pending, error, fieldError, run, reset } = useAction();
  const needsReason = to !== "" && STATUSES_REQUIRING_REASON.includes(to);

  if (options.length === 0) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setTo("");
          setReason("");
          reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ArrowRightLeft className="size-4" /> Change status
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change lifecycle status</DialogTitle>
          <DialogDescription>
            Currently <strong>{STATUS_LABELS[status]}</strong>. Only valid next stages are offered; the change is recorded
            in the status history and audit log.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field>
            <FieldLabel htmlFor="to-status">New status</FieldLabel>
            <Select value={to} onValueChange={(v) => setTo(v as ProjectStatus)}>
              <SelectTrigger id="to-status" className="w-full">
                <SelectValue placeholder="Choose a status" />
              </SelectTrigger>
              <SelectContent>
                {options.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(to === "completed" || to === "cancelled") && (
              <FieldDescription>This is a final stage and cannot be reversed.</FieldDescription>
            )}
          </Field>
          <Field data-invalid={!!fieldError}>
            <FieldLabel htmlFor="status-reason">
              Reason {needsReason ? <span className="text-destructive">*</span> : <span className="text-muted-foreground">(optional)</span>}
            </FieldLabel>
            <Textarea id="status-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000} />
            {fieldError && <FieldError>{fieldError}</FieldError>}
          </Field>
          {error && !fieldError && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            disabled={pending || to === ""}
            onClick={() => run(() => transitionProjectStatus({ projectId, toStatus: to, reason }), () => setOpen(false))}
          >
            {pending ? "Saving…" : "Change status"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HealthDialog({ projectId, health }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<ProjectHealth>(health === "not_assessed" ? "green" : health);
  const [reason, setReason] = useState("");
  const { pending, error, fieldError, run, reset } = useAction();
  const needsReason = HEALTHS_REQUIRING_REASON.includes(value);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setReason("");
          reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Activity className="size-4" /> Update health
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update project health</DialogTitle>
          <DialogDescription>
            Record your current RAG assessment. Saving the same rating confirms it is still accurate and resets its age
            on the Command Center.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field>
            <FieldLabel htmlFor="health">Health</FieldLabel>
            <Select value={value} onValueChange={(v) => setValue(v as ProjectHealth)}>
              <SelectTrigger id="health" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_HEALTHS.map((h) => (
                  <SelectItem key={h} value={h}>
                    {HEALTH_LABELS[h]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field data-invalid={!!fieldError}>
            <FieldLabel htmlFor="health-reason">
              Reason {needsReason ? <span className="text-destructive">*</span> : <span className="text-muted-foreground">(optional)</span>}
            </FieldLabel>
            <Textarea
              id="health-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder={needsReason ? "What is at risk, and what is being done about it?" : undefined}
            />
            {fieldError && <FieldError>{fieldError}</FieldError>}
          </Field>
          {error && !fieldError && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button disabled={pending} onClick={() => run(() => setProjectHealth({ projectId, health: value, reason }), () => setOpen(false))}>
            {pending ? "Saving…" : "Save health"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ArchiveButton({ projectId, archived }: { projectId: string; archived: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const result = await setProjectArchived(projectId, !archived);
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else toast.error(result.error);
    });
  }

  if (archived) {
    return (
      <Button variant="outline" size="sm" onClick={toggle} disabled={pending}>
        <ArchiveRestore className="size-4" /> Restore
      </Button>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending}>
          <Archive className="size-4" /> Archive
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive this project?</AlertDialogTitle>
          <AlertDialogDescription>
            Archived projects are hidden from lists and excluded from Command Center metrics. Nothing is deleted: its
            history and audit trail are kept, and it can be restored at any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={toggle}>Archive project</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
