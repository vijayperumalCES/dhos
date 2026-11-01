"use client";

import { Archive, ArchiveRestore, CheckCircle2, CircleDot, Pencil, Plus, RotateCcw, ShieldCheck, XCircle } from "lucide-react";
import { useState } from "react";
import { useWatch } from "react-hook-form";

import { NoteDialog } from "@/components/common/note-dialog";
import { RowActions } from "@/components/common/row-actions";
import { SelectField, TextareaField, TextField, type Option } from "@/components/forms/fields";
import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { fail } from "@/lib/actions/result";
import { saveRaidItem, setRaidArchived, setRaidStatus } from "@/lib/actions/governance";
import { RAID_TYPE_LABELS, RAID_TYPES, SCALE_LABELS, type RaidStatus, type RaidType } from "@/lib/domain/governance";
import { NONE } from "@/lib/validation/common";
import { raidItemSchema } from "@/lib/validation/governance";

type Values = {
  projectId: string;
  type: string;
  title: string;
  description: string;
  probability: string;
  impact: string;
  ownerId: string;
  dueDate: string;
  mitigation: string;
  contingency: string;
};

const EMPTY: Values = { projectId: "", type: "risk", title: "", description: "", probability: "3", impact: "3", ownerId: NONE, dueDate: "", mitigation: "", contingency: "" };
const SCALE: Option[] = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} · ${SCALE_LABELS[n]}` }));
const TYPE_OPTIONS: Option[] = RAID_TYPES.map((t) => ({ value: t, label: RAID_TYPE_LABELS[t] }));

function ScoreFields() {
  const type = useWatch({ name: "type" }) as string;
  if (type === "risk")
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="probability" label="Probability" options={SCALE} required />
        <SelectField name="impact" label="Impact" options={SCALE} required />
      </div>
    );
  if (type === "issue") return <SelectField name="impact" label="Impact" options={SCALE} description="How badly this affects delivery today." />;
  return null;
}

export function RaidDialog({
  projects,
  members,
  item,
  fixedProject,
  open,
  onOpenChange,
}: {
  projects: Option[];
  members: Option[];
  item?: { id: string; projectId: string } & Omit<Values, "projectId">;
  fixedProject?: string;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const defaults: Values = item ?? { ...EMPTY, projectId: fixedProject ?? "" };
  return (
    <FormDialog<Values>
      open={open}
      onOpenChange={onOpenChange}
      wide
      trigger={
        item ? undefined : (
          <Button size="sm">
            <Plus className="size-4" /> Add item
          </Button>
        )
      }
      title={item ? "Edit RAID item" : "Add to the RAID register"}
      description="Risks, assumptions, issues and dependencies share one register so they can be filtered, owned and reviewed together."
      submitLabel="Save item"
      schema={raidItemSchema}
      defaultValues={defaults}
      onSubmit={(v) => {
        if (!v.projectId || v.projectId === NONE) return Promise.resolve(fail("Please correct the highlighted fields.", { projectId: ["Choose a project."] }));
        return saveRaidItem(v.projectId, item?.id ?? null, v);
      }}
    >
      {!item && !fixedProject && <SelectField name="projectId" label="Project" options={projects} required />}
      {!item && <SelectField name="type" label="Type" options={TYPE_OPTIONS} required />}
      <TextField name="title" label="Title" required />
      <TextareaField name="description" label="Description" rows={3} />
      <ScoreFields />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="ownerId" label="Owner" options={[{ value: NONE, label: "Unassigned" }, ...members]} />
        <TextField name="dueDate" label="Due date" type="date" />
      </div>
      <TextareaField name="mitigation" label="Mitigation / response" rows={2} />
      <TextareaField name="contingency" label="Contingency (if it happens)" rows={2} />
    </FormDialog>
  );
}

type Row = {
  id: string;
  project_id: string;
  type: RaidType;
  status: RaidStatus;
  title: string;
  description: string | null;
  probability: number | null;
  impact: number | null;
  owner_membership_id: string | null;
  due_date: string | null;
  mitigation: string | null;
  contingency: string | null;
  archived_at: string | null;
};

export function RaidRowActions({ row, projects, members }: { row: Row; projects: Option[]; members: Option[] }) {
  const [editing, setEditing] = useState(false);
  const [noting, setNoting] = useState<null | { status: RaidStatus; title: string; label: string }>(null);
  const open = row.status === "open" || row.status === "in_progress";

  return (
    <>
      <RowActions
        label={`Actions for ${row.title}`}
        items={[
          !row.archived_at && { label: "Edit", icon: Pencil, onSelect: () => setEditing(true) },
          !row.archived_at && row.status === "open" && { label: "Mark in progress", icon: CircleDot, run: () => setRaidStatus(row.id, { status: "in_progress", note: "" }) },
          !row.archived_at && open && { label: "Resolve…", icon: CheckCircle2, onSelect: () => setNoting({ status: "resolved", title: "Resolve this item", label: "How was it resolved?" }) },
          !row.archived_at && open && row.type === "risk" && { label: "Accept risk…", icon: ShieldCheck, onSelect: () => setNoting({ status: "accepted", title: "Accept this risk", label: "Why is it acceptable?" }) },
          !row.archived_at && open && { label: "Close…", icon: XCircle, onSelect: () => setNoting({ status: "closed", title: "Close this item", label: "Why is it closed?" }) },
          !row.archived_at && !open && { label: "Reopen", icon: RotateCcw, run: () => setRaidStatus(row.id, { status: "open", note: "" }) },
          "separator",
          row.archived_at
            ? { label: "Restore", icon: ArchiveRestore, run: () => setRaidArchived(row.id, false) }
            : { label: "Archive", icon: Archive, run: () => setRaidArchived(row.id, true) },
        ]}
      />
      {editing && (
        <RaidDialog
          projects={projects}
          members={members}
          open={editing}
          onOpenChange={setEditing}
          item={{
            id: row.id,
            projectId: row.project_id,
            type: row.type,
            title: row.title,
            description: row.description ?? "",
            probability: row.probability ? String(row.probability) : "",
            impact: row.impact ? String(row.impact) : "",
            ownerId: row.owner_membership_id ?? NONE,
            dueDate: row.due_date ?? "",
            mitigation: row.mitigation ?? "",
            contingency: row.contingency ?? "",
          }}
        />
      )}
      {noting && (
        <NoteDialog
          open
          onOpenChange={(o) => !o && setNoting(null)}
          title={noting.title}
          label={noting.label}
          description={row.title}
          submitLabel="Save"
          onSubmit={(note) => setRaidStatus(row.id, { status: noting.status, note })}
        />
      )}
    </>
  );
}
