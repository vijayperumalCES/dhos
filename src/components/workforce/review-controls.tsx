"use client";

import { Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { reviewCorrection } from "@/lib/actions/attendance";
import { reviewLeave } from "@/lib/actions/leave";
import type { ActionResult } from "@/lib/actions/result";
import { reviewTimesheet } from "@/lib/actions/timesheets";

const ACTIONS: Record<string, (id: string, input: unknown) => Promise<ActionResult>> = {
  leave: reviewLeave,
  correction: reviewCorrection,
  timesheet: reviewTimesheet,
};

/**
 * Approve in one click; reject (or "return" for timesheets) asks for a reason, which the
 * database also requires. The server decides whether the caller may review at all.
 */
export function ReviewControls({ kind, id, subject }: { kind: keyof typeof ACTIONS; id: string; subject: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const rejectLabel = kind === "timesheet" ? "Return" : "Reject";

  function submit(approve: boolean) {
    startTransition(async () => {
      setError(null);
      const r = await ACTIONS[kind](id, { approve, note: approve ? "" : note });
      if (r.ok) {
        toast.success(r.message);
        setOpen(false);
        setNote("");
        router.refresh();
      } else if (approve) toast.error(r.error);
      else setError(r.fieldErrors?.note?.[0] ?? r.error);
    });
  }

  return (
    <div className="flex justify-end gap-1.5">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => submit(true)} aria-label={`Approve ${subject}`}>
        <Check className="size-4" /> Approve
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setOpen(true)} aria-label={`${rejectLabel} ${subject}`}>
        <X className="size-4" /> {rejectLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {rejectLabel} {subject}
            </DialogTitle>
            <DialogDescription>The requester sees this reason.</DialogDescription>
          </DialogHeader>
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor={`review-note-${id}`}>Reason</FieldLabel>
            <Textarea id={`review-note-${id}`} rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <DialogFooter>
            <Button variant="destructive" disabled={pending} onClick={() => submit(false)}>
              {pending ? "Saving…" : rejectLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Generic one-click action button with toast feedback (cancel, withdraw, submit, recall…). */
export function ActionButton({
  action,
  label,
  pendingLabel,
  variant = "outline",
  confirm,
}: {
  action: () => Promise<ActionResult<unknown>>;
  label: string;
  pendingLabel?: string;
  variant?: "default" | "outline" | "ghost" | "destructive";
  confirm?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant={variant}
      disabled={pending}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        startTransition(async () => {
          const r = await action();
          if (r.ok) {
            toast.success(r.message);
            router.refresh();
          } else toast.error(r.error);
        });
      }}
    >
      {pending ? (pendingLabel ?? "Working…") : label}
    </Button>
  );
}
