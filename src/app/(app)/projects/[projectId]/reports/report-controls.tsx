"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, FilePlus2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { applyServerErrors, FormError, TextareaField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { publishStatusReport } from "@/lib/actions/status-reports";
import { statusReportSchema } from "@/lib/validation/work";

type Values = z.input<typeof statusReportSchema>;

export function NewReportForm({ projectId, periodStart, periodEnd }: { projectId: string; periodStart: string; periodEnd: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const initial: Values = { projectId, periodStart, periodEnd, summary: "", highlights: "", nextSteps: "", decisionsNeeded: "" };
  const form = useForm<Values>({ resolver: zodResolver(statusReportSchema) as never, defaultValues: initial });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <FilePlus2 className="size-4" /> New status report
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New status report</CardTitle>
        <CardDescription>
          Write the narrative. Health, milestones, sprint progress, blocked work and changes in the period are captured
          automatically from Stride when you publish. Published reports can&apos;t be edited.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FormProvider {...form}>
          <form
            noValidate
            onSubmit={form.handleSubmit(() =>
              startTransition(async () => {
                setError(null);
                const r = await publishStatusReport(form.getValues());
                if (r.ok) {
                  toast.success(r.message);
                  form.reset(initial);
                  setOpen(false);
                  router.refresh();
                } else setError(applyServerErrors(form, r));
              }),
            )}
          >
            <FieldGroup>
              <FormError message={error} />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField name="periodStart" label="Period start" type="date" required />
                <TextField name="periodEnd" label="Period end" type="date" required />
              </div>
              <TextareaField name="summary" label="Summary" rows={4} required />
              <TextareaField name="highlights" label="Highlights" rows={3} />
              <TextareaField name="nextSteps" label="Next steps" rows={3} />
              <TextareaField name="decisionsNeeded" label="Decisions needed" rows={2} />
              <div className="flex gap-2">
                <Button type="submit" disabled={pending}>
                  {pending ? "Publishing…" : "Publish report"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              </div>
            </FieldGroup>
          </form>
        </FormProvider>
      </CardContent>
    </Card>
  );
}

export function CopyMarkdownButton({ markdown }: { markdown: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(markdown);
          toast.success("Report copied as Markdown.");
        } catch {
          toast.error("Your browser blocked clipboard access.");
        }
      }}
    >
      <Copy className="size-4" /> Copy as Markdown
    </Button>
  );
}
