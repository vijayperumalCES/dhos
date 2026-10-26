"use client";

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { BurndownPoint } from "@/lib/domain/work";

const axis = { tick: { fill: "var(--muted-foreground)", fontSize: 11 }, tickLine: false, axisLine: false } as const;

function TooltipBox({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number | null; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-sm">
      <p className="mb-1 font-medium">{label}</p>
      {payload
        .filter((p) => p.value !== null && p.value !== undefined)
        .map((p) => (
          <p key={p.name} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden />
            {p.name}: <span className="tabular-nums">{p.value}</span>
          </p>
        ))}
    </div>
  );
}

/** Remaining points per day against the ideal line; legend + tooltip so colour is never the only cue. */
export function BurndownChart({ points, ariaLabel }: { points: BurndownPoint[]; ariaLabel: string }) {
  const data = points.map((p) => ({ ...p, label: new Date(`${p.day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) }));
  return (
    <div role="img" aria-label={ariaLabel} className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={16} />
          <YAxis {...axis} allowDecimals={false} width={40} />
          <Tooltip content={<TooltipBox />} />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
          <Line name="Ideal" dataKey="ideal" stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line name="Scope" dataKey="scope" stroke="var(--chart-4)" strokeWidth={1.5} dot={false} connectNulls={false} isAnimationActive={false} />
          <Line name="Remaining" dataKey="remaining" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function VelocityChart({ sprints, ariaLabel }: { sprints: { name: string; committed: number; completed: number }[]; ariaLabel: string }) {
  return (
    <div role="img" aria-label={ariaLabel} className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sprints} margin={{ top: 8, right: 12, bottom: 0, left: -12 }} barGap={2}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="name" {...axis} />
          <YAxis {...axis} allowDecimals={false} width={40} />
          <Tooltip content={<TooltipBox />} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar name="Committed" dataKey="committed" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          <Bar name="Completed" dataKey="completed" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
