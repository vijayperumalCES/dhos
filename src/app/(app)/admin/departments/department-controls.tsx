"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
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
import { FieldGroup } from "@/components/ui/field";
import { saveDepartment, setDepartmentArchived } from "@/lib/actions/people";
import { NONE } from "@/lib/validation/common";
import { departmentFormSchema, type DepartmentFormInput } from "@/lib/validation/organization";

const EMPTY: DepartmentFormInput = { name: "", code: "", description: "", headMembershipId: NONE };

export function DepartmentDialog({
  department,
  members,
}: {
  department?: { id: string } & DepartmentFormInput;
  members: Option[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const form = useForm<DepartmentFormInput>({ resolver: zodResolver(departmentFormSchema) as never, defaultValues: department ?? EMPTY });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          form.reset(department ?? EMPTY);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        {department ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${department.name}`}>
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="size-4" /> New department
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{department ? `Edit ${department.name}` : "New department"}</DialogTitle>
          <DialogDescription>Departments group people for reporting. They don&apos;t grant any access.</DialogDescription>
        </DialogHeader>
        <FormProvider {...form}>
          <form
            noValidate
            onSubmit={form.handleSubmit(() =>
              startTransition(async () => {
                setError(null);
                const result = await saveDepartment(department?.id ?? null, form.getValues());
                if (result.ok) {
                  toast.success(result.message);
                  setOpen(false);
                  router.refresh();
                } else setError(applyServerErrors(form, result));
              }),
            )}
          >
            <FieldGroup>
              <FormError message={error} />
              <TextField name="name" label="Name" required />
              <TextField name="code" label="Code" placeholder="ENG" />
              <SelectField name="headMembershipId" label="Head of department" options={[{ value: NONE, label: "None" }, ...members]} />
              <TextareaField name="description" label="Description" rows={2} />
            </FieldGroup>
            <DialogFooter className="mt-4">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : department ? "Save" : "Create department"}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

export function DepartmentArchiveButton({ id, name, archived }: { id: string; name: string; archived: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const Icon = archived ? ArchiveRestore : Archive;
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={archived ? `Restore ${name}` : `Archive ${name}`}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await setDepartmentArchived(id, !archived);
          if (r.ok) {
            toast.success(r.message);
            router.refresh();
          } else toast.error(r.error);
        })
      }
    >
      <Icon className="size-4" />
    </Button>
  );
}
