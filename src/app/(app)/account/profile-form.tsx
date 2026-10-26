"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { updateMyProfile } from "@/lib/actions/organization";

export function ProfileForm({ displayName }: { displayName: string }) {
  const router = useRouter();
  const [value, setValue] = useState(displayName);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex max-w-md flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          setError(null);
          const r = await updateMyProfile({ displayName: value });
          if (r.ok) {
            toast.success(r.message);
            router.refresh();
          } else setError(r.fieldErrors?._form?.[0] ?? r.error);
        });
      }}
    >
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor="display-name">Display name</FieldLabel>
        <Input id="display-name" value={value} onChange={(e) => setValue(e.target.value)} maxLength={120} />
        {error && <FieldError>{error}</FieldError>}
      </Field>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
