"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";

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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FieldGroup } from "@/components/ui/field";
import { deleteAllocation, saveAllocation } from "@/lib/actions/resources";
import { allocationSchema, type AllocationInput } from "@/lib/validation/workforce";

export function AllocationDialog({
  members,
  projects,
  defaultRange,
  allocation,
  open: controlledOpen,
  onOpenChange,
}: {
  members: Option[];
  projects: Option[];
  defaultRange?: { from: string; to: string };
  allocation?: { id: string } & AllocationInput;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const router = useRouter();
  const empty: AllocationInput = {
    membershipId: "",
    projectId: "",
    startDate: defaultRange?.from ?? "",
    endDate: defaultRange?.to ?? "",
    percent: "50",
    role: "",
    notes: "",
  };
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = controlledOpen ?? uncontrolled;
  const setOpen = onOpenChange ?? setUncontrolled;
  const form = useForm<AllocationInput>({ resolver: zodResolver(allocationSchema) as never, defaultValues: allocation ?? empty });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          form.reset(allocation ?? empty);
          setError(null);
        }
      }}
    >
      {!allocation && (
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus className="size-4" /> Allocate
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{allocation ? "Edit allocation" : "Allocate a person"}</DialogTitle>
          <DialogDescription>Overlapping allocations above 100% are allowed but flagged as over-allocation.</DialogDescription>
        </DialogHeader>
        <FormProvider {...form}>
          <form
            noValidate
            onSubmit={form.handleSubmit(() =>
              startTransition(async () => {
                setError(null);
                const r = await saveAllocation(allocation?.id ?? null, form.getValues());
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
              {!allocation && (
                <>
                  <SelectField name="membershipId" label="Person" options={members} required />
                  <SelectField name="projectId" label="Project" options={projects} required />
                </>
              )}
              <div className="grid grid-cols-2 gap-3">
                <TextField name="startDate" label="From" type="date" required />
                <TextField name="endDate" label="To" type="date" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <TextField name="percent" label="Share of time (%)" inputMode="numeric" required />
                <TextField name="role" label="Role" placeholder="e.g. Tech lead" />
              </div>
              <TextareaField name="notes" label="Notes" rows={2} />
            </FieldGroup>
            <DialogFooter className="mt-4">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save allocation"}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

export function AllocationActions({ members, projects, allocation }: { members: Option[]; projects: Option[]; allocation: { id: string } & AllocationInput }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Allocation actions" disabled={pending}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil className="size-4" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() =>
              startTransition(async () => {
                const r = await deleteAllocation(allocation.id);
                if (r.ok) {
                  toast.success(r.message);
                  router.refresh();
                } else toast.error(r.error);
              })
            }
          >
            <Trash2 className="size-4" /> Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {editing && <AllocationDialog members={members} projects={projects} allocation={allocation} open={editing} onOpenChange={setEditing} />}
    </>
  );
}
