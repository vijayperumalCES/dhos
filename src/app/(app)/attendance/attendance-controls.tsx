"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, House, LogOut, PenLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";

import { applyServerErrors, FormError, SelectField, TextareaField, TextField } from "@/components/forms/fields";
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
import { checkIn, checkOut, requestCorrection } from "@/lib/actions/attendance";
import type { ActionResult } from "@/lib/actions/result";
import { WORK_MODE_LABELS, WORK_MODES } from "@/lib/domain/workforce";
import { correctionSchema, type CorrectionInput } from "@/lib/validation/workforce";

export function TodayControls({ state }: { state: "out" | "in" | "done" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<ActionResult>) {
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  if (state === "done") return <p className="text-sm text-muted-foreground">Done for today. Request a correction if a time is wrong.</p>;
  if (state === "in") {
    return (
      <Button disabled={pending} onClick={() => run(checkOut)}>
        <LogOut className="size-4" /> {pending ? "Checking out…" : "Check out"}
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button disabled={pending} onClick={() => run(() => checkIn("office", ""))}>
        <Building2 className="size-4" /> Check in at office
      </Button>
      <Button variant="outline" disabled={pending} onClick={() => run(() => checkIn("remote", ""))}>
        <House className="size-4" /> Check in remotely
      </Button>
    </div>
  );
}

export function CorrectionDialog({ today }: { today: string }) {
  const router = useRouter();
  const empty: CorrectionInput = { workDate: today, checkIn: "09:00", checkOut: "18:00", workMode: "office", reason: "" };
  const [open, setOpen] = useState(false);
  const form = useForm<CorrectionInput>({ resolver: zodResolver(correctionSchema) as never, defaultValues: empty });
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
        <Button size="sm" variant="outline">
          <PenLine className="size-4" /> Request correction
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request an attendance correction</DialogTitle>
          <DialogDescription>For a missed or wrong check-in. Your manager approves it; the original record is kept in the audit log.</DialogDescription>
        </DialogHeader>
        <FormProvider {...form}>
          <form
            noValidate
            onSubmit={form.handleSubmit(() =>
              startTransition(async () => {
                setError(null);
                const r = await requestCorrection(form.getValues());
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
              <TextField name="workDate" label="Date" type="date" max={today} required />
              <div className="grid grid-cols-2 gap-3">
                <TextField name="checkIn" label="Check-in" type="time" required />
                <TextField name="checkOut" label="Check-out" type="time" required />
              </div>
              <SelectField name="workMode" label="Worked from" options={WORK_MODES.map((m) => ({ value: m, label: WORK_MODE_LABELS[m] }))} />
              <TextareaField name="reason" label="Reason" rows={2} required />
            </FieldGroup>
            <DialogFooter className="mt-4">
              <Button type="submit" disabled={pending}>
                {pending ? "Sending…" : "Send for approval"}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
