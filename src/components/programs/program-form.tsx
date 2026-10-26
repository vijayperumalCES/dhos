"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { applyServerErrors, FormError, SelectField, TextareaField, TextField, type Option } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { saveProgram } from "@/lib/actions/programs";
import { NONE } from "@/lib/validation/common";
import { programSchema } from "@/lib/validation/work";

type Values = z.input<typeof programSchema>;

export function ProgramForm({ programId, defaultValues, members }: { programId?: string; defaultValues?: Partial<Values>; members: Option[] }) {
  const router = useRouter();
  const form = useForm<Values>({
    resolver: zodResolver(programSchema) as never,
    defaultValues: { code: "", name: "", description: "", ownerId: NONE, ...defaultValues },
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
            const result = await saveProgram(programId ?? null, form.getValues());
            if (result.ok) {
              toast.success(result.message);
              router.push(`/programs/${result.data.id}`);
            } else setError(applyServerErrors(form, result));
          }),
        )}
      >
        <FormError message={error} />
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <TextField name="code" label="Program code" placeholder="CONTOSO-DX" required autoCapitalize="characters" />
            <TextField name="name" label="Name" required />
            <SelectField name="ownerId" label="Program owner" options={[{ value: NONE, label: "Unassigned" }, ...members]} />
            <TextareaField name="description" label="Description" className="sm:col-span-2" />
          </CardContent>
        </Card>
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : programId ? "Save changes" : "Create program"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
