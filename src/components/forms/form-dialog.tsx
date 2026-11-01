"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Controller, FormProvider, useForm, useFormContext, type FieldValues } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { applyServerErrors, FormError } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import type { ActionResult } from "@/lib/actions/result";
import { cn } from "@/lib/utils";

/**
 * A dialog around a react-hook-form form. The server action re-validates everything; its field
 * errors are copied back onto the form. Controlled (`open`) or self-opening (`trigger`).
 */
export function FormDialog<V extends FieldValues>({
  trigger,
  title,
  description,
  submitLabel = "Save",
  schema,
  defaultValues,
  onSubmit,
  children,
  open: controlledOpen,
  onOpenChange,
  wide,
}: {
  trigger?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  submitLabel?: string;
  schema: z.ZodType;
  defaultValues: V;
  onSubmit: (values: V) => Promise<ActionResult<unknown>>;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  wide?: boolean;
}) {
  const router = useRouter();
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = controlledOpen ?? uncontrolled;
  const setOpen = onOpenChange ?? setUncontrolled;
  const form = useForm<V>({ resolver: zodResolver(schema as never) as never, defaultValues: defaultValues as never });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          form.reset(defaultValues as never);
          setError(null);
        }
      }}
    >
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className={cn("max-h-[90vh] overflow-y-auto", wide ? "sm:max-w-2xl" : "sm:max-w-lg")}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <FormProvider {...form}>
          <form
            noValidate
            onSubmit={form.handleSubmit(() =>
              startTransition(async () => {
                setError(null);
                const r = await onSubmit(form.getValues());
                if (r.ok) {
                  if (r.message) toast.success(r.message);
                  setOpen(false);
                  router.refresh();
                } else setError(applyServerErrors(form, r));
              }),
            )}
          >
            <FieldGroup>
              <FormError message={error} />
              {children}
            </FieldGroup>
            <DialogFooter className="mt-4">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

export function CheckboxField({ name, label, description, className }: { name: string; label: string; description?: string; className?: string }) {
  const id = useId();
  const { control } = useFormContext();
  return (
    <Field orientation="horizontal" className={className}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => <Checkbox id={id} checked={!!field.value} onCheckedChange={(v) => field.onChange(v === true)} onBlur={field.onBlur} />}
      />
      <div className="space-y-0.5">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description && <FieldDescription>{description}</FieldDescription>}
      </div>
    </Field>
  );
}
