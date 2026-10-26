"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";

import { applyServerErrors, FormError, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { updateOrganizationSettings } from "@/lib/actions/organization";
import { organizationSettingsSchema } from "@/lib/validation/organization";

type Values = { name: string; timezone: string; currencyCode: string; healthStaleAfterDays: string };

export function SettingsForm({ defaultValues }: { defaultValues: Values }) {
  const router = useRouter();
  const form = useForm<Values>({ resolver: zodResolver(organizationSettingsSchema) as never, defaultValues });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <FormProvider {...form}>
      <form
        noValidate
        className="max-w-2xl space-y-6"
        onSubmit={form.handleSubmit(() =>
          startTransition(async () => {
            setError(null);
            const result = await updateOrganizationSettings(form.getValues());
            if (result.ok) {
              toast.success(result.message);
              router.refresh();
            } else setError(applyServerErrors(form, result));
          }),
        )}
      >
        <FormError message={error} />
        <Card>
          <CardHeader>
            <CardTitle>Organization</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <TextField name="name" label="Organization name" required className="sm:col-span-2" />
            <TextField name="timezone" label="Time zone" description="IANA name, e.g. Asia/Kolkata. Used by reporting from Phase 3." required />
            <TextField name="currencyCode" label="Currency" description="ISO 4217 code. Used by Financials (Phase 5)." required />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Delivery thresholds</CardTitle>
            <CardDescription>Used by the Command Center.</CardDescription>
          </CardHeader>
          <CardContent>
            <TextField
              name="healthStaleAfterDays"
              label="Health rating goes stale after (days)"
              type="number"
              min={1}
              max={90}
              description="Projects whose health was last confirmed longer ago than this are flagged."
              required
            />
          </CardContent>
        </Card>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </form>
    </FormProvider>
  );
}
