import { Info } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { KpiDefinition } from "@/lib/domain/kpis";
import { cn } from "@/lib/utils";

/** Stat tile: every number carries its definition, formula, source, period and limitations. */
export function KpiTile({
  kpi,
  value,
  hint,
  tone = "default",
}: {
  kpi: KpiDefinition;
  value: number | string;
  hint?: string;
  tone?: "default" | "warning" | "critical";
}) {
  return (
    <Card className="gap-0 py-4">
      <CardContent className="px-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-muted-foreground">{kpi.name}</p>
          <KpiInfo kpi={kpi} />
        </div>
        <p
          className={cn(
            "mt-1 text-3xl font-semibold tabular-nums",
            tone === "critical" && Number(value) > 0 && "text-health-red",
            tone === "warning" && Number(value) > 0 && "text-health-amber",
          )}
        >
          {value}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{hint ?? kpi.period}</p>
      </CardContent>
    </Card>
  );
}

export function KpiInfo({ kpi }: { kpi: KpiDefinition }) {
  return (
    <Popover>
      <PopoverTrigger className="rounded text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label={`How "${kpi.name}" is calculated`}>
        <Info className="size-4" />
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-2 text-xs" align="end">
        <p className="text-sm font-medium">{kpi.name}</p>
        <p>{kpi.definition}</p>
        <dl className="space-y-1.5">
          <Row label="Formula" value={<code className="break-words">{kpi.formula}</code>} />
          <Row label="Source" value={kpi.sources.join(", ")} />
          <Row label="Period" value={kpi.period} />
          {kpi.threshold && <Row label="Threshold" value={kpi.threshold} />}
          <Row label="Freshness" value={kpi.freshness} />
          <Row label="Owner" value={kpi.owner} />
          <Row label="Limitations" value={kpi.limitations} />
        </dl>
      </PopoverContent>
    </Popover>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="font-medium text-foreground">{label}</dt>
      <dd className="text-muted-foreground">{value}</dd>
    </div>
  );
}
