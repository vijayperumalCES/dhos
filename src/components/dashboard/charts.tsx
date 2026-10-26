"use client";

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Datum = { key: string; label: string; value: number };

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Datum }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-sm">
      <span className="font-medium">{d.label}</span>: <span className="tabular-nums">{d.value}</span>
    </div>
  );
}

/**
 * Horizontal bar chart. Single-series charts use one hue; the health chart passes the
 * reserved status colours, and every bar is direct-labelled so colour is never the only cue.
 */
export function HorizontalBars({ data, colors, ariaLabel }: { data: Datum[]; colors?: Record<string, string>; ariaLabel: string }) {
  const height = Math.max(120, data.length * 34 + 8);
  return (
    <div role="img" aria-label={ariaLabel} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 32, bottom: 0, left: 0 }} barCategoryGap={6}>
          <XAxis type="number" hide allowDecimals={false} domain={[0, (max: number) => Math.max(1, max)]} />
          <YAxis
            type="category"
            dataKey="label"
            width={104}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          />
          <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltip />} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.key} fill={colors?.[d.key] ?? "var(--chart-1)"} />
            ))}
            <LabelList dataKey="value" position="right" style={{ fill: "var(--foreground)", fontSize: 12 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
