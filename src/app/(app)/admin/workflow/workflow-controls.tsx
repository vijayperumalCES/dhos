"use client";

import { Archive, ArrowDown, ArrowUp, Pencil, Plus, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActionResult } from "@/lib/actions/result";
import { archiveWorkflowState, moveWorkflowState, saveWorkflowState, setDefaultWorkflowState, setTransitionAllowed } from "@/lib/actions/workflow";
import { CATEGORY_LABELS, type WorkflowCategory } from "@/lib/domain/work";

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return {
    pending,
    run: (fn: () => Promise<ActionResult>) =>
      startTransition(async () => {
        const r = await fn();
        if (r.ok) {
          if (r.message) toast.success(r.message);
          router.refresh();
        } else toast.error(r.error);
      }),
  };
}

type StateValues = { name: string; category: WorkflowCategory; wipLimit: string };

export function StateDialog({ state }: { state?: { id: string } & StateValues }) {
  const router = useRouter();
  const empty: StateValues = { name: "", category: "in_progress", wipLimit: "" };
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<StateValues>(state ?? empty);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setValues(state ?? empty);
          setErrors({});
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        {state ? (
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Edit ${state.name}`}>
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="size-4" /> Add state
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{state ? `Edit ${state.name}` : "Add workflow state"}</DialogTitle>
          <DialogDescription>The category decides how the state counts in reports: not started, in progress or done.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="state-name">Name</FieldLabel>
            <Input id="state-name" value={values.name} maxLength={40} onChange={(e) => setValues({ ...values, name: e.target.value })} />
            {errors.name && <FieldError>{errors.name[0]}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor="state-category">Category</FieldLabel>
            <Select value={values.category} onValueChange={(v) => setValues({ ...values, category: v as WorkflowCategory })}>
              <SelectTrigger id="state-category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CATEGORY_LABELS) as WorkflowCategory[]).map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>Items entering a “Done” state are stamped as completed; leaving it clears the stamp.</FieldDescription>
          </Field>
          <Field data-invalid={!!errors.wipLimit}>
            <FieldLabel htmlFor="state-wip">Work-in-progress limit (optional)</FieldLabel>
            <Input id="state-wip" inputMode="numeric" value={values.wipLimit} onChange={(e) => setValues({ ...values, wipLimit: e.target.value })} />
            {errors.wipLimit ? <FieldError>{errors.wipLimit[0]}</FieldError> : <FieldDescription>Board columns over the limit are highlighted.</FieldDescription>}
          </Field>
          {error && Object.keys(errors).length === 0 && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setErrors({});
                setError(null);
                const r = await saveWorkflowState(state?.id ?? null, values);
                if (r.ok) {
                  toast.success(r.message);
                  setOpen(false);
                  router.refresh();
                } else {
                  setErrors(r.fieldErrors ?? {});
                  setError(r.error);
                }
              })
            }
          >
            {pending ? "Saving…" : "Save state"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StateRowActions({ id, name, isDefault, first, last }: { id: string; name: string; isDefault: boolean; first: boolean; last: boolean }) {
  const { pending, run } = useRun();
  return (
    <div className="flex items-center gap-0.5">
      <Button variant="ghost" size="icon" className="size-8" aria-label={`Move ${name} up`} disabled={pending || first} onClick={() => run(() => moveWorkflowState(id, "up"))}>
        <ArrowUp className="size-4" />
      </Button>
      <Button variant="ghost" size="icon" className="size-8" aria-label={`Move ${name} down`} disabled={pending || last} onClick={() => run(() => moveWorkflowState(id, "down"))}>
        <ArrowDown className="size-4" />
      </Button>
      {!isDefault && (
        <>
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Make ${name} the default`} disabled={pending} onClick={() => run(() => setDefaultWorkflowState(id))}>
            <Star className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Archive ${name}`} disabled={pending} onClick={() => run(() => archiveWorkflowState(id))}>
            <Archive className="size-4" />
          </Button>
        </>
      )}
    </div>
  );
}

export function TransitionToggle({ fromId, toId, fromName, toName, allowed }: { fromId: string; toId: string; fromName: string; toName: string; allowed: boolean }) {
  const { pending, run } = useRun();
  return (
    <Checkbox
      checked={allowed}
      disabled={pending}
      aria-label={`Allow ${fromName} to ${toName}`}
      onCheckedChange={(c) => run(() => setTransitionAllowed(fromId, toId, c === true))}
    />
  );
}
