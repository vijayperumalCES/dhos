"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, CheckCircle2, MoreHorizontal, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { applyServerErrors, FormError, SelectField, TextareaField, TextField, type Option } from "@/components/forms/fields";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { deleteMilestone, saveMilestone, setMilestoneCompleted, takeBaseline } from "@/lib/actions/milestones";
import { NONE } from "@/lib/validation/common";
import { milestoneSchema } from "@/lib/validation/work";

type Values = z.input<typeof milestoneSchema>;
const EMPTY: Values = { name: "", description: "", dueDate: "", ownerId: NONE };

export function MilestoneDialog({
  projectId,
  members,
  milestone,
  open: controlledOpen,
  onOpenChange,
}: {
  projectId: string;
  members: Option[];
  milestone?: { id: string } & Values;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const router = useRouter();
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = controlledOpen ?? uncontrolled;
  const setOpen = onOpenChange ?? setUncontrolled;
  const form = useForm<Values>({ resolver: zodResolver(milestoneSchema) as never, defaultValues: milestone ?? EMPTY });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          form.reset(milestone ?? EMPTY);
          setError(null);
        }
      }}
    >
      {!milestone && (
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus className="size-4" /> Add milestone
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{milestone ? "Edit milestone" : "Add milestone"}</DialogTitle>
          <DialogDescription>Changing a due date doesn&apos;t change the baseline, so slippage stays visible.</DialogDescription>
        </DialogHeader>
        <FormProvider {...form}>
          <form
            noValidate
            onSubmit={form.handleSubmit(() =>
              startTransition(async () => {
                setError(null);
                const r = await saveMilestone(projectId, milestone?.id ?? null, form.getValues());
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
              <TextField name="dueDate" label="Due date" type="date" required />
              <SelectField name="ownerId" label="Owner" options={[{ value: NONE, label: "Unassigned" }, ...members]} />
              <TextareaField name="description" label="Description" rows={2} />
            </FieldGroup>
            <DialogFooter className="mt-4">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save milestone"}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

export function MilestoneActions({
  projectId,
  members,
  milestone,
  today,
}: {
  projectId: string;
  members: Option[];
  milestone: { id: string; completed_on: string | null } & Values;
  today: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${milestone.name}`} disabled={pending}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {milestone.completed_on ? (
            <DropdownMenuItem onSelect={() => run(() => setMilestoneCompleted(projectId, milestone.id, null))}>
              <RotateCcw className="size-4" /> Reopen
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => run(() => setMilestoneCompleted(projectId, milestone.id, today))}>
              <CheckCircle2 className="size-4" /> Mark achieved today
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil className="size-4" /> Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => run(() => deleteMilestone(projectId, milestone.id))}>
            <Trash2 className="size-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {editing && <MilestoneDialog projectId={projectId} members={members} milestone={milestone} open={editing} onOpenChange={setEditing} />}
    </>
  );
}

export function BaselineDialog({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Camera className="size-4" /> Take baseline
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Take a schedule baseline</DialogTitle>
          <DialogDescription>
            Saves the project dates and every milestone&apos;s current due date. From now on, variance is measured
            against this snapshot. Previous baselines stay in the history.
          </DialogDescription>
        </DialogHeader>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="baseline-name">Name</FieldLabel>
          <Input id="baseline-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Re-plan after vendor delay" maxLength={120} />
          {error && <FieldError>{error}</FieldError>}
        </Field>
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const r = await takeBaseline(projectId, name);
                if (r.ok) {
                  toast.success(r.message);
                  setOpen(false);
                  setName("");
                  router.refresh();
                } else setError(r.fieldErrors?._form?.[0] ?? r.error);
              })
            }
          >
            {pending ? "Saving…" : "Save baseline"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
