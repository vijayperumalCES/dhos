import Link from "next/link";

import { SeverityBadge } from "@/components/agents/badges";
import { analysisOutputSchema, requirementsOutputSchema, type EvidenceRef } from "@/lib/ai/registry";

/** Renders a stored agent output. Unknown or malformed output is shown as nothing rather than guessed at. */
export function AgentOutput({ kind, output, evidence }: { kind: "analysis" | "requirements"; output: unknown; evidence: EvidenceRef[] }) {
  const notes = Array.isArray((output as { notes?: unknown } | null)?.notes) ? ((output as { notes: string[] }).notes) : [];
  const byKey = new Map(evidence.map((e) => [`${e.table}:${e.id}`, e]));

  if (kind === "requirements") {
    const parsed = requirementsOutputSchema.safeParse(output);
    if (!parsed.success) return <p className="text-sm text-muted-foreground">No output was recorded.</p>;
    const o = parsed.data;
    return (
      <div className="space-y-5 text-sm">
        <p>{o.summary}</p>
        {o.stories.length > 0 && (
          <ul className="space-y-3">
            {o.stories.map((s, i) => (
              <li key={i} className="rounded-lg border p-3">
                <p className="font-medium">
                  <span className="mr-2 text-xs font-normal text-muted-foreground uppercase">{s.type}</span>
                  {s.title}
                </p>
                {s.description && <p className="mt-1 text-muted-foreground">{s.description}</p>}
                {s.acceptanceCriteria.length > 0 && (
                  <ul className="mt-2 list-disc space-y-0.5 pl-5">
                    {s.acceptanceCriteria.map((c, j) => (
                      <li key={j}>{c}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
        <Bullets title="Open questions" items={o.openQuestions} />
        <Bullets title="Limitations" items={[...o.limitations, ...notes]} muted />
      </div>
    );
  }

  const parsed = analysisOutputSchema.safeParse(output);
  if (!parsed.success) return <p className="text-sm text-muted-foreground">No output was recorded.</p>;
  const o = parsed.data;
  return (
    <div className="space-y-5 text-sm">
      <p className="whitespace-pre-wrap">{o.summary}</p>
      {o.findings.length > 0 && (
        <div className="space-y-2">
          <p className="font-medium">Findings</p>
          <ul className="space-y-2">
            {o.findings.map((f, i) => (
              <li key={i} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={f.severity} />
                  <span className="font-medium">{f.title}</span>
                </div>
                {f.detail && <p className="mt-1 text-muted-foreground">{f.detail}</p>}
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>Evidence:</span>
                  {f.evidence.map((e) => {
                    const ref = byKey.get(`${e.table}:${e.id}`);
                    if (!ref) return null;
                    return ref.href ? (
                      <Link key={`${e.table}:${e.id}`} href={ref.href} className="underline underline-offset-2 hover:text-foreground">
                        {ref.label}
                      </Link>
                    ) : (
                      <span key={`${e.table}:${e.id}`}>{ref.label}</span>
                    );
                  })}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Bullets title="Recommended next steps" items={o.recommendedActions} />
      <Bullets title="Limitations" items={[...o.limitations, ...notes]} muted />
    </div>
  );
}

function Bullets({ title, items, muted }: { title: string; items: string[]; muted?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="font-medium">{title}</p>
      <ul className={`list-disc space-y-1 pl-5 ${muted ? "text-muted-foreground" : ""}`}>
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}
