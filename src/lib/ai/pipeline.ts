import "server-only";

import { fenceUntrusted, guardAnalysis, guardRequirements, redactSecrets, resolveEvidence, type EvidenceIndex } from "./guard";
import { ProviderError, type LocalInput, type ModelProvider } from "./gateway";
import { AGENTS, type AgentKey, type ActionType, type AnalysisOutput, type EvidenceRef, type RequirementsOutput } from "./registry";
import { computePortfolioSignals, computeProjectSignals, type ProjectSnapshot, type SignalContext } from "./signals";

export type Proposal = { action_type: ActionType; summary: string; payload: Record<string, unknown> };

export type PipelineInput = {
  agent: AgentKey;
  systemPrompt: string;
  model: string | null;
  temperature: number;
  maxTokens: number;
  provider: ModelProvider;
  snapshots: ProjectSnapshot[];
  evidence: EvidenceIndex;
  /** Sentences describing what could not be read or was truncated, passed on as limitations. */
  limitations: string[];
  signalContext: SignalContext;
  scopeLabel: string;
  /** True for a portfolio-wide run (several projects, roll-up counts). */
  portfolio: boolean;
  /** Untrusted text supplied by the caller (requirements notes). */
  text?: string;
};

export type PipelineResult =
  | {
      ok: true;
      output: AnalysisOutput | RequirementsOutput;
      evidence: EvidenceRef[];
      proposals: Proposal[];
      inputTokens: number;
      outputTokens: number;
      model: string;
      notes: string[];
    }
  | { ok: false; error: string; inputTokens: number; outputTokens: number };

const ANALYSIS_SHAPE = `Reply with one JSON object and nothing else:
{"summary": string, "findings": [{"type": string, "severity": "info"|"low"|"medium"|"high"|"critical", "title": string, "detail": string, "evidence": [{"table": string, "id": string}]}], "recommendedActions": [string], "limitations": [string]}
Base every finding on a signal below and copy its evidence entries exactly; findings without evidence are discarded.`;

const REQUIREMENTS_SHAPE = `Reply with one JSON object and nothing else:
{"summary": string, "stories": [{"title": string, "description": string, "acceptanceCriteria": [string], "type": "story"|"task"|"bug"}], "openQuestions": [string], "limitations": [string]}`;

/**
 * The agent run after data has been read: build the (fenced) prompt, call the provider, validate
 * the reply, resolve citations, and turn drafts into approval proposals. Shared by live runs and
 * the evaluation harness so both exercise the same guards.
 */
export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const def = AGENTS[input.agent];
  const timeoutMs = def.timeoutMs;
  let local: LocalInput;
  let user: string;
  let shape: string;
  let cleanProjects = 0;

  if (def.kind === "requirements") {
    const text = input.text ?? "";
    local = { kind: "requirements", text };
    shape = REQUIREMENTS_SHAPE;
    user = `Draft stories for project ${input.scopeLabel} from these notes.\n\n${fenceUntrusted("requirements notes", text)}`;
  } else {
    const { signals, cleanProjects: clean } = input.portfolio
      ? computePortfolioSignals(input.snapshots, input.signalContext)
      : { signals: input.snapshots.flatMap((s) => computeProjectSignals(s, input.signalContext)), cleanProjects: 0 };
    cleanProjects = clean;
    const limitations = input.limitations;
    local = {
      kind: "analysis",
      style: input.agent === "reporting" ? "brief" : "analysis",
      scopeLabel: input.scopeLabel,
      projectCount: input.snapshots.length,
      cleanProjects,
      signals,
      limitations,
      today: input.signalContext.today,
    };
    shape = ANALYSIS_SHAPE;
    user = `Today is ${input.signalContext.today}. Scope: ${input.scopeLabel} (${input.snapshots.length} project${input.snapshots.length === 1 ? "" : "s"}).\n\n${fenceUntrusted(
      "delivery signals",
      JSON.stringify({ signals: signals.slice(0, 60).map((s) => ({ type: s.type, severity: s.severity, title: s.title, detail: s.detail, evidence: s.evidence })), limitations }, null, 1),
    )}`;
  }

  let response;
  try {
    response = await input.provider.generateStructured({
      agent: input.agent,
      system: `${input.systemPrompt}\n\n${shape}`,
      user,
      local,
      model: input.model,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      timeoutMs,
    });
  } catch (e) {
    return { ok: false, error: e instanceof ProviderError || e instanceof Error ? redactSecrets(e.message) : "The model provider failed.", inputTokens: 0, outputTokens: 0 };
  }
  const usage = { inputTokens: response.inputTokens, outputTokens: response.outputTokens };

  if (def.kind === "requirements") {
    const guarded = guardRequirements(response.json);
    if (!guarded.ok) return { ok: false, error: guarded.error, ...usage };
    const proposals: Proposal[] = guarded.value.stories.map((s) => ({
      action_type: "create_work_item",
      summary: `Create ${s.type}: ${s.title}`.slice(0, 300),
      payload: { title: s.title, description: s.description, acceptanceCriteria: s.acceptanceCriteria, type: s.type },
    }));
    return { ok: true, output: guarded.value, evidence: [], proposals, ...usage, model: response.model, notes: [] };
  }

  const guarded = guardAnalysis(response.json, input.evidence);
  if (!guarded.ok) return { ok: false, error: guarded.error, ...usage };
  const notes: string[] = [];
  if (guarded.dropped.findings > 0) notes.push(`${guarded.dropped.findings} finding(s) were discarded because they cited no record that was read.`);
  if (guarded.dropped.citations > 0) notes.push(`${guarded.dropped.citations} citation(s) were removed because they did not match a record that was read.`);
  return { ok: true, output: guarded.value, evidence: resolveEvidence(guarded.value, input.evidence), proposals: [], ...usage, model: response.model, notes };
}
