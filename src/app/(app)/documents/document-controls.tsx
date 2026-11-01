"use client";

import { Archive, ArchiveRestore, FilePlus2, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { RowActions } from "@/components/common/row-actions";
import { SelectField, TextareaField, TextField, type Option } from "@/components/forms/fields";
import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { addDocumentVersion, createDocument, setDocumentArchived, updateDocumentDetails } from "@/lib/actions/documents";
import { fail } from "@/lib/actions/result";
import { DOCUMENT_TYPE_LABELS, DOCUMENT_TYPES, DOCUMENT_VISIBILITIES, DOCUMENT_VISIBILITY_LABELS } from "@/lib/domain/governance";
import { NONE } from "@/lib/validation/common";
import { documentMetaSchema, documentSchema, documentVersionSchema } from "@/lib/validation/governance";

const TYPE_OPTIONS: Option[] = DOCUMENT_TYPES.map((t) => ({ value: t, label: DOCUMENT_TYPE_LABELS[t] }));
const VISIBILITY_OPTIONS: Option[] = DOCUMENT_VISIBILITIES.map((v) => ({ value: v, label: DOCUMENT_VISIBILITY_LABELS[v] }));

type NewValues = { projectId: string; title: string; docType: string; visibility: string; description: string; content: string; url: string; note: string };

export function NewDocumentDialog({ projects, fixedProject }: { projects: Option[]; fixedProject?: string }) {
  const router = useRouter();
  return (
    <FormDialog<NewValues>
      wide
      trigger={
        <Button size="sm">
          <Plus className="size-4" /> New document
        </Button>
      }
      title="New document"
      description="Write the content in Markdown, link to where it lives, or both. Every save after this creates a new immutable version."
      submitLabel="Create document"
      schema={documentSchema}
      defaultValues={{ projectId: fixedProject ?? "", title: "", docType: "other", visibility: "internal", description: "", content: "", url: "", note: "" }}
      onSubmit={async (v) => {
        if (!v.projectId || v.projectId === NONE) return fail("Please correct the highlighted fields.", { projectId: ["Choose a project."] });
        const r = await createDocument(v.projectId, v);
        if (r.ok) router.push(`/documents/${r.data.id}`);
        return r;
      }}
    >
      {!fixedProject && <SelectField name="projectId" label="Project" options={projects} required />}
      <TextField name="title" label="Title" required />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="docType" label="Type" options={TYPE_OPTIONS} />
        <SelectField name="visibility" label="Visibility" options={VISIBILITY_OPTIONS} description="“Shared with client” lets client stakeholders on the project open it." />
      </div>
      <TextField name="description" label="Summary" />
      <TextareaField name="content" label="Content (Markdown)" rows={8} />
      <TextField name="url" label="Or link" placeholder="https://" />
    </FormDialog>
  );
}

export function NewVersionDialog({ documentId }: { documentId: string }) {
  return (
    <FormDialog<{ content: string; url: string; note: string }>
      wide
      trigger={
        <Button size="sm">
          <FilePlus2 className="size-4" /> Add version
        </Button>
      }
      title="Add a version"
      description="Earlier versions are kept exactly as they were."
      submitLabel="Save as new version"
      schema={documentVersionSchema}
      defaultValues={{ content: "", url: "", note: "" }}
      onSubmit={(v) => addDocumentVersion(documentId, v)}
    >
      <TextareaField name="content" label="Content (Markdown)" rows={10} />
      <TextField name="url" label="Or link" placeholder="https://" />
      <TextField name="note" label="What changed?" />
    </FormDialog>
  );
}

export function DocumentDetailsActions({
  documentId,
  archived,
  details,
}: {
  documentId: string;
  archived: boolean;
  details: { title: string; docType: string; visibility: string; description: string };
}) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <RowActions
        label="Document actions"
        items={[
          !archived && { label: "Edit details", icon: Pencil, onSelect: () => setEditing(true) },
          archived
            ? { label: "Restore", icon: ArchiveRestore, run: () => setDocumentArchived(documentId, false) }
            : { label: "Archive", icon: Archive, run: () => setDocumentArchived(documentId, true) },
        ]}
      />
      {editing && (
        <FormDialog<typeof details>
          open
          onOpenChange={(o) => !o && setEditing(false)}
          title="Document details"
          submitLabel="Save details"
          schema={documentMetaSchema}
          defaultValues={details}
          onSubmit={(v) => updateDocumentDetails(documentId, v)}
        >
          <TextField name="title" label="Title" required />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField name="docType" label="Type" options={TYPE_OPTIONS} />
            <SelectField name="visibility" label="Visibility" options={VISIBILITY_OPTIONS} />
          </div>
          <TextField name="description" label="Summary" />
        </FormDialog>
      )}
    </>
  );
}
