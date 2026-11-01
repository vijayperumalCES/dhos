"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/actions/result";

/** Asks for a short note (a reason, a resolution) before running an action. */
export function NoteDialog({
  open,
  onOpenChange,
  title,
  description,
  label = "Note",
  required = true,
  submitLabel = "Confirm",
  destructive,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  label?: string;
  required?: boolean;
  submitLabel?: string;
  destructive?: boolean;
  onSubmit: (note: string) => Promise<ActionResult<unknown>>;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) {
          setNote("");
          setError(null);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="note-dialog-text">
            {label}
            {required && (
              <span className="text-destructive" aria-hidden>
                *
              </span>
            )}
          </FieldLabel>
          <Textarea id="note-dialog-text" rows={3} value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={!!error} aria-required={required} />
          {error && <FieldError>{error}</FieldError>}
        </Field>
        <DialogFooter>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={() => {
              if (required && !note.trim()) {
                setError(`${label} is required.`);
                return;
              }
              startTransition(async () => {
                setError(null);
                const r = await onSubmit(note.trim());
                if (r.ok) {
                  if (r.message) toast.success(r.message);
                  onOpenChange(false);
                  router.refresh();
                } else setError(r.fieldErrors?.note?.[0] ?? r.error);
              });
            }}
          >
            {pending ? "Saving…" : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
