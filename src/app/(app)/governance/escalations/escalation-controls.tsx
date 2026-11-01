"use client";

import { CheckCircle2, Eye, FilePlus2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

import { NoteDialog } from "@/components/common/note-dialog";
import { RowActions } from "@/components/common/row-actions";
import { SelectField, TextareaField, TextField, type Option } from "@/components/forms/fields";
import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { acknowledgeEscalation, addEscalationEvidence, raiseEscalation, resolveEscalation } from "@/lib/actions/governance";
import { fail } from "@/lib/actions/result";
import { ESCALATION_SEVERITIES, ESCALATION_SEVERITY_LABELS, type EscalationStatus } from "@/lib/domain/governance";
import { NONE } from "@/lib/validation/common";
import { escalationSchema, evidenceSchema } from "@/lib/validation/governance";

type Evidence = { kind: "note" | "link"; title: string; url: string; note: string };
type Values = {
  projectId: string;
  title: string;
  description: string;
  severity: string;
  toId: string;
  respondBy: string;
  raidItemId: string;
  evidence: Evidence[];
};
const NEW_EVIDENCE: Evidence = { kind: "note", title: "", url: "", note: "" };
const KIND: Option[] = [
  { value: "note", label: "Note" },
  { value: "link", label: "Link" },
];

function EvidenceFields() {
  const { control, watch } = useFormContext<Values>();
  const { fields, append, remove } = useFieldArray({ control, name: "evidence" });
  return (
    <fieldset className="space-y-3 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">
        Evidence<span className="text-destructive" aria-hidden>*</span>
      </legend>
      <p className="text-xs text-muted-foreground">Escalations need proof: a metric, a note from the team, a link to the tracker or thread.</p>
      {fields.map((f, i) => {
        const kind = watch(`evidence.${i}.kind`);
        return (
          <div key={f.id} className="space-y-3 rounded-md bg-muted/40 p-3">
            <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
              <SelectField name={`evidence.${i}.kind`} label="Type" options={KIND} />
              <TextField name={`evidence.${i}.title`} label="Title" required />
            </div>
            {kind === "link" ? <TextField name={`evidence.${i}.url`} label="Link" placeholder="https://" required /> : <TextareaField name={`evidence.${i}.note`} label="Note" rows={2} required />}
            {fields.length > 1 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)}>
                <Trash2 className="size-4" /> Remove
              </Button>
            )}
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" onClick={() => append(NEW_EVIDENCE)}>
        <Plus className="size-4" /> Add evidence
      </Button>
    </fieldset>
  );
}

export function EscalationDialog({ projects, members, fixedProject }: { projects: Option[]; members: Option[]; fixedProject?: string }) {
  return (
    <FormDialog<Values>
      wide
      trigger={
        <Button size="sm">
          <Plus className="size-4" /> Raise escalation
        </Button>
      }
      title="Raise an escalation"
      description="Name who must respond and by when. They can acknowledge it; it stays visible as overdue until it is resolved."
      submitLabel="Raise escalation"
      schema={escalationSchema}
      defaultValues={{ projectId: fixedProject ?? "", title: "", description: "", severity: "high", toId: "", respondBy: "", raidItemId: NONE, evidence: [NEW_EVIDENCE] }}
      onSubmit={(v) => {
        if (!v.projectId || v.projectId === NONE) return Promise.resolve(fail("Please correct the highlighted fields.", { projectId: ["Choose a project."] }));
        return raiseEscalation(v.projectId, v);
      }}
    >
      {!fixedProject && <SelectField name="projectId" label="Project" options={projects} required />}
      <TextField name="title" label="Title" required />
      <TextareaField name="description" label="What is wrong and what do you need?" rows={3} required />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="severity" label="Severity" options={ESCALATION_SEVERITIES.map((s) => ({ value: s, label: ESCALATION_SEVERITY_LABELS[s] }))} required />
        <TextField name="respondBy" label="Respond by (end of day)" type="date" required />
      </div>
      <SelectField name="toId" label="Escalate to" options={members} description="Only people who can open this project's governance records can be chosen." required />
      <EvidenceFields />
    </FormDialog>
  );
}

export function EscalationRowActions({
  id,
  title,
  status,
  isRecipient,
  canManage,
}: {
  id: string;
  title: string;
  status: EscalationStatus;
  isRecipient: boolean;
  canManage: boolean;
}) {
  const [resolving, setResolving] = useState(false);
  const [adding, setAdding] = useState(false);
  const canResolve = status !== "resolved" && (isRecipient || canManage);

  return (
    <>
      <RowActions
        label={`Actions for ${title}`}
        items={[
          status === "open" && isRecipient && { label: "Acknowledge", icon: Eye, run: () => acknowledgeEscalation(id) },
          canResolve && { label: "Resolve…", icon: CheckCircle2, onSelect: () => setResolving(true) },
          status !== "resolved" && canManage && { label: "Add evidence…", icon: FilePlus2, onSelect: () => setAdding(true) },
        ]}
      />
      {resolving && (
        <NoteDialog
          open
          onOpenChange={(o) => !o && setResolving(false)}
          title="Resolve this escalation"
          description={title}
          label="How was it resolved?"
          submitLabel="Resolve"
          onSubmit={(note) => resolveEscalation(id, note)}
        />
      )}
      {adding && (
        <FormDialog<Evidence>
          open
          onOpenChange={(o) => !o && setAdding(false)}
          title="Add evidence"
          submitLabel="Add evidence"
          schema={evidenceSchema}
          defaultValues={NEW_EVIDENCE}
          onSubmit={(v) => addEscalationEvidence(id, v)}
        >
          <AddEvidenceFields />
        </FormDialog>
      )}
    </>
  );
}

function AddEvidenceFields() {
  const { watch } = useFormContext<Evidence>();
  const kind = watch("kind");
  return (
    <>
      <SelectField name="kind" label="Type" options={KIND} />
      <TextField name="title" label="Title" required />
      {kind === "link" ? <TextField name="url" label="Link" placeholder="https://" required /> : <TextareaField name="note" label="Note" rows={3} required />}
    </>
  );
}
