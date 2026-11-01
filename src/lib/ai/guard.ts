import type { z } from "zod";

import { analysisOutputSchema, requirementsOutputSchema, type AnalysisOutput, type EvidenceRef, type RequirementsOutput } from "./registry";

/**
 * Safety checks around model output. Untrusted text is fenced before it reaches a model; whatever
 * comes back is parsed against the agent's output schema and every citation is resolved against
 * the records that were actually read. A citation that was not read is dropped, never trusted, and
 * a finding left with no citation is removed: an agent cannot assert what it did not look at.
 */
export type EvidenceIndex = Map<string, EvidenceRef>;

export const evidenceKey = (table: string, id: string) => `${table}:${id}`;

export function indexEvidence(refs: EvidenceRef[]): EvidenceIndex {
  return new Map(refs.map((r) => [evidenceKey(r.table, r.id), r]));
}

/** Wraps text from users, documents or other systems so a prompt can tell data from instructions. */
export function fenceUntrusted(label: string, text: string): string {
  // A closing tag inside the data must not be able to end the fence early.
  const safe = text.replace(/<\/?untrusted_data[^>]*>/gi, "[tag removed]");
  return `<untrusted_data source="${label.replace(/[^\w .-]/g, "")}">\n${safe}\n</untrusted_data>`;
}

/** Extracts the first JSON object from a model reply, tolerating a markdown fence around it. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("The model reply contained no JSON object.");
  return JSON.parse(body.slice(start, end + 1));
}

export type GuardResult<T> = { ok: true; value: T; dropped: { findings: number; citations: number } } | { ok: false; error: string };

export function guardAnalysis(raw: unknown, index: EvidenceIndex): GuardResult<AnalysisOutput> {
  const parsed = analysisOutputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: `Output did not match the schema: ${summariseIssues(parsed.error)}` };

  let droppedCitations = 0;
  let droppedFindings = 0;
  const findings: AnalysisOutput["findings"] = [];
  for (const f of parsed.data.findings) {
    const evidence = f.evidence.filter((e) => index.has(evidenceKey(e.table, e.id)));
    droppedCitations += f.evidence.length - evidence.length;
    if (evidence.length === 0) {
      droppedFindings += 1;
      continue;
    }
    findings.push({ ...f, evidence });
  }
  return { ok: true, value: { ...parsed.data, findings }, dropped: { findings: droppedFindings, citations: droppedCitations } };
}

export function guardRequirements(raw: unknown): GuardResult<RequirementsOutput> {
  const parsed = requirementsOutputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: `Output did not match the schema: ${summariseIssues(parsed.error)}` };
  return { ok: true, value: parsed.data, dropped: { findings: 0, citations: 0 } };
}

/** The evidence a finished analysis cites, resolved to full references for storage and display. */
export function resolveEvidence(output: AnalysisOutput, index: EvidenceIndex): EvidenceRef[] {
  const seen = new Map<string, EvidenceRef>();
  for (const f of output.findings) {
    for (const e of f.evidence) {
      const ref = index.get(evidenceKey(e.table, e.id));
      if (ref) seen.set(evidenceKey(e.table, e.id), ref);
    }
  }
  return [...seen.values()];
}

/** Redacts anything that looks like a credential before text is stored in the execution log. */
export function redactSecrets(text: string): string {
  return text
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[redacted-key]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi, "Bearer [redacted]")
    .replace(/\b(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g, "[redacted-jwt]");
}

function summariseIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}
