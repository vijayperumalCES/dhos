"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { applyServerErrors, FormError, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { setPassword } from "@/lib/actions/auth";
import { setPasswordSchema } from "@/lib/validation/auth";

export function SetPasswordForm({ submitLabel = "Save password", redirectTo }: { submitLabel?: string; redirectTo?: string }) {
  const router = useRouter();
  const form = useForm<z.input<typeof setPasswordSchema>>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: { password: "", confirm: "" },
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <FormProvider {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit((values) =>
          startTransition(async () => {
            setError(null);
            const result = await setPassword(values);
            if (result.ok) {
              toast.success(result.message);
              form.reset();
              if (redirectTo) router.push(redirectTo);
            } else setError(applyServerErrors(form, result));
          }),
        )}
      >
        <FieldGroup>
          <FormError message={error} />
          <TextField
            name="password"
            label="New password"
            type="password"
            autoComplete="new-password"
            description="At least 10 characters with upper- and lowercase letters and a digit."
            required
          />
          <TextField name="confirm" label="Confirm new password" type="password" autoComplete="new-password" required />
          <Button type="submit" disabled={pending} className="self-start">
            {pending ? "Saving…" : submitLabel}
          </Button>
        </FieldGroup>
      </form>
    </FormProvider>
  );
}
