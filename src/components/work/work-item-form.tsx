"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { applyServerErrors, FormError, SelectField, TextareaField, TextField, type Option } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { createWorkItem, updateWorkItem } from "@/lib/actions/work";
import {
  ALLOWED_PARENTS,
  PRIORITIES,
  PRIORITY_LABELS,
  SEVERITIES,
  SEVERITY_LABELS,
  TYPE_LABELS,
  WORK_ITEM_TYPES,
  type WorkItemType,
} from "@/lib/domain/work";
import { NONE } from "@/lib/validation/common";
import { workItemSchema, type WorkItemFormInput } from "@/lib/validation/work";

export type WorkFormOptions = {
  states: (Option & { category: string; isDefault: boolean })[];
  sprints: Option[];
  parents: (Option & { type: WorkItemType })[];
  members: Option[];
  teams: Option[];
};

export function WorkItemForm({
  projectId,
  itemId,
  options,
  defaultValues,
}: {
  projectId: string;
  itemId?: string;
  options: WorkFormOptions;
  defaultValues: WorkItemFormInput;
}) {
  const router = useRouter();
  const form = useForm<WorkItemFormInput>({ resolver: zodResolver(workItemSchema) as never, defaultValues });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const type = useWatch({ control: form.control, name: "type" }) as WorkItemType;
  const blocked = useWatch({ control: form.control, name: "blocked" });
  const none = (label: string): Option => ({ value: NONE, label });
  const allowedParents = options.parents.filter((p) => ALLOWED_PARENTS[type].includes(p.type) && p.value !== itemId);

  return (
    <FormProvider {...form}>
      <form
        noValidate
        className="space-y-6"
        onSubmit={form.handleSubmit(() =>
          startTransition(async () => {
            setError(null);
            const values = form.getValues();
            const result = itemId ? await updateWorkItem(itemId, values) : await createWorkItem(projectId, values);
            if (result.ok) {
              toast.success(result.message);
              router.push(`/projects/${projectId}/items/${result.data.key}`);
            } else setError(applyServerErrors(form, result));
          }),
        )}
      >
        <FormError message={error} />
        <Card>
          <CardHeader>
            <CardTitle>What</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <SelectField name="type" label="Type" required options={WORK_ITEM_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }))} />
            <SelectField
              name="parentId"
              label="Parent"
              description={ALLOWED_PARENTS[type].length ? `A ${TYPE_LABELS[type].toLowerCase()} can sit under: ${ALLOWED_PARENTS[type].map((t) => TYPE_LABELS[t]).join(", ")}.` : "Epics are top level."}
              options={[none("No parent"), ...allowedParents]}
            />
            <TextField name="title" label="Title" required className="sm:col-span-2" />
            <TextareaField name="description" label="Description" rows={5} className="sm:col-span-2" />
            <TextareaField name="acceptanceCriteria" label="Acceptance criteria" rows={4} className="sm:col-span-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Planning</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <SelectField name="stateId" label="State" required options={options.states} />
            <SelectField name="priority" label="Priority" required options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))} />
            {(type === "bug" || type === "incident") && (
              <SelectField name="severity" label="Severity" options={[none("Not set"), ...SEVERITIES.map((s) => ({ value: s, label: SEVERITY_LABELS[s] }))]} />
            )}
            <SelectField name="assigneeId" label="Assignee" options={[none("Unassigned"), ...options.members]} />
            <SelectField name="reviewerId" label="Reviewer" options={[none("None"), ...options.members]} />
            <SelectField name="sprintId" label="Sprint" options={[none("Backlog"), ...options.sprints]} />
            <TextField name="storyPoints" label="Story points" inputMode="decimal" />
            <TextField name="estimateHours" label="Estimate (hours)" inputMode="decimal" />
            <TextField name="businessValue" label="Business value (0–100)" inputMode="numeric" />
            <TextField name="startDate" label="Start date" type="date" />
            <TextField name="dueDate" label="Due date" type="date" />
            <SelectField name="teamId" label="Team" options={[none("No team"), ...options.teams]} />
            <TextField name="labels" label="Labels" description="Comma-separated." className="sm:col-span-2" />
            <TextField name="component" label="Component" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Blockers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Controller
              control={form.control}
              name="blocked"
              render={({ field }) => (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
                  This item is blocked
                </label>
              )}
            />
            {blocked && <TextareaField name="blockedReason" label="What is blocking it?" rows={2} required />}
            <p className="text-xs text-muted-foreground">Dependencies on other items are managed on the item page after saving.</p>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : itemId ? "Save changes" : "Create item"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
