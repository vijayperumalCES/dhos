"use client";

import { Check, Copy, KeyRound, Pencil, Plus, Power, PowerOff, RotateCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { RowActions } from "@/components/common/row-actions";
import { SelectField, TextField } from "@/components/forms/fields";
import { CheckboxField, FormDialog } from "@/components/forms/form-dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createWebhook, deleteWebhook, redeliverWebhook, rotateWebhookSecret, setWebhookEnabled, updateWebhook } from "@/lib/actions/automation";
import { ok } from "@/lib/actions/result";
import { CATEGORY_LABELS, EVENT_CATEGORIES, EVENTS, EVENT_TYPES } from "@/lib/automation/events";
import { WEBHOOK_FORMAT_LABELS, WEBHOOK_FORMATS, webhookSchema, type WebhookInput } from "@/lib/validation/automation";

function EventChecklist() {
  const { control } = useFormContext<WebhookInput>();
  const all = useWatch({ control, name: "allEvents" });
  return (
    <div className="space-y-3">
      <CheckboxField name="allEvents" label="All events" description="Includes events added in future releases." />
      {!all && (
        <Controller
          control={control}
          name="eventTypes"
          render={({ field }) => (
            <fieldset className="space-y-3 rounded-lg border p-3">
              <legend className="px-1 text-sm font-medium">Events to send</legend>
              {EVENT_CATEGORIES.map((cat) => {
                const types = EVENT_TYPES.filter((t) => EVENTS[t].category === cat);
                if (types.length === 0) return null;
                return (
                  <div key={cat} className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">{CATEGORY_LABELS[cat]}</p>
                    {types.map((t) => (
                      <label key={t} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={field.value.includes(t)}
                          onCheckedChange={(on) => field.onChange(on === true ? [...field.value, t] : field.value.filter((x) => x !== t))}
                        />
                        {EVENTS[t].label}
                        <code className="text-xs text-muted-foreground">{t}</code>
                      </label>
                    ))}
                  </div>
                );
              })}
            </fieldset>
          )}
        />
      )}
    </div>
  );
}

export function SecretDialog({ secret, onClose, title = "Signing secret" }: { secret: string | null; onClose: () => void; title?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog open={secret !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Copy it now. For your security it is shown once and cannot be retrieved later; rotate it if it is lost.</DialogDescription>
        </DialogHeader>
        <code className="block rounded-md border bg-muted px-3 py-2 text-sm break-all" data-testid="webhook-secret">
          {secret}
        </code>
        <p className="text-xs text-muted-foreground">
          Requests carry <code>X-Stride-Signature: t=&lt;unix time&gt;,v1=&lt;hex&gt;</code>, an HMAC-SHA256 of <code>&lt;t&gt;.&lt;body&gt;</code> with this secret. Reject requests whose timestamp is more than five minutes old.
        </p>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={async () => {
              if (!secret) return;
              await navigator.clipboard.writeText(secret).catch(() => undefined);
              setCopied(true);
            }}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy"}
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Endpoint = { id: string; name: string; url: string; format: string; event_types: string[]; enabled: boolean };

function WebhookForm({ endpoint, open, onOpenChange, onCreated }: { endpoint?: Endpoint; open?: boolean; onOpenChange?: (o: boolean) => void; onCreated?: (secret: string) => void }) {
  const all = endpoint ? endpoint.event_types.includes("*") : true;
  return (
    <FormDialog<WebhookInput>
      wide
      open={open}
      onOpenChange={onOpenChange}
      trigger={
        endpoint ? undefined : (
          <Button size="sm">
            <Plus className="size-4" /> Add webhook
          </Button>
        )
      }
      title={endpoint ? `Edit ${endpoint.name}` : "Add a webhook"}
      description="Stride sends the selected events to this https address, signed so the receiver can verify them. Payloads carry ids and short labels, never descriptions or comments."
      submitLabel={endpoint ? "Save" : "Create webhook"}
      schema={webhookSchema}
      defaultValues={{
        name: endpoint?.name ?? "",
        url: endpoint?.url ?? "",
        format: (endpoint?.format as WebhookInput["format"]) ?? "generic",
        allEvents: all,
        eventTypes: endpoint && !all ? endpoint.event_types : [],
      }}
      onSubmit={async (v) => {
        if (endpoint) return updateWebhook(endpoint.id, v);
        const r = await createWebhook(v);
        if (r.ok) {
          onCreated?.(r.data.secret);
          return ok(undefined, r.message);
        }
        return r;
      }}
    >
      <TextField name="name" label="Name" required placeholder="Ops channel" />
      <TextField name="url" label="URL" required placeholder="https://hooks.example.com/stride" description="Must be https and resolve to a public address." />
      <SelectField name="format" label="Format" options={WEBHOOK_FORMATS.map((f) => ({ value: f, label: WEBHOOK_FORMAT_LABELS[f] }))} />
      <EventChecklist />
    </FormDialog>
  );
}

export function AddWebhookButton() {
  const [secret, setSecret] = useState<string | null>(null);
  return (
    <>
      <WebhookForm onCreated={setSecret} />
      <SecretDialog secret={secret} onClose={() => setSecret(null)} title="Webhook created — signing secret" />
    </>
  );
}

export function WebhookRowActions({ endpoint }: { endpoint: Endpoint }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | "rotate" | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  return (
    <>
      <RowActions
        label={`Actions for ${endpoint.name}`}
        items={[
          { label: "Edit", icon: Pencil, onSelect: () => setEditing(true) },
          { label: endpoint.enabled ? "Disable" : "Enable", icon: endpoint.enabled ? PowerOff : Power, run: () => setWebhookEnabled(endpoint.id, !endpoint.enabled) },
          { label: "Rotate secret…", icon: KeyRound, onSelect: () => setConfirm("rotate") },
          "separator",
          { label: "Delete…", icon: Trash2, destructive: true, onSelect: () => setConfirm("delete") },
        ]}
      />
      {editing && <WebhookForm endpoint={endpoint} open={editing} onOpenChange={setEditing} />}
      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "delete" ? `Delete ${endpoint.name}?` : `Rotate the secret for ${endpoint.name}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "delete" ? "Its delivery history is deleted too. Rules that call this webhook will no longer reach anyone." : "The current secret stops working immediately; update the receiver with the new one."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const which = confirm;
                setConfirm(null);
                if (which === "delete") {
                  const r = await deleteWebhook(endpoint.id);
                  if (r.ok) toast.success(r.message);
                  else toast.error(r.error);
                  router.refresh();
                } else {
                  const r = await rotateWebhookSecret(endpoint.id);
                  if (r.ok) setSecret(r.data.secret);
                  else toast.error(r.error);
                }
              }}
            >
              {confirm === "delete" ? "Delete" : "Rotate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <SecretDialog secret={secret} onClose={() => setSecret(null)} title="New signing secret" />
    </>
  );
}

export function RedeliverButton({ deliveryId }: { deliveryId: string }) {
  return (
    <RowActions label="Delivery actions" items={[{ label: "Retry now", icon: RotateCw, run: () => redeliverWebhook(deliveryId) }]} />
  );
}
