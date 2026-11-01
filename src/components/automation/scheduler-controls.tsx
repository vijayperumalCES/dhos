"use client";

import { Pencil, Play, Timer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { RowActions } from "@/components/common/row-actions";
import { TextField } from "@/components/forms/fields";
import { CheckboxField, FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { runJobNow, runSchedulerNow, updateJob } from "@/lib/actions/automation";
import { jobSchema, type JobInput } from "@/lib/validation/automation";
import { useState } from "react";

export function RunSchedulerButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await runSchedulerNow();
          if (r.ok) toast.success(r.message);
          else toast.error(r.error);
          router.refresh();
        })
      }
    >
      <Timer className="size-4" /> {pending ? "Working…" : "Process now"}
    </Button>
  );
}

export function JobRowActions({ job, label }: { job: { id: string; enabled: boolean; interval_minutes: number }; label: string }) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <RowActions
        label={`Actions for ${label}`}
        items={[
          { label: "Run now", icon: Play, run: () => runJobNow(job.id) },
          { label: "Change schedule", icon: Pencil, onSelect: () => setEditing(true) },
        ]}
      />
      {editing && (
        <FormDialog<JobInput>
          open={editing}
          onOpenChange={setEditing}
          title={`Schedule: ${label}`}
          description="Jobs run when the scheduler ticks after they are due. Turning a job back on makes it due immediately."
          schema={jobSchema}
          defaultValues={{ enabled: job.enabled, intervalMinutes: String(job.interval_minutes) }}
          onSubmit={(v) => updateJob(job.id, v)}
        >
          <CheckboxField name="enabled" label="Enabled" />
          <TextField name="intervalMinutes" label="Run every (minutes)" inputMode="numeric" description="Between 5 minutes and 7 days (10080)." />
        </FormDialog>
      )}
    </>
  );
}
