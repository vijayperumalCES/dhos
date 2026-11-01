"use client";

import { FlaskConical, Pencil, Plus, Power, PowerOff, Archive, ArchiveRestore } from "lucide-react";
import { useState, useTransition } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { RowActions } from "@/components/common/row-actions";
import { SelectField, TextareaField, TextField, type Option } from "@/components/forms/fields";
import { CheckboxField, FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { archiveRule, dryRunRule, saveRule, setRuleEnabled, type DryRunResult } from "@/lib/actions/automation";
import { EVENTS, EVENT_TYPES, isEventType } from "@/lib/automation/events";
import { OPERATOR_LABELS, OPERATORS, RECIPIENT_KINDS, RECIPIENT_LABELS, SEVERITIES } from "@/lib/automation/rules";
import { NONE } from "@/lib/validation/common";
import { definitionToRuleForm, ruleFormSchema, type RuleFormInput } from "@/lib/validation/automation";

type RuleRow = { id: string; name: string; description: string | null; trigger_event: string; conditions: unknown; actions: unknown; enabled: boolean; archived_at: string | null };
type Options = { roles: Option[]; members: Option[]; webhooks: Option[] };

const BLANK: RuleFormInput = {
  name: "",
  description: "",
  triggerEvent: "project.health_changed",
  c1Field: NONE,
  c1Op: "eq",
  c1Value: "",
  c2Field: NONE,
  c2Op: "eq",
  c2Value: "",
  c3Field: NONE,
  c3Op: "eq",
  c3Value: "",
  notifyEnabled: true,
  notifyTo: "project_manager",
  notifyRoleKey: NONE,
  notifyMembershipId: NONE,
  notifyTitle: "",
  notifyMessage: "",
  notifySeverity: "info",
  webhookEndpointId: NONE,
};

function ConditionRows() {
  const { control } = useFormContext<RuleFormInput>();
  const trigger = useWatch({ control, name: "triggerEvent" });
  const fields = isEventType(trigger) ? EVENTS[trigger].fields : [];
  const fieldOptions: Option[] = [{ value: NONE, label: "— no condition —" }, ...fields.map((f) => ({ value: f.key, label: f.label }))];
  const hints = fields.filter((f) => "values" in f && f.values).map((f) => `${f.label}: ${(f as { values: readonly string[] }).values.join(", ")}`);
  return (
    <fieldset className="space-y-3 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">Only when (all must hold)</legend>
      {([1, 2, 3] as const).map((n) => (
        <div key={n} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr]">
          <SelectField name={`c${n}Field`} label={`Condition ${n}`} options={fieldOptions} />
          <SelectField name={`c${n}Op`} label="Operator" options={OPERATORS.map((o) => ({ value: o, label: OPERATOR_LABELS[o] }))} />
          <TextField name={`c${n}Value`} label="Value" />
        </div>
      ))}
      {hints.length > 0 && <p className="text-xs text-muted-foreground">{hints.join(" · ")}</p>}
    </fieldset>
  );
}

function ActionFields({ options }: { options: Options }) {
  const { control } = useFormContext<RuleFormInput>();
  const enabled = useWatch({ control, name: "notifyEnabled" });
  const to = useWatch({ control, name: "notifyTo" });
  return (
    <fieldset className="space-y-3 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">Then</legend>
      <CheckboxField name="notifyEnabled" label="Send an in-app notification" />
      {enabled && (
        <div className="space-y-3 pl-6">
          <SelectField name="notifyTo" label="To" options={RECIPIENT_KINDS.map((k) => ({ value: k, label: RECIPIENT_LABELS[k] }))} description="People who can't read the project are skipped." />
          {to === "role" && <SelectField name="notifyRoleKey" label="Role" options={[{ value: NONE, label: "Choose a role…" }, ...options.roles]} />}
          {to === "member" && <SelectField name="notifyMembershipId" label="Person" options={[{ value: NONE, label: "Choose a person…" }, ...options.members]} />}
          <TextField name="notifyTitle" label="Title" placeholder="{{code}} turned {{to}}" description="Use {{field}} to insert a value from the event." />
          <TextareaField name="notifyMessage" label="Message (optional)" rows={2} />
          <SelectField name="notifySeverity" label="Severity" options={SEVERITIES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} />
        </div>
      )}
      <SelectField name="webhookEndpointId" label="Also call a webhook" options={[{ value: NONE, label: "No webhook" }, ...options.webhooks]} />
    </fieldset>
  );
}

function DryRunPanel() {
  const { getValues } = useFormContext<RuleFormInput>();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: true; data: DryRunResult } | { ok: false; error: string } | null>(null);
  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Dry run</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await dryRunRule(getValues());
              setResult(r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error });
            })
          }
        >
          <FlaskConical className="size-4" /> {pending ? "Checking…" : "Test on recent events"}
        </Button>
      </div>
      {result === null && <p className="text-xs text-muted-foreground">Checks the conditions against recent events you can see. Nothing is sent or saved.</p>}
      {result?.ok === false && <p className="text-sm text-destructive">{result.error}</p>}
      {result?.ok && (
        <div className="text-sm" aria-live="polite">
          <p>
            Would have matched <strong>{result.data.matched.length}</strong> of {result.data.considered} recent event(s) of this type.
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
            {result.data.matched.map((m) => (
              <li key={m.id}>{m.summary}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RuleForm({ rule, options, open, onOpenChange }: { rule?: RuleRow; options: Options; open?: boolean; onOpenChange?: (o: boolean) => void }) {
  return (
    <FormDialog<RuleFormInput>
      wide
      open={open}
      onOpenChange={onOpenChange}
      trigger={
        rule ? undefined : (
          <Button size="sm">
            <Plus className="size-4" /> New rule
          </Button>
        )
      }
      title={rule ? `Edit ${rule.name}` : "New rule"}
      description="Rules react to events after they happen. A rule never changes data; it notifies people or calls a webhook, at most once per event. New rules start off."
      submitLabel={rule ? "Save rule" : "Create rule"}
      schema={ruleFormSchema}
      defaultValues={rule ? definitionToRuleForm(rule) : BLANK}
      onSubmit={(v) => saveRule(rule?.id ?? null, v)}
    >
      <TextField name="name" label="Name" required />
      <TextareaField name="description" label="Description" rows={2} />
      <SelectField name="triggerEvent" label="When this happens" required options={EVENT_TYPES.map((t) => ({ value: t, label: EVENTS[t].label }))} />
      <ConditionRows />
      <ActionFields options={options} />
      <DryRunPanel />
    </FormDialog>
  );
}

export function NewRuleButton({ options }: { options: Options }) {
  return <RuleForm options={options} />;
}

export function RuleRowActions({ rule, options }: { rule: RuleRow; options: Options }) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <RowActions
        label={`Actions for ${rule.name}`}
        items={[
          !rule.archived_at && { label: "Edit", icon: Pencil, onSelect: () => setEditing(true) },
          !rule.archived_at && { label: rule.enabled ? "Turn off" : "Turn on", icon: rule.enabled ? PowerOff : Power, run: () => setRuleEnabled(rule.id, !rule.enabled) },
          "separator",
          { label: rule.archived_at ? "Restore" : "Archive", icon: rule.archived_at ? ArchiveRestore : Archive, run: () => archiveRule(rule.id, !rule.archived_at) },
        ]}
      />
      {editing && <RuleForm rule={rule} options={options} open={editing} onOpenChange={setEditing} />}
    </>
  );
}
