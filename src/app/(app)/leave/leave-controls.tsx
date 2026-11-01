"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, FormProvider, useForm, useFormState } from "react-hook-form";
import { toast } from "sonner";

import { applyServerErrors, FormError, SelectField, TextareaField, TextField, type Option } from "@/components/forms/fields";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { requestLeave } from "@/lib/actions/leave";
import { leaveRequestSchema, type LeaveRequestInput } from "@/lib/validation/workforce";

function HalfDayError() {
  const { errors } = useFormState<LeaveRequestInput>({ name: "halfDay", exact: true });
  return errors.halfDay ? <p className="text-sm text-destructive">{errors.halfDay.message}</p> : null;
}

export function LeaveRequestDialog({ today, types }: { today: string; types: Option[] }) {
  const router = useRouter();
  const empty: LeaveRequestInput = { leaveTypeId: types[0]?.value ?? "", startDate: today, endDate: today, halfDay: false, reason: "" };
  const [open, setOpen] = useState(false);
  const form = useForm<LeaveRequestInput>({ resolver: zodResolver(leaveRequestSchema) as never, defaultValues: empty });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          form.reset(empty);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" disabled={types.length === 0}>
          <Plus className="size-4" /> Request leave
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request leave</DialogTitle>
          <DialogDescription>Weekends and holidays on your calendar aren&apos;t counted.</DialogDescription>
        </DialogHeader>
        <FormProvider {...form}>
          <form
            noValidate
            onSubmit={form.handleSubmit(() =>
              startTransition(async () => {
                setError(null);
                const r = await requestLeave(form.getValues());
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
              <SelectField name="leaveTypeId" label="Type" options={types} required />
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  name="startDate"
                  label="From"
                  type="date"
                  required
                  onChange={(e) => {
                    if (form.getValues("endDate") < e.target.value) form.setValue("endDate", e.target.value);
                  }}
                />
                <TextField name="endDate" label="To" type="date" required />
              </div>
              <Controller
                control={form.control}
                name="halfDay"
                render={({ field }) => (
                  <Field orientation="horizontal">
                    <Checkbox id="leave-half-day" checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                    <FieldLabel htmlFor="leave-half-day">Half day (one date only)</FieldLabel>
                  </Field>
                )}
              />
              <HalfDayError />
              <TextareaField name="reason" label="Note for your manager" rows={2} />
            </FieldGroup>
            <DialogFooter className="mt-4">
              <Button type="submit" disabled={pending}>
                {pending ? "Sending…" : "Send request"}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
