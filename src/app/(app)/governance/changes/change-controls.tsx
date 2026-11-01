"use client";

import { Ban, CheckCircle2, Hammer, Pencil, Plus, Send, Undo2, XCircle } from "lucide-react";
import { useState } from "react";

import { NoteDialog } from "@/components/common/note-dialog";
import { RowActions } from "@/components/common/row-actions";
import { SelectField, TextareaField, TextField, type Option } from "@/components/forms/fields";
import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import {
  decideChangeRequest,
  implementChangeRequest,
  saveChangeRequest,
  submitChangeRequest,
  withdrawChangeRequest,
} from "@/lib/actions/governance";
import { fail } from "@/lib/actions/result";
import type { ChangeStatus } from "@/lib/domain/governance";
import { NONE } from "@/lib/validation/common";
import { changeRequestSchema } from "@/lib/validation/governance";

type Values = {
  projectId: string;
  title: string;
  description: string;
  justification: string;
  impactScheduleDays: string;
  impactEffortHours: string;
  impactScope: string;
  impactRisk: string;
};
const EMPTY: Values = { projectId: "", title: "", description: "", justification: "", impactScheduleDays: "", impactEffortHours: "", impactScope: "", impactRisk: "" };

export function ChangeDialog({
  projects,
  item,
  fixedProject,
  open,
  onOpenChange,
}: {
  projects: Option[];
  item?: { id: string } & Values;
  fixedProject?: string;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  return (
    <FormDialog<Values>
      open={open}
      onOpenChange={onOpenChange}
      wide
      trigger={
        item ? undefined : (
          <Button size="sm">
            <Plus className="size-4" /> New change request
          </Button>
        )
      }
      title={item ? "Edit change request" : "New change request"}
      description="Describe the change and its impact. A draft can be edited; once submitted it is locked for the decision."
      submitLabel="Save draft"
      schema={changeRequestSchema}
      defaultValues={item ?? { ...EMPTY, projectId: fixedProject ?? "" }}
      onSubmit={(v) => {
        if (!v.projectId || v.projectId === NONE) return Promise.resolve(fail("Please correct the highlighted fields.", { projectId: ["Choose a project."] }));
        return saveChangeRequest(v.projectId, item?.id ?? null, v);
      }}
    >
      {!item && !fixedProject && <SelectField name="projectId" label="Project" options={projects} required />}
      <TextField name="title" label="Title" required />
      <TextareaField name="description" label="What changes?" rows={3} />
      <TextareaField name="justification" label="Why is it needed?" rows={2} description="Required before it can be submitted." />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="impactScheduleDays" label="Schedule impact (days)" inputMode="numeric" description="Negative if it saves time." />
        <TextField name="impactEffortHours" label="Added effort (hours)" inputMode="decimal" />
      </div>
      <TextareaField name="impactScope" label="Scope impact" rows={2} />
      <TextareaField name="impactRisk" label="Risk impact" rows={2} />
    </FormDialog>
  );
}

export function ChangeRowActions({
  row,
  projects,
  canManage,
  canApprove,
  isRequester,
}: {
  row: {
    id: string;
    project_id: string;
    title: string;
    status: ChangeStatus;
    description: string | null;
    justification: string | null;
    impact_schedule_days: number | null;
    impact_effort_hours: number | null;
    impact_scope: string | null;
    impact_risk: string | null;
  };
  projects: Option[];
  canManage: boolean;
  canApprove: boolean;
  isRequester: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [deciding, setDeciding] = useState<null | "approve" | "reject">(null);

  return (
    <>
      <RowActions
        label={`Actions for ${row.title}`}
        items={[
          canManage && row.status === "draft" && { label: "Edit", icon: Pencil, onSelect: () => setEditing(true) },
          canManage && row.status === "draft" && { label: "Submit for decision", icon: Send, run: () => submitChangeRequest(row.id) },
          canApprove && !isRequester && row.status === "submitted" && { label: "Approve…", icon: CheckCircle2, onSelect: () => setDeciding("approve") },
          canApprove && !isRequester && row.status === "submitted" && { label: "Reject…", icon: XCircle, onSelect: () => setDeciding("reject") },
          canManage && row.status === "approved" && { label: "Mark implemented", icon: Hammer, run: () => implementChangeRequest(row.id) },
          canManage && (row.status === "draft" || row.status === "submitted") && { label: "Withdraw", icon: row.status === "draft" ? Ban : Undo2, run: () => withdrawChangeRequest(row.id) },
        ]}
      />
      {editing && (
        <ChangeDialog
          projects={projects}
          open={editing}
          onOpenChange={setEditing}
          item={{
            id: row.id,
            projectId: row.project_id,
            title: row.title,
            description: row.description ?? "",
            justification: row.justification ?? "",
            impactScheduleDays: row.impact_schedule_days === null ? "" : String(row.impact_schedule_days),
            impactEffortHours: row.impact_effort_hours === null ? "" : String(row.impact_effort_hours),
            impactScope: row.impact_scope ?? "",
            impactRisk: row.impact_risk ?? "",
          }}
        />
      )}
      {deciding && (
        <NoteDialog
          open
          onOpenChange={(o) => !o && setDeciding(null)}
          title={deciding === "approve" ? "Approve this change" : "Reject this change"}
          description={row.title}
          label={deciding === "approve" ? "Note (optional)" : "Why is it rejected?"}
          required={deciding === "reject"}
          submitLabel={deciding === "approve" ? "Approve" : "Reject"}
          destructive={deciding === "reject"}
          onSubmit={(note) => decideChangeRequest(row.id, deciding === "approve", note)}
        />
      )}
    </>
  );
}
