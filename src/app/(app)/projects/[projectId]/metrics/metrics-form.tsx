"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FormError } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveMetricEntries } from "@/lib/actions/metrics";
import { ENTERABLE_METRICS, formatMetricValue, METRIC_GROUPS, type MetricValue } from "@/lib/domain/delivery-metrics";

/** One week of metrics. Blank fields fall back to the value Stride works out itself, where it can. */
export function MetricsForm({ projectId, week, manual, values }: { projectId: string; week: string; manual: Record<string, number>; values: MetricValue[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [text, setText] = useState<Record<string, string>>(() => Object.fromEntries(ENTERABLE_METRICS.map((d) => [d.key, manual[d.key] === undefined ? "" : String(manual[d.key])])));
  const auto = new Map(values.filter((v) => v.source === "auto").map((v) => [v.key, v.value]));

  const submit = () =>
    start(async () => {
      setError(null);
      setFieldErrors({});
      // Only what this person changed, so saving never wipes a value a teammate entered since the page loaded.
      const changed = Object.fromEntries(Object.entries(text).filter(([k, v]) => v.trim() !== (manual[k] === undefined ? "" : String(manual[k]))));
      if (Object.keys(changed).length === 0) {
        toast.info("Nothing to save.");
        return;
      }
      const r = await saveMetricEntries({ projectId, week, values: changed });
      if (r.ok) {
        toast.success(r.message);
        router.refresh();
        return;
      }
      setError(r.error);
      setFieldErrors(Object.fromEntries(Object.entries(r.fieldErrors ?? {}).map(([k, v]) => [k.replace(/^values\./, ""), v[0] ?? ""])));
    });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <FormError message={error} />
      <div className="grid gap-4 lg:grid-cols-2">
        {METRIC_GROUPS.map((group) => {
          const defs = ENTERABLE_METRICS.filter((d) => d.group === group);
          return (
            <Card key={group}>
              <CardHeader>
                <CardTitle className="text-base">{group}</CardTitle>
                {group === "Metrics collection and reporting" && <CardDescription>The share of metrics reported is worked out from the rest and shown in the report.</CardDescription>}
              </CardHeader>
              <CardContent className="space-y-3">
                {defs.length === 0 && <p className="text-sm text-muted-foreground">Worked out automatically.</p>}
                {defs.map((d) => {
                  const a = auto.get(d.key);
                  const id = `metric-${d.key}`;
                  return (
                    <div key={d.key} className="grid gap-1 sm:grid-cols-[1fr_9rem] sm:items-center sm:gap-3">
                      <div>
                        <Label htmlFor={id}>{d.label}</Label>
                        {d.hint && <p className="text-xs text-muted-foreground">{d.hint}</p>}
                      </div>
                      <div>
                        <Input
                          id={id}
                          inputMode="decimal"
                          value={text[d.key]}
                          placeholder={a !== undefined && a !== null ? `Stride: ${formatMetricValue(d, a)}` : ""}
                          aria-invalid={!!fieldErrors[d.key]}
                          onChange={(e) => setText((t) => ({ ...t, [d.key]: e.target.value }))}
                        />
                        {fieldErrors[d.key] && <p className="mt-1 text-xs text-destructive">{fieldErrors[d.key]}</p>}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save week"}
      </Button>
    </form>
  );
}
