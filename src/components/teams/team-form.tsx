"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";

import { applyServerErrors, FormError, SelectField, TextareaField, TextField, type Option } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createTeam, updateTeam } from "@/lib/actions/teams";
import { NONE } from "@/lib/validation/common";
import { teamFormSchema, type TeamFormInput } from "@/lib/validation/organization";

export function TeamForm({ teamId, defaultValues, members }: { teamId?: string; defaultValues?: Partial<TeamFormInput>; members: Option[] }) {
  const router = useRouter();
  const form = useForm<TeamFormInput>({
    resolver: zodResolver(teamFormSchema) as never,
    defaultValues: { name: "", description: "", leadMembershipId: NONE, ...defaultValues },
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <FormProvider {...form}>
      <form
        noValidate
        className="space-y-6"
        onSubmit={form.handleSubmit(() =>
          startTransition(async () => {
            setError(null);
            const values = form.getValues();
            const result = teamId ? await updateTeam(teamId, values) : await createTeam(values);
            if (result.ok) {
              toast.success(result.message);
              router.push(`/teams/${result.data.id}`);
            } else setError(applyServerErrors(form, result));
          }),
        )}
      >
        <FormError message={error} />
        <Card>
          <CardContent className="grid gap-4">
            <TextField name="name" label="Team name" required />
            <SelectField name="leadMembershipId" label="Team lead" options={[{ value: NONE, label: "No lead" }, ...members]} />
            <TextareaField name="description" label="Description" />
          </CardContent>
        </Card>
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : teamId ? "Save changes" : "Create team"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
