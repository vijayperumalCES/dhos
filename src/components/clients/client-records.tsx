"use client";

import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import { useState } from "react";

import { RowActions } from "@/components/common/row-actions";
import { SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { CheckboxField, FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { saveContact, saveContract, setContactArchived, setContractArchived } from "@/lib/actions/client-records";
import { CONTRACT_STATUS_LABELS, CONTRACT_STATUSES, CONTRACT_TYPE_LABELS, CONTRACT_TYPES } from "@/lib/domain/governance";
import { contactSchema, contractSchema } from "@/lib/validation/governance";

type ContactValues = { name: string; jobTitle: string; email: string; phone: string; isPrimary: boolean; notes: string };
const EMPTY_CONTACT: ContactValues = { name: "", jobTitle: "", email: "", phone: "", isPrimary: false, notes: "" };

export function ContactDialog({
  clientId,
  item,
  open,
  onOpenChange,
}: {
  clientId: string;
  item?: { id: string } & ContactValues;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  return (
    <FormDialog<ContactValues>
      open={open}
      onOpenChange={onOpenChange}
      trigger={
        item ? undefined : (
          <Button size="sm" variant="outline">
            <Plus className="size-4" /> Add contact
          </Button>
        )
      }
      title={item ? "Edit contact" : "Add a contact"}
      submitLabel="Save contact"
      schema={contactSchema}
      defaultValues={item ?? EMPTY_CONTACT}
      onSubmit={(v) => saveContact(clientId, item?.id ?? null, v)}
    >
      <TextField name="name" label="Name" required />
      <TextField name="jobTitle" label="Job title" />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="email" label="Email" type="email" />
        <TextField name="phone" label="Phone" />
      </div>
      <CheckboxField name="isPrimary" label="Primary contact" description="Replaces the current primary contact." />
      <TextareaField name="notes" label="Notes" rows={2} />
    </FormDialog>
  );
}

export function ContactRowActions({ clientId, contact }: { clientId: string; contact: { id: string; name: string; job_title: string | null; email: string | null; phone: string | null; is_primary: boolean; notes: string | null; archived_at: string | null } }) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <RowActions
        label={`Actions for ${contact.name}`}
        items={[
          !contact.archived_at && { label: "Edit", icon: Pencil, onSelect: () => setEditing(true) },
          contact.archived_at
            ? { label: "Restore", icon: ArchiveRestore, run: () => setContactArchived(clientId, contact.id, false) }
            : { label: "Archive", icon: Archive, run: () => setContactArchived(clientId, contact.id, true) },
        ]}
      />
      {editing && (
        <ContactDialog
          clientId={clientId}
          open={editing}
          onOpenChange={setEditing}
          item={{ id: contact.id, name: contact.name, jobTitle: contact.job_title ?? "", email: contact.email ?? "", phone: contact.phone ?? "", isPrimary: contact.is_primary, notes: contact.notes ?? "" }}
        />
      )}
    </>
  );
}

type ContractValues = { title: string; reference: string; contractType: string; status: string; startDate: string; endDate: string; renewalNoticeDays: string; notes: string };
const EMPTY_CONTRACT: ContractValues = { title: "", reference: "", contractType: "sow", status: "draft", startDate: "", endDate: "", renewalNoticeDays: "", notes: "" };

export function ContractDialog({
  clientId,
  item,
  open,
  onOpenChange,
}: {
  clientId: string;
  item?: { id: string } & ContractValues;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  return (
    <FormDialog<ContractValues>
      open={open}
      onOpenChange={onOpenChange}
      wide
      trigger={
        item ? undefined : (
          <Button size="sm" variant="outline">
            <Plus className="size-4" /> Add contract
          </Button>
        )
      }
      title={item ? "Edit contract" : "Add a contract"}
      description="Terms and dates. A contract's monetary value is set separately by people who manage finance."
      submitLabel="Save contract"
      schema={contractSchema}
      defaultValues={item ?? EMPTY_CONTRACT}
      onSubmit={(v) => saveContract(clientId, item?.id ?? null, v)}
    >
      <TextField name="title" label="Title" required />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField name="reference" label="Reference" />
        <SelectField name="contractType" label="Type" options={CONTRACT_TYPES.map((t) => ({ value: t, label: CONTRACT_TYPE_LABELS[t] }))} />
        <SelectField name="status" label="Status" options={CONTRACT_STATUSES.map((s) => ({ value: s, label: CONTRACT_STATUS_LABELS[s] }))} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField name="startDate" label="Start" type="date" />
        <TextField name="endDate" label="End" type="date" />
        <TextField name="renewalNoticeDays" label="Notice (days)" inputMode="numeric" />
      </div>
      <TextareaField name="notes" label="Notes" rows={2} />
    </FormDialog>
  );
}

export function ContractRowActions({
  clientId,
  contract,
}: {
  clientId: string;
  contract: { id: string; title: string; reference: string | null; contract_type: string; status: string; start_date: string | null; end_date: string | null; renewal_notice_days: number | null; notes: string | null; archived_at: string | null };
}) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <RowActions
        label={`Actions for ${contract.title}`}
        items={[
          !contract.archived_at && { label: "Edit", icon: Pencil, onSelect: () => setEditing(true) },
          contract.archived_at
            ? { label: "Restore", icon: ArchiveRestore, run: () => setContractArchived(clientId, contract.id, false) }
            : { label: "Archive", icon: Archive, run: () => setContractArchived(clientId, contract.id, true) },
        ]}
      />
      {editing && (
        <ContractDialog
          clientId={clientId}
          open={editing}
          onOpenChange={setEditing}
          item={{
            id: contract.id,
            title: contract.title,
            reference: contract.reference ?? "",
            contractType: contract.contract_type,
            status: contract.status,
            startDate: contract.start_date ?? "",
            endDate: contract.end_date ?? "",
            renewalNoticeDays: contract.renewal_notice_days === null ? "" : String(contract.renewal_notice_days),
            notes: contract.notes ?? "",
          }}
        />
      )}
    </>
  );
}
