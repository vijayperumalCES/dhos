"use client";

import { CheckCircle2, CircleDot, Pencil, Plus, RotateCcw, Trash2, XCircle } from "lucide-react";
import { useState } from "react";

import { RowActions } from "@/components/common/row-actions";
import { SelectField, TextareaField, TextField, type Option } from "@/components/forms/fields";
import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { deleteProjectAction, saveProjectAction, setActionStatus } from "@/lib/actions/governance";
import { fail } from "@/lib/actions/result";
import { NONE } from "@/lib/validation/common";
import { actionSchema } from "@/lib/validation/governance";

type Values = { projectId: string; title: string; description: string; ownerId: string; dueDate: string; raidItemId: string; decisionId: string };
const EMPTY: Values = { projectId: "", title: "", description: "", ownerId: "", dueDate: "", raidItemId: NONE, decisionId: NONE };

export function ActionDialog({
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
            <Plus className="size-4" /> Add action
          </Button>
        )
      }
      title={item ? "Edit action" : "Add an action"}
      description="Every action has one owner and a due date."
      submitLabel="Save action"
      schema={actionSchema}
      defaultValues={item ?? { ...EMPTY, projectId: fixedProject ?? "" }}
      onSubmit={(v) => {
        if (!v.projectId || v.projectId === NONE) return Promise.resolve(fail("Please correct the highlighted fields.", { projectId: ["Choose a project."] }));
        return saveProjectAction(v.projectId, item?.id ?? null, v);
      }}
    >
      {!item && !fixedProject && <SelectField name="projectId" label="Project" options={projects} required />}
      <TextField name="title" label="Title" required />
      <TextareaField name="description" label="Details" rows={3} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="ownerId" label="Owner" options={members} required />
        <TextField name="dueDate" label="Due date" type="date" required />
      </div>
    </FormDialog>
  );
}

type Row = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: "open" | "in_progress" | "done" | "cancelled";
  owner_membership_id: string;
  due_date: string;
  raid_item_id: string | null;
  decision_id: string | null;
};

export function ActionRowActions({ row, projects, members, canManage, isOwner }: { row: Row; projects: Option[]; members: Option[]; canManage: boolean; isOwner: boolean }) {
  const [editing, setEditing] = useState(false);
  const open = row.status === "open" || row.status === "in_progress";
  const canMove = canManage || isOwner;
  return (
    <>
      <RowActions
        label={`Actions for ${row.title}`}
        items={[
          canMove && row.status === "open" && { label: "Start", icon: CircleDot, run: () => setActionStatus(row.id, "in_progress") },
          canMove && open && { label: "Mark done", icon: CheckCircle2, run: () => setActionStatus(row.id, "done") },
          canMove && !open && { label: "Reopen", icon: RotateCcw, run: () => setActionStatus(row.id, "open") },
          canManage && open && { label: "Cancel action", icon: XCircle, run: () => setActionStatus(row.id, "cancelled") },
          canManage && { label: "Edit", icon: Pencil, onSelect: () => setEditing(true) },
          canManage && "separator",
          canManage && { label: "Delete", icon: Trash2, destructive: true, run: () => deleteProjectAction(row.id) },
        ]}
      />
      {editing && (
        <ActionDialog
          projects={projects}
          members={members}
          open={editing}
          onOpenChange={setEditing}
          item={{
            id: row.id,
            projectId: row.project_id,
            title: row.title,
            description: row.description ?? "",
            ownerId: row.owner_membership_id,
            dueDate: row.due_date,
            raidItemId: row.raid_item_id ?? NONE,
            decisionId: row.decision_id ?? NONE,
          }}
        />
      )}
    </>
  );
}
