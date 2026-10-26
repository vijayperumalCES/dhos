"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import type { z } from "zod";

import { applyServerErrors, FormError, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { signIn } from "@/lib/actions/auth";
import { signInSchema } from "@/lib/validation/auth";

export function LoginForm({ next }: { next?: string }) {
  const form = useForm<z.input<typeof signInSchema>>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
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
            const result = await signIn(values, next);
            if (result) setError(applyServerErrors(form, result));
          }),
        )}
      >
        <FieldGroup>
          <FormError message={error} />
          <TextField name="email" label="Email" type="email" autoComplete="email" required />
          <TextField name="password" label="Password" type="password" autoComplete="current-password" required />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </FieldGroup>
      </form>
    </FormProvider>
  );
}
