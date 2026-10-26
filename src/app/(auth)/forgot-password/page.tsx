"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import type { z } from "zod";

import { applyServerErrors, FormError, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { requestPasswordReset } from "@/lib/actions/auth";
import { forgotPasswordSchema } from "@/lib/validation/auth";

export default function ForgotPasswordPage() {
  const form = useForm<z.input<typeof forgotPasswordSchema>>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="text-sm text-muted-foreground">We&apos;ll email you a link to choose a new password.</p>
      </div>
      {sent ? (
        <div role="status" className="space-y-2 rounded-md border p-4 text-sm">
          <p className="font-medium">{sent}</p>
          <p className="text-muted-foreground">
            Open the link in <strong>this browser</strong> — for security it only works where it was requested. The
            link expires after one hour.
          </p>
        </div>
      ) : (
        <FormProvider {...form}>
          <form
            noValidate
            onSubmit={form.handleSubmit((values) =>
              startTransition(async () => {
                setError(null);
                const result = await requestPasswordReset(values);
                if (result.ok) setSent(result.message ?? "Check your email.");
                else setError(applyServerErrors(form, result));
              }),
            )}
          >
            <FieldGroup>
              <FormError message={error} />
              <TextField name="email" label="Email" type="email" autoComplete="email" required />
              <Button type="submit" disabled={pending} className="w-full">
                {pending ? "Sending…" : "Email me a reset link"}
              </Button>
            </FieldGroup>
          </form>
        </FormProvider>
      )}
      <p className="text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
