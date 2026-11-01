"use client";

import { CheckCircle2, Pencil, PlayCircle, Plus, Rocket, Trash2, Undo2, XCircle } from "lucide-react";
import { useState } from "react";

import { NoteDialog } from "@/components/common/note-dialog";
import { RowActions } from "@/components/common/row-actions";
import { SelectField, TextareaField, TextField, type Option } from "@/components/forms/fields";
import { CheckboxField, FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { fail } from "@/lib/actions/result";
import { addGate, recordGateResult, removeGate, saveRelease, transitionRelease } from "@/lib/actions/releases";
import { GATE_CATEGORIES, GATE_CATEGORY_LABELS, RELEASE_TRANSITIONS, type GateStatus, type ReleaseStatus } from "@/lib/domain/governance";
import { NONE } from "@/lib/validation/common";
import { gateSchema, releaseSchema } from "@/lib/validation/governance";

type Values = { projectId: string; name: string; version: string; plannedDate: string; managerId: string; notes: string };
const EMPTY: Values = { projectId: "", name: "", version: "", plannedDate: "", managerId: NONE, notes: "" };

export function ReleaseDialog({
  projects,
  members,
  item,
  fixedProject,
  open,
  onOpenChange,
}: {
  projects: Option[];
  members: Option[];
  item?: { id: string } & Values;
  fixedProject?: string;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  return (
    <FormDialog<Values>
      open={open}
      onOpenChange={onOpenChange}
      trigger={
        item ? undefined : (
          <Button size="sm">
            <Plus className="size-4" /> Plan release
          </Button>
        )
      }
      title={item ? "Edit release" : "Plan a release"}
      description={item ? undefined : "New releases start with five default quality gates; add or remove gates until the release is approved."}
      submitLabel="Save release"
      schema={releaseSchema}
      defaultValues={item ?? { ...EMPTY, projectId: fixedProject ?? "" }}
      onSubmit={(v) => {
        if (!v.projectId || v.projectId === NONE) return Promise.resolve(fail("Please correct the highlighted fields.", { projectId: ["Choose a project."] }));
        return saveRelease(v.projectId, item?.id ?? null, v);
      }}
    >
      {!item && !fixedProject && <SelectField name="projectId" label="Project" options={projects} required />}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="name" label="Name" required />
        <TextField name="version" label="Version" placeholder="e.g. 2.4.0" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="plannedDate" label="Planned date" type="date" />
        <SelectField name="managerId" label="Release manager" options={[{ value: NONE, label: "Unassigned" }, ...members]} />
      </div>
      <TextareaField name="notes" label="Notes" rows={3} />
    </FormDialog>
  );
}

/** The edit dialog needs somewhere to open from on the detail page. */
export function EditReleaseButton({ members, item }: { members: Option[]; item: { id: string } & Values }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="size-4" /> Edit
      </Button>
      {open && <ReleaseDialog projects={[]} members={members} item={item} open={open} onOpenChange={setOpen} />}
    </>
  );
}

export function ReleaseStatusButtons({ releaseId, name, status, canManage, canApprove, gatesReady }: { releaseId: string; name: string; status: ReleaseStatus; canManage: boolean; canApprove: boolean; gatesReady: boolean }) {
  const [note, setNote] = useState<null | { to: ReleaseStatus; title: string; required: boolean; label: string }>(null);
  const next = RELEASE_TRANSITIONS[status];
  if (next.length === 0) return null;

  const items = [
    next.includes("in_review") && canManage && (status === "planned" ? { label: "Send to review", icon: PlayCircle, run: () => transitionRelease(releaseId, "in_review") } : { label: "Reopen review", icon: Undo2, run: () => transitionRelease(releaseId, "in_review") }),
    next.includes("planned") && canManage && { label: "Back to planned", icon: Undo2, run: () => transitionRelease(releaseId, "planned") },
    next.includes("approved") && canApprove && { label: gatesReady ? "Approve release" : "Approve release (gates open)", icon: CheckCircle2, run: () => transitionRelease(releaseId, "approved") },
    next.includes("released") && canManage && { label: "Mark released", icon: Rocket, run: () => transitionRelease(releaseId, "released") },
    next.includes("cancelled") && canManage && "separator" as const,
    next.includes("cancelled") && canManage && {
      label: "Cancel release…",
      icon: XCircle,
      destructive: true,
      onSelect: () => setNote({ to: "cancelled", title: "Cancel this release", required: true, label: "Why is it cancelled?" }),
    },
  ];

  return (
    <>
      <RowActions label={`Release actions for ${name}`} items={items} />
      {note && (
        <NoteDialog
          open
          onOpenChange={(o) => !o && setNote(null)}
          title={note.title}
          label={note.label}
          required={note.required}
          destructive
          submitLabel="Cancel release"
          onSubmit={(text) => transitionRelease(releaseId, note.to, text)}
        />
      )}
    </>
  );
}

type GateRow = { id: string; name: string; status: GateStatus; is_required: boolean };

export function GateRowActions({
  releaseId,
  gate,
  locked,
  structureLocked,
  canManage,
  canApprove,
}: {
  releaseId: string;
  gate: GateRow;
  /** Released or cancelled: nothing can change. */
  locked: boolean;
  /** Approved, released or cancelled: gates can't be added or removed (results can still change). */
  structureLocked: boolean;
  canManage: boolean;
  canApprove: boolean;
}) {
  const [note, setNote] = useState<null | "failed" | "waived">(null);
  const editable = !locked && canManage;
  return (
    <>
      <RowActions
        label={`Actions for gate ${gate.name}`}
        items={[
          editable && gate.status !== "passed" && { label: "Mark passed", icon: CheckCircle2, run: () => recordGateResult(releaseId, gate.id, "passed") },
          editable && gate.status !== "failed" && { label: "Mark failed…", icon: XCircle, onSelect: () => setNote("failed") },
          !locked && canApprove && gate.status !== "waived" && { label: "Waive…", icon: Pencil, onSelect: () => setNote("waived") },
          editable && gate.status !== "pending" && { label: "Reset to pending", icon: Undo2, run: () => recordGateResult(releaseId, gate.id, "pending") },
          editable && !structureLocked && "separator" as const,
          editable && !structureLocked && { label: "Remove gate", icon: Trash2, destructive: true, run: () => removeGate(releaseId, gate.id) },
        ]}
      />
      {note && (
        <NoteDialog
          open
          onOpenChange={(o) => !o && setNote(null)}
          title={note === "failed" ? "Mark this gate as failed" : "Waive this gate"}
          description={note === "waived" ? `${gate.name}. A waiver is recorded with your name and this reason.` : gate.name}
          label={note === "failed" ? "What failed?" : "Why is it waived?"}
          submitLabel={note === "failed" ? "Mark failed" : "Waive gate"}
          onSubmit={(text) => recordGateResult(releaseId, gate.id, note, text)}
        />
      )}
    </>
  );
}

export function AddGateDialog({ releaseId }: { releaseId: string }) {
  return (
    <FormDialog<{ name: string; category: string; isRequired: boolean }>
      trigger={
        <Button size="sm" variant="outline">
          <Plus className="size-4" /> Add gate
        </Button>
      }
      title="Add a quality gate"
      description="Required gates must be passed or waived before the release can be approved."
      submitLabel="Add gate"
      schema={gateSchema}
      defaultValues={{ name: "", category: "quality", isRequired: true }}
      onSubmit={(v) => addGate(releaseId, v)}
    >
      <TextField name="name" label="Gate" required placeholder="e.g. Performance test signed off" />
      <SelectField name="category" label="Category" options={GATE_CATEGORIES.map((c) => ({ value: c, label: GATE_CATEGORY_LABELS[c] }))} />
      <CheckboxField name="isRequired" label="Required for approval" />
    </FormDialog>
  );
}
