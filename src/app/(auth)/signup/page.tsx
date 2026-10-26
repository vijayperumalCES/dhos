"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import type { z } from "zod";

import { applyServerErrors, FormError, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { signUp } from "@/lib/actions/auth";
import { signUpSchema } from "@/lib/validation/auth";

export default function SignupPage() {
  const form = useForm<z.input<typeof signUpSchema>>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { displayName: "", email: "", password: "" },
  });
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  if (sent) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
        <p className="text-sm text-muted-foreground">
          We sent a confirmation link to <strong>{form.getValues("email")}</strong>. Open it to finish creating your
          account. Any invitations addressed to this email are accepted when you sign in.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          After signing up you can create an organization or join one you were invited to.
        </p>
      </div>
      <FormProvider {...form}>
        <form
          noValidate
          onSubmit={form.handleSubmit((values) =>
            startTransition(async () => {
              setError(null);
              const result = await signUp(values);
              if (!result) return;
              if (result.ok) setSent(true);
              else setError(applyServerErrors(form, result));
            }),
          )}
        >
          <FieldGroup>
            <FormError message={error} />
            <TextField name="displayName" label="Full name" autoComplete="name" required />
            <TextField name="email" label="Work email" type="email" autoComplete="email" required />
            <TextField
              name="password"
              label="Password"
              type="password"
              autoComplete="new-password"
              description="At least 10 characters with upper- and lowercase letters and a digit."
              required
            />
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Creating account…" : "Create account"}
            </Button>
          </FieldGroup>
        </form>
      </FormProvider>
      <p className="text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
