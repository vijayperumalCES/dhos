"use client";

import { Link2, Pause, Play, Plus, RefreshCw, Trash2, Unlink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { RowActions } from "@/components/common/row-actions";
import { SelectField, TextField } from "@/components/forms/fields";
import { FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { createConnection, deleteConnection, linkWorkItem, setConnectionEnabled, syncConnectionNow, unlinkWorkItem } from "@/lib/actions/automation";
import { PROVIDER_LABELS, PROVIDERS } from "@/lib/automation/adapters";
import { connectionSchema, linkSchema, type ConnectionInput, type LinkInput } from "@/lib/validation/automation";

export function AddConnectionButton() {
  const router = useRouter();
  return (
    <FormDialog<ConnectionInput>
      trigger={
        <Button size="sm">
          <Plus className="size-4" /> Add connection
        </Button>
      }
      title="Add an integration"
      description="Connections use a built-in mock adapter: it behaves like the provider (statuses advance over a few days) so you can try the whole flow without an account. Live adapters need a credential store and are not built yet."
      schema={connectionSchema}
      defaultValues={{ provider: "github", name: "", target: "" }}
      onSubmit={async (v) => {
        const r = await createConnection(v);
        if (r.ok) router.push(`/integrations/${r.data.id}`);
        return r;
      }}
    >
      <SelectField name="provider" label="Provider" required options={PROVIDERS.map((p) => ({ value: p, label: PROVIDER_LABELS[p] }))} />
      <TextField name="name" label="Name" required placeholder="Core platform GitHub" />
      <TextField name="target" label="Repository, project or site (optional)" description="Used to build links, e.g. acme/app for GitHub, acme.atlassian.net for Jira." />
    </FormDialog>
  );
}

export function ConnectionActions({ connection }: { connection: { id: string; name: string; provider: string; enabled: boolean } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [linking, setLinking] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending || !connection.enabled}
        onClick={() =>
          start(async () => {
            const r = await syncConnectionNow(connection.id);
            if (r.ok) toast.success(r.message);
            else toast.error(r.error);
            router.refresh();
          })
        }
      >
        <RefreshCw className="size-4" /> {pending ? "Syncing…" : "Sync now"}
      </Button>
      <Button size="sm" onClick={() => setLinking(true)}>
        <Link2 className="size-4" /> Link work item
      </Button>
      <RowActions
        label={`Actions for ${connection.name}`}
        items={[
          { label: connection.enabled ? "Pause" : "Resume", icon: connection.enabled ? Pause : Play, run: () => setConnectionEnabled(connection.id, !connection.enabled) },
          "separator",
          {
            label: "Remove connection",
            icon: Trash2,
            destructive: true,
            run: async () => {
              const r = await deleteConnection(connection.id);
              if (r.ok) router.push("/integrations");
              return r;
            },
          },
        ]}
      />
      {linking && (
        <FormDialog<LinkInput>
          open={linking}
          onOpenChange={setLinking}
          title="Link a work item"
          description={`Tie a Stride work item to its ${PROVIDER_LABELS[connection.provider as keyof typeof PROVIDER_LABELS] ?? "external"} issue. Syncs report when the external status changes.`}
          schema={linkSchema}
          defaultValues={{ workItemKey: "", externalId: "" }}
          onSubmit={(v) => linkWorkItem(connection.id, v)}
        >
          <TextField name="workItemKey" label="Work item key" required placeholder="NW-12" />
          <TextField name="externalId" label="External issue id" required placeholder={connection.provider === "jira" ? "PAY-123" : "acme/app#42"} />
        </FormDialog>
      )}
    </div>
  );
}

export function UnlinkButton({ linkId }: { linkId: string }) {
  return <RowActions label="Link actions" items={[{ label: "Unlink", icon: Unlink, destructive: true, run: () => unlinkWorkItem(linkId) }]} />;
}
