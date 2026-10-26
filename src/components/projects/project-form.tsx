"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";

import { applyServerErrors, FormError, SelectField, TextareaField, TextField, type Option } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createProject, updateProject } from "@/lib/actions/projects";
import { METHODOLOGY_LABELS, PROJECT_METHODOLOGIES } from "@/lib/domain/project-lifecycle";
import { NONE } from "@/lib/validation/common";
import { projectFormSchema, type ProjectFormInput } from "@/lib/validation/project";

type Props = {
  projectId?: string;
  defaultValues?: Partial<ProjectFormInput>;
  clients: Option[];
  members: Option[];
  teams: Option[];
  programs: Option[];
};

const EMPTY: ProjectFormInput = {
  code: "",
  name: "",
  description: "",
  clientId: NONE,
  programId: NONE,
  sponsorName: "",
  projectManagerId: NONE,
  deliveryOwnerId: NONE,
  primaryTeamId: NONE,
  methodology: "scrum",
  plannedStartDate: "",
  targetEndDate: "",
  objectives: "",
  scopeSummary: "",
  assumptions: "",
  projectConstraints: "",
};

export function ProjectForm({ projectId, defaultValues, clients, members, teams, programs }: Props) {
  const router = useRouter();
  const form = useForm<ProjectFormInput>({
    resolver: zodResolver(projectFormSchema) as never,
    defaultValues: { ...EMPTY, ...defaultValues },
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const none = (label: string): Option => ({ value: NONE, label });

  return (
    <FormProvider {...form}>
      <form
        noValidate
        className="space-y-6"
        onSubmit={form.handleSubmit(() =>
          startTransition(async () => {
            setError(null);
            const values = form.getValues();
            const result = projectId ? await updateProject(projectId, values) : await createProject(values);
            if (result.ok) {
              toast.success(result.message);
              router.push(`/projects/${result.data.id}`);
            } else setError(applyServerErrors(form, result));
          }),
        )}
      >
        <FormError message={error} />
        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
            <CardDescription>How the project is identified across reports.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <TextField name="code" label="Project code" placeholder="PAY-01" required autoCapitalize="characters" />
            <TextField name="name" label="Project name" required />
            <TextareaField name="description" label="Description" className="sm:col-span-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ownership</CardTitle>
            <CardDescription>
              The project manager and delivery owner can see this project even without portfolio-wide access.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <SelectField name="clientId" label="Client" options={[none("Internal / no client"), ...clients]} />
            <TextField name="sponsorName" label="Sponsor" placeholder="e.g. CFO, Contoso Bank" />
            <SelectField name="projectManagerId" label="Project manager" options={[none("Unassigned"), ...members]} />
            <SelectField name="deliveryOwnerId" label="Delivery owner" options={[none("Unassigned"), ...members]} />
            <SelectField name="primaryTeamId" label="Primary team" options={[none("No team"), ...teams]} />
            <SelectField name="programId" label="Program" options={[none("Not in a program"), ...programs]} />
            <SelectField
              name="methodology"
              label="Methodology"
              required
              options={PROJECT_METHODOLOGIES.map((m) => ({ value: m, label: METHODOLOGY_LABELS[m] }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Schedule</CardTitle>
            <CardDescription>
              Project-level dates. Milestones and baselines arrive in Phase 2. Lifecycle status is changed from the
              project page, not here.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <TextField name="plannedStartDate" label="Planned start" type="date" />
            <TextField name="targetEndDate" label="Target end" type="date" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scope</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <TextareaField name="objectives" label="Objectives" />
            <TextareaField name="scopeSummary" label="Scope" />
            <TextareaField name="assumptions" label="Assumptions" />
            <TextareaField name="projectConstraints" label="Constraints" />
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : projectId ? "Save changes" : "Create project"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
