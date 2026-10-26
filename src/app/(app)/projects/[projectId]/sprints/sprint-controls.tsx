"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCheck, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { applyServerErrors, FormError, TextareaField, TextField } from "@/components/forms/fields";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { completeSprint, deleteSprint, saveSprint, startSprint } from "@/lib/actions/sprints";
import { NONE } from "@/lib/validation/common";
import { sprintSchema } from "@/lib/validation/work";

type Values = z.input<typeof sprintSchema>;

export function SprintDialog({ projectId, sprint, suggested }: { projectId: string; sprint?: { id: string } & Values; suggested?: Values }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const initial = sprint ?? suggested ?? { name: "", goal: "", startDate: "", endDate: "" };
  const form = useForm<Values>({ resolver: zodResolver(sprintSchema) as never, defaultValues: initial });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          form.reset(initial);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        {sprint ? (
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Edit ${sprint.name}`}>
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="size-4" /> Plan sprint
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{sprint ? `Edit ${sprint.name}` : "Plan a sprint"}</DialogTitle>
          <DialogDescription>Add work to the sprint from the backlog. The commitment is recorded when you start it.</DialogDescription>
        </DialogHeader>
        <FormProvider {...form}>
          <form
            noValidate
            onSubmit={form.handleSubmit(() =>
              startTransition(async () => {
                setError(null);
                const r = await saveSprint(projectId, sprint?.id ?? null, form.getValues());
                if (r.ok) {
                  toast.success(r.message);
                  setOpen(false);
                  router.refresh();
                } else setError(applyServerErrors(form, r));
              }),
            )}
          >
            <FieldGroup>
              <FormError message={error} />
              <TextField name="name" label="Name" required />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField name="startDate" label="Start" type="date" required />
                <TextField name="endDate" label="End" type="date" required />
              </div>
              <TextareaField name="goal" label="Sprint goal" rows={2} />
            </FieldGroup>
            <DialogFooter className="mt-4">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save sprint"}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return {
    pending,
    run: (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, after?: () => void) =>
      startTransition(async () => {
        const r = await fn();
        if (r.ok) {
          toast.success(r.message);
          after?.();
          router.refresh();
        } else toast.error(r.error);
      }),
  };
}

export function StartSprintButton({ projectId, sprintId, disabledReason }: { projectId: string; sprintId: string; disabledReason?: string }) {
  const { pending, run } = useRun();
  return (
    <Button size="sm" disabled={pending || !!disabledReason} title={disabledReason} onClick={() => run(() => startSprint(projectId, sprintId))}>
      <Play className="size-4" /> Start sprint
    </Button>
  );
}

export function DeleteSprintButton({ projectId, sprintId, name }: { projectId: string; sprintId: string; name: string }) {
  const { pending, run } = useRun();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label={`Delete ${name}`} disabled={pending}>
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>Its items go back to the backlog. The audit log keeps a record.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => run(() => deleteSprint(projectId, sprintId))}>Delete sprint</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function CompleteSprintDialog({
  projectId,
  sprintId,
  unfinished,
  targets,
}: {
  projectId: string;
  sprintId: string;
  unfinished: number;
  targets: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [moveTo, setMoveTo] = useState(targets[0]?.id ?? NONE);
  const { pending, run } = useRun();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <CheckCheck className="size-4" /> Complete sprint
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Complete the sprint</DialogTitle>
          <DialogDescription>
            Completed points are recorded for velocity. {unfinished === 0 ? "Every item is done." : `${unfinished} unfinished item${unfinished === 1 ? "" : "s"} will move.`}
          </DialogDescription>
        </DialogHeader>
        {unfinished > 0 && (
          <Field>
            <FieldLabel htmlFor="move-to">Move unfinished items to</FieldLabel>
            <Select value={moveTo} onValueChange={setMoveTo}>
              <SelectTrigger id="move-to" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Backlog</SelectItem>
                {targets.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <DialogFooter>
          <Button disabled={pending} onClick={() => run(() => completeSprint(projectId, sprintId, moveTo), () => setOpen(false))}>
            {pending ? "Completing…" : "Complete sprint"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
