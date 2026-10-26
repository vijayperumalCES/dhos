"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { applyServerErrors, FormError, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { createOrganization } from "@/lib/actions/organization";
import { createOrganizationSchema } from "@/lib/validation/organization";

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function CreateOrganizationForm() {
  const router = useRouter();
  const form = useForm<z.input<typeof createOrganizationSchema>>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: { name: "", slug: "" },
  });
  const slugEdited = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <FormProvider {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit((values) =>
          startTransition(async () => {
            setError(null);
            const result = await createOrganization(values);
            if (result.ok) {
              toast.success(result.message);
              router.push("/dashboard");
            } else setError(applyServerErrors(form, result));
          }),
        )}
      >
        <FieldGroup>
          <FormError message={error} />
          <TextField
            name="name"
            label="Organization name"
            required
            onChange={(e) => {
              if (!slugEdited.current) form.setValue("slug", slugify(e.target.value));
            }}
          />
          <TextField
            name="slug"
            onChange={() => (slugEdited.current = true)}
            label="Short identifier" description="Used in URLs and exports. Lowercase, digits and hyphens." required />
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create organization"}
          </Button>
        </FieldGroup>
      </form>
    </FormProvider>
  );
}
