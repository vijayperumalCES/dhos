"use client";

import { Ban, Check, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { CheckboxField, FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { cancelRoleGrant, decideRoleGrant, requestRoleGrant, saveRetentionWindows, saveSecurityControls, setLegalHold } from "@/lib/actions/security";
import type { ActionResult } from "@/lib/actions/result";
import {
  controlsSchema,
  decisionSchema,
  grantRequestSchema,
  legalHoldSchema,
  retentionSchema,
  type ControlsInput,
  type DecisionInput,
  type GrantRequestInput,
  type LegalHoldInput,
  type RetentionInput,
} from "@/lib/validation/security";

export function ControlsDialog({ values }: { values: ControlsInput }) {
  return (
    <FormDialog<ControlsInput>
      trigger={<Button size="sm">Change</Button>}
      title="Security controls"
      description="Each control is recorded in the audit log, including who changed it."
      schema={controlsSchema}
      defaultValues={values}
      onSubmit={saveSecurityControls}
    >
      <CheckboxField
        name="dualApproval"
        label="Dual approval for privileged roles"
        description="Granting a role with administrative or finance permissions needs a second administrator to approve. Needs at least two people who can manage members."
      />
      <CheckboxField
        name="requireMfa"
        label="Require multi-factor authentication"
        description="Members see nothing in this organization until they verify an authenticator code in the current session. You must be verified yourself to switch this on."
      />
    </FormDialog>
  );
}

export function RequestGrantDialog({ members, roles }: { members: { value: string; label: string }[]; roles: { value: string; label: string }[] }) {
  return (
    <FormDialog<GrantRequestInput>
      trigger={
        <Button size="sm">
          <Plus className="size-4" /> Request a grant
        </Button>
      }
      title="Request a privileged role"
      description="A different administrator will be asked to approve. The request expires after 7 days."
      submitLabel="Send request"
      schema={grantRequestSchema}
      defaultValues={{ membershipId: "", roleKey: "", reason: "" }}
      onSubmit={requestRoleGrant}
    >
      <SelectField name="membershipId" label="Member" options={members} required />
      <SelectField name="roleKey" label="Role" options={roles} required />
      <TextareaField name="reason" label="Why is this needed?" required />
    </FormDialog>
  );
}

export function DecideButtons({ requestId, own }: { requestId: string; own: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState(false);

  const run = (fn: () => Promise<ActionResult<unknown>>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        if (r.message) toast.success(r.message);
      } else toast.error(r.error);
      router.refresh();
    });

  if (own) {
    return (
      <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => cancelRoleGrant(requestId))}>
        <Ban className="size-4" /> Cancel
      </Button>
    );
  }
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={pending} onClick={() => run(() => decideRoleGrant(requestId, true, {}))}>
        <Check className="size-4" /> Approve
      </Button>
      <Button variant="outline" size="sm" disabled={pending} onClick={() => setRejecting(true)}>
        <X className="size-4" /> Reject
      </Button>
      {rejecting && (
        <FormDialog<DecisionInput>
          open={rejecting}
          onOpenChange={setRejecting}
          title="Reject this request"
          submitLabel="Reject"
          schema={decisionSchema}
          defaultValues={{ note: "" }}
          onSubmit={(v) => decideRoleGrant(requestId, false, v)}
        >
          <TextareaField name="note" label="Note to the requester (optional)" />
        </FormDialog>
      )}
    </div>
  );
}

export function LegalHoldDialog({ active }: { active: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (active) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await setLegalHold(false, {});
            if (r.ok) toast.success(r.message);
            else toast.error(r.error);
            router.refresh();
          })
        }
      >
        Lift hold
      </Button>
    );
  }
  return (
    <FormDialog<LegalHoldInput>
      trigger={<Button size="sm">Place hold</Button>}
      title="Place a legal hold"
      description="While a hold is in force the retention job deletes nothing in this organization. The audit log is never deleted either way."
      submitLabel="Place hold"
      schema={legalHoldSchema}
      defaultValues={{ reason: "" }}
      onSubmit={(v) => setLegalHold(true, v)}
    >
      <TextareaField name="reason" label="Reason (shown to administrators)" required />
    </FormDialog>
  );
}

export function RetentionDialog({ values }: { values: RetentionInput }) {
  return (
    <FormDialog<RetentionInput>
      trigger={<Button size="sm">Change</Button>}
      title="Retention windows"
      description="Each window is 7 to 3650 days. Data older than its window is deleted by the daily retention job unless a legal hold is in force."
      schema={retentionSchema}
      defaultValues={values}
      onSubmit={saveRetentionWindows}
    >
      <TextField name="outboxDays" label="Events and webhook deliveries (days)" inputMode="numeric" />
      <TextField name="notificationDays" label="Read notifications (days)" inputMode="numeric" />
      <TextField name="logDays" label="Job and sync logs (days)" inputMode="numeric" />
    </FormDialog>
  );
}
