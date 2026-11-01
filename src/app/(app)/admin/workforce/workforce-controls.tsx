"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, MoreHorizontal, Pencil, Plus, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";

import { applyServerErrors, FormError, TextField, type Option } from "@/components/forms/fields";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActionResult } from "@/lib/actions/result";
import {
  addHoliday,
  saveCalendar,
  saveLeaveType,
  setLeaveBalance,
  setLeaveTypeArchived,
  setMemberCalendar,
} from "@/lib/actions/workforce-settings";
import { WEEKDAY_LABELS } from "@/lib/domain/workforce";
import { calendarSchema, leaveTypeSchema, type CalendarInput, type LeaveTypeInput } from "@/lib/validation/workforce";

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function run(fn: () => Promise<ActionResult<unknown>>, after?: () => void) {
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(r.message);
        after?.();
        router.refresh();
      } else toast.error(r.error);
    });
  }
  return { pending, run };
}

const EMPTY_CALENDAR: CalendarInput = { name: "", workingDays: [1, 2, 3, 4, 5], hoursPerDay: "8" };

export function CalendarDialog({ calendar }: { calendar?: { id: string } & CalendarInput }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const form = useForm<CalendarInput>({ resolver: zodResolver(calendarSchema) as never, defaultValues: calendar ?? EMPTY_CALENDAR });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          form.reset(calendar ?? EMPTY_CALENDAR);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        {calendar ? (
          <Button size="sm" variant="outline">
            <Pencil className="size-4" /> Edit
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="size-4" /> Add calendar
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{calendar ? "Edit calendar" : "Add calendar"}</DialogTitle>
          <DialogDescription>Changes apply to future leave requests and to capacity. Existing requests keep their day count.</DialogDescription>
        </DialogHeader>
        <FormProvider {...form}>
          <form
            noValidate
            onSubmit={form.handleSubmit(() =>
              startTransition(async () => {
                setError(null);
                const r = await saveCalendar(calendar?.id ?? null, form.getValues());
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
              <Controller
                control={form.control}
                name="workingDays"
                render={({ field, fieldState }) => (
                  <FieldSet>
                    <FieldLegend variant="label">Working days</FieldLegend>
                    <div className="flex flex-wrap gap-3">
                      {WEEKDAY_LABELS.map((label, i) => {
                        const day = i + 1;
                        const checked = field.value.includes(day);
                        return (
                          <Field key={label} orientation="horizontal" className="w-auto">
                            <Checkbox
                              id={`wd-${day}`}
                              checked={checked}
                              onCheckedChange={(v) => field.onChange(v ? [...field.value, day].sort() : field.value.filter((d) => d !== day))}
                            />
                            <FieldLabel htmlFor={`wd-${day}`}>{label}</FieldLabel>
                          </Field>
                        );
                      })}
                    </div>
                    {fieldState.error && <p className="text-sm text-destructive">{fieldState.error.message}</p>}
                  </FieldSet>
                )}
              />
              <TextField name="hoursPerDay" label="Hours per day" inputMode="decimal" required />
            </FieldGroup>
            <DialogFooter className="mt-4">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save calendar"}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

export function HolidayForm({ calendarId }: { calendarId: string }) {
  const { pending, run } = useRun();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        run(
          () => addHoliday({ calendarId, holidayDate: String(data.get("holidayDate") ?? ""), name: String(data.get("name") ?? "") }),
          () => form.reset(),
        );
      }}
    >
      <Input type="date" name="holidayDate" aria-label="Holiday date" className="w-40" required />
      <Input name="name" aria-label="Holiday name" placeholder="Holiday name" className="w-56" maxLength={120} required />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        Add holiday
      </Button>
    </form>
  );
}

const EMPTY_TYPE: LeaveTypeInput = { name: "", code: "", isPaid: true, requiresApproval: true, annualAllowanceDays: "" };

export function LeaveTypeDialog({
  leaveType,
  open: controlledOpen,
  onOpenChange,
}: {
  leaveType?: { id: string } & LeaveTypeInput;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const router = useRouter();
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = controlledOpen ?? uncontrolled;
  const setOpen = onOpenChange ?? setUncontrolled;
  const form = useForm<LeaveTypeInput>({ resolver: zodResolver(leaveTypeSchema) as never, defaultValues: leaveType ?? EMPTY_TYPE });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          form.reset(leaveType ?? EMPTY_TYPE);
          setError(null);
        }
      }}
    >
      {!leaveType && (
        <DialogTrigger asChild>
          <Button size="sm">
            <Plus className="size-4" /> Add leave type
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{leaveType ? "Edit leave type" : "Add leave type"}</DialogTitle>
          <DialogDescription>Changing the allowance affects future grants, not balances already granted.</DialogDescription>
        </DialogHeader>
        <FormProvider {...form}>
          <form
            noValidate
            onSubmit={form.handleSubmit(() =>
              startTransition(async () => {
                setError(null);
                const r = await saveLeaveType(leaveType?.id ?? null, form.getValues());
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
              <div className="grid grid-cols-3 gap-3">
                <TextField name="name" label="Name" required className="col-span-2" />
                <TextField name="code" label="Code" required disabled={!!leaveType} />
              </div>
              <TextField name="annualAllowanceDays" label="Days per year" description="Leave empty to record without a limit." inputMode="decimal" />
              {(["isPaid", "requiresApproval"] as const).map((name) => (
                <Controller
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <Field orientation="horizontal">
                      <Checkbox id={`lt-${name}`} checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                      <FieldLabel htmlFor={`lt-${name}`}>{name === "isPaid" ? "Paid leave" : "Needs manager approval"}</FieldLabel>
                    </Field>
                  )}
                />
              ))}
            </FieldGroup>
            <DialogFooter className="mt-4">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save leave type"}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

export function LeaveTypeActions({ leaveType, archived }: { leaveType: { id: string } & LeaveTypeInput; archived: boolean }) {
  const [editing, setEditing] = useState(false);
  const { pending, run } = useRun();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${leaveType.name}`} disabled={pending}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!archived && (
            <DropdownMenuItem onSelect={() => setEditing(true)}>
              <Pencil className="size-4" /> Edit
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => run(() => setLeaveTypeArchived(leaveType.id, !archived))}>
            {archived ? <RotateCcw className="size-4" /> : <Archive className="size-4" />} {archived ? "Restore" : "Archive"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {editing && <LeaveTypeDialog leaveType={leaveType} open={editing} onOpenChange={setEditing} />}
    </>
  );
}

/** Click-to-edit granted days for one person, type and year. */
export function BalanceEditor({
  membershipId,
  leaveTypeId,
  year,
  granted,
  label,
}: {
  membershipId: string;
  leaveTypeId: string;
  year: number;
  granted: number | null;
  label: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(granted === null ? "" : String(granted));
  const { pending, run } = useRun();

  if (!editing) {
    return (
      <button
        type="button"
        className="rounded px-1.5 py-0.5 tabular-nums hover:bg-muted"
        aria-label={`Edit ${label}`}
        onClick={() => {
          setValue(granted === null ? "" : String(granted));
          setEditing(true);
        }}
      >
        {granted === null ? <span className="text-muted-foreground">—</span> : granted}
      </button>
    );
  }
  return (
    <form
      className="inline-flex justify-end gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => setLeaveBalance({ membershipId, leaveTypeId, year, days: value }), () => setEditing(false));
      }}
    >
      <Input
        autoFocus
        aria-label={label}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
        inputMode="decimal"
        className="h-7 w-16 text-right"
      />
      <Button type="submit" size="sm" variant="outline" className="h-7" disabled={pending}>
        Save
      </Button>
    </form>
  );
}

export function MemberCalendarSelect({ membershipId, value, options }: { membershipId: string; value: string; options: Option[] }) {
  const { pending, run } = useRun();
  return (
    <Select
      value={value}
      disabled={pending}
      onValueChange={(v) => run(() => setMemberCalendar(membershipId, v === "default" ? null : v))}
    >
      <SelectTrigger className="h-8 w-56" aria-label="Work calendar">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
