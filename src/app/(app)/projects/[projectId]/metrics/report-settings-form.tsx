"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormError } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveReportSettings } from "@/lib/actions/metrics";

export function ReportSettingsForm({ projectId, initial }: { projectId: string; initial: { weekly: boolean; monthly: boolean; recipients: string[] } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [weekly, setWeekly] = useState(initial.weekly);
  const [monthly, setMonthly] = useState(initial.monthly);
  const [recipients, setRecipients] = useState(initial.recipients.join("\n"));

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const r = await saveReportSettings({ projectId, weekly, monthly, recipients });
          if (r.ok) {
            toast.success(r.message);
            router.refresh();
          } else setError(r.fieldErrors?.recipients?.[0] ?? r.error);
        });
      }}
    >
      <FormError message={error} />
      <div className="space-y-2">
        <Label htmlFor="report-recipients">Recipients</Label>
        <Textarea id="report-recipients" rows={4} value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="One address per line. Customers can be included." />
        <p className="text-xs text-muted-foreground">Up to 20 addresses. Anyone on this list receives the figures, including customers you add.</p>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox checked={weekly} onCheckedChange={(v) => setWeekly(v === true)} /> Weekly, every Monday for the week before
        </Label>
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox checked={monthly} onCheckedChange={(v) => setMonthly(v === true)} /> Monthly, on the 1st for the month before
        </Label>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
