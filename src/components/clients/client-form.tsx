"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";

import { applyServerErrors, FormError, SelectField, TextareaField, TextField, type Option } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient, updateClient } from "@/lib/actions/clients";
import { NONE } from "@/lib/validation/common";
import { clientFormSchema, type ClientFormInput } from "@/lib/validation/organization";

export function ClientForm({ clientId, defaultValues, members }: { clientId?: string; defaultValues?: Partial<ClientFormInput>; members: Option[] }) {
  const router = useRouter();
  const form = useForm<ClientFormInput>({
    resolver: zodResolver(clientFormSchema) as never,
    defaultValues: {
      name: "",
      code: "",
      industry: "",
      website: "",
      accountOwnerMembershipId: NONE,
      confidentiality: "standard",
      notes: "",
      ...defaultValues,
    },
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
            const result = clientId ? await updateClient(clientId, values) : await createClient(values);
            if (result.ok) {
              toast.success(result.message);
              router.push(`/clients/${result.data.id}`);
            } else setError(applyServerErrors(form, result));
          }),
        )}
      >
        <FormError message={error} />
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <TextField name="name" label="Client name" required className="sm:col-span-2" />
            <TextField name="code" label="Client code" placeholder="CONTOSO" />
            <TextField name="industry" label="Industry" />
            <TextField name="website" label="Website" type="url" placeholder="https://" />
            <SelectField name="accountOwnerMembershipId" label="Account owner" options={[{ value: NONE, label: "Unassigned" }, ...members]} />
            <SelectField
              name="confidentiality"
              label="Confidentiality"
              required
              description="Recorded for policy. Confidential-client access restrictions are enforced from Phase 4."
              options={[
                { value: "standard", label: "Standard" },
                { value: "confidential", label: "Confidential" },
              ]}
            />
            <TextareaField name="notes" label="Notes" className="sm:col-span-2" />
          </CardContent>
        </Card>
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : clientId ? "Save changes" : "Create client"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
