"use client";

import { CheckCircle2, GitBranchPlus, Pencil, Plus, XCircle } from "lucide-react";
import { useState } from "react";

import { NoteDialog } from "@/components/common/note-dialog";
import { RowActions } from "@/components/common/row-actions";
import { SelectField, TextareaField, TextField, type Option } from "@/components/forms/fields";
import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { recordDecision, saveDecision, supersedeDecision } from "@/lib/actions/governance";
import { fail } from "@/lib/actions/result";
import type { DecisionStatus } from "@/lib/domain/governance";
import { NONE } from "@/lib/validation/common";
import { decisionSchema } from "@/lib/validation/governance";

type Values = { projectId: string; title: string; context: string; decision: string; rationale: string; consequences: string };
const EMPTY: Values = { projectId: "", title: "", context: "", decision: "", rationale: "", consequences: "" };

export function DecisionDialog({
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
            <Plus className="size-4" /> Propose decision
          </Button>
        )
      }
      title={item ? "Edit proposed decision" : "Propose a decision"}
      description="A decision stays editable only until it is accepted or rejected. After that it is locked and can only be superseded."
      submitLabel="Save"
      schema={decisionSchema}
      defaultValues={item ?? { ...EMPTY, projectId: fixedProject ?? "" }}
      onSubmit={(v) => {
        if (!v.projectId || v.projectId === NONE) return Promise.resolve(fail("Please correct the highlighted fields.", { projectId: ["Choose a project."] }));
        return saveDecision(v.projectId, item?.id ?? null, v);
      }}
    >
      {!item && !fixedProject && <SelectField name="projectId" label="Project" options={projects} required />}
      <TextField name="title" label="Title" required />
      <TextareaField name="context" label="Context" rows={3} description="What prompted the decision?" />
      <TextareaField name="decision" label="Decision" rows={3} />
      <TextareaField name="rationale" label="Rationale" rows={2} />
      <TextareaField name="consequences" label="Consequences" rows={2} />
    </FormDialog>
  );
}

type Row = { id: string; project_id: string; title: string; status: DecisionStatus; context: string | null; decision: string | null; rationale: string | null; consequences: string | null };

/** `replacements`: accepted decisions on the same project that could replace this one. */
export function DecisionRowActions({ row, projects, replacements }: { row: Row; projects: Option[]; replacements: Option[] }) {
  const [editing, setEditing] = useState(false);
  const [recording, setRecording] = useState<null | "accepted" | "rejected">(null);
  const [superseding, setSuperseding] = useState(false);

  return (
    <>
      <RowActions
        label={`Actions for ${row.title}`}
        items={[
          row.status === "proposed" && { label: "Edit", icon: Pencil, onSelect: () => setEditing(true) },
          row.status === "proposed" && { label: "Accept…", icon: CheckCircle2, onSelect: () => setRecording("accepted") },
          row.status === "proposed" && { label: "Reject…", icon: XCircle, onSelect: () => setRecording("rejected") },
          row.status === "accepted" && replacements.length > 0 && { label: "Supersede…", icon: GitBranchPlus, onSelect: () => setSuperseding(true) },
        ]}
      />
      {editing && (
        <DecisionDialog
          projects={projects}
          open={editing}
          onOpenChange={setEditing}
          item={{
            id: row.id,
            projectId: row.project_id,
            title: row.title,
            context: row.context ?? "",
            decision: row.decision ?? "",
            rationale: row.rationale ?? "",
            consequences: row.consequences ?? "",
          }}
        />
      )}
      {recording && (
        <NoteDialog
          open
          onOpenChange={(o) => !o && setRecording(null)}
          title={recording === "accepted" ? "Accept this decision" : "Reject this proposal"}
          description={`${row.title}. Once recorded it is locked.`}
          label="The decision"
          submitLabel={recording === "accepted" ? "Accept and lock" : "Reject and lock"}
          onSubmit={(text) => recordDecision(row.id, { status: recording, decision: text })}
        />
      )}
      {superseding && (
        <FormDialog<{ replacementId: string }>
          open
          onOpenChange={(o) => !o && setSuperseding(false)}
          title="Supersede this decision"
          description="Choose the accepted decision that replaces it. This one stays on record, marked superseded."
          submitLabel="Supersede"
          schema={{ safeParse: (v: unknown) => ({ success: true, data: v }) } as never}
          defaultValues={{ replacementId: "" }}
          onSubmit={(v) => supersedeDecision(row.id, v.replacementId)}
        >
          <SelectField name="replacementId" label="Replaced by" options={replacements} required />
        </FormDialog>
      )}
    </>
  );
}
