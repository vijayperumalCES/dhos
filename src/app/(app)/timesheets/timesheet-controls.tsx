"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { applyServerErrors, FormError, SelectField, TextField, type Option } from "@/components/forms/fields";
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
import { deleteTimeEntry, saveTimeEntry } from "@/lib/actions/timesheets";
import type { TimeEntryRow } from "@/lib/data/workforce";
import { TIME_CATEGORIES, TIME_CATEGORY_LABELS, WEEKDAY_LABELS, weekDates } from "@/lib/domain/workforce";
import { NONE } from "@/lib/validation/common";
import { timeEntrySchema, type TimeEntryInput } from "@/lib/validation/workforce";

type WorkItemOption = Option & { projectId: string };

function WorkFields({ weekStart, projects, workItems }: { weekStart: string; projects: Option[]; workItems: WorkItemOption[] }) {
  const category = useWatch<TimeEntryInput>({ name: "category" });
  const projectId = useWatch<TimeEntryInput>({ name: "projectId" });
  const days = weekDates(weekStart).map((d, i) => ({ value: d, label: `${WEEKDAY_LABELS[i]} ${d.slice(5).replace("-", "/")}` }));
  const items = workItems.filter((w) => w.projectId === projectId);
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <SelectField name="entryDate" label="Day" options={days} required />
        <TextField name="hours" label="Hours" inputMode="decimal" placeholder="e.g. 7.5" required />
      </div>
      <SelectField name="category" label="Category" options={TIME_CATEGORIES.map((c) => ({ value: c, label: TIME_CATEGORY_LABELS[c] }))} />
      {category === "delivery" && (
        <>
          <SelectField name="projectId" label="Project" options={projects} required />
          {items.length > 0 && (
            <SelectField name="workItemId" label="Work item" options={[{ value: NONE, label: "Whole project" }, ...items]} />
          )}
        </>
      )}
      <TextField name="note" label="Note" />
    </>
  );
}

export function TimeEntryDialog({
  weekStart,
  defaultDate,
  projects,
  workItems,
  entry,
  open: controlledOpen,
  onOpenChange,
}: {
  weekStart: string;
  defaultDate?: string;
  projects: Option[];
  workItems: WorkItemOption[];
  entry?: { id: string } & TimeEntryInput;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const router = useRouter();
  const empty: TimeEntryInput = {
    entryDate: defaultDate ?? weekStart,
    category: "delivery",
    projectId: projects[0]?.value ?? NONE,
    workItemId: NONE,
    hours: "",
    note: "",
  };
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = controlledOpen ?? uncontrolled;
  const setOpen = onOpenChange ?? setUncontrolled;
  const form = useForm<TimeEntryInput>({ resolver: zodResolver(timeEntrySchema) as never, defaultValues: entry ?? empty });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          form.reset(entry ?? empty);
          setError(null);
        }
      }}
    >
      {!entry && (
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <Plus className="size-4" /> Log time
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{entry ? "Edit time entry" : "Log time"}</DialogTitle>
          <DialogDescription>Project work needs a project. Internal, training and pre-sales time doesn&apos;t.</DialogDescription>
        </DialogHeader>
        <FormProvider {...form}>
          <form
            noValidate
            onSubmit={form.handleSubmit(() =>
              startTransition(async () => {
                setError(null);
                const r = await saveTimeEntry(weekStart, entry?.id ?? null, form.getValues());
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
              <WorkFields weekStart={weekStart} projects={projects} workItems={workItems} />
            </FieldGroup>
            <DialogFooter className="mt-4">
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

/** Individual entries of an editable week, each with edit and delete. */
export function EntryList({
  weekStart,
  entries,
  projects,
  workItems,
}: {
  weekStart: string;
  entries: TimeEntryRow[];
  projects: Option[];
  workItems: WorkItemOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<TimeEntryRow | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="border-t px-6 pb-4">
      <p className="pt-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Entries</p>
      <ul className="divide-y text-sm">
        {entries.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-2 py-1.5">
            <span className="min-w-0 truncate">
              <span className="tabular-nums text-muted-foreground">{e.entry_date.slice(5).replace("-", "/")}</span>{" "}
              <span className="font-medium tabular-nums">{e.hours} h</span> ·{" "}
              {e.category === "delivery" ? (e.work_item ? `${e.work_item.key} ${e.work_item.title}` : (e.project?.code ?? "Project")) : TIME_CATEGORY_LABELS[e.category]}
              {e.note && <span className="text-muted-foreground"> — {e.note}</span>}
            </span>
            <span className="flex shrink-0">
              <Button size="icon" variant="ghost" aria-label="Edit entry" onClick={() => setEditing(e)}>
                <Pencil className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Delete entry"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const r = await deleteTimeEntry(e.id);
                    if (r.ok) {
                      toast.success(r.message);
                      router.refresh();
                    } else toast.error(r.error);
                  })
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </span>
          </li>
        ))}
      </ul>
      {editing && (
        <TimeEntryDialog
          key={editing.id}
          weekStart={weekStart}
          projects={projects}
          workItems={workItems}
          open
          onOpenChange={(o) => !o && setEditing(null)}
          entry={{
            id: editing.id,
            entryDate: editing.entry_date,
            category: editing.category,
            projectId: editing.project_id ?? NONE,
            workItemId: editing.work_item_id ?? NONE,
            hours: String(editing.hours),
            note: editing.note ?? "",
          }}
        />
      )}
    </div>
  );
}
