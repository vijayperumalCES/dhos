import "server-only";

import type { OrgContext } from "@/lib/auth/org-context";
import { fail, fromPostgrestError, fromZodError, ok, type ActionResult } from "@/lib/actions/result";
import { todayInTimeZone } from "@/lib/domain/time";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { estimateCost, resolveProvider } from "./gateway";
import { redactSecrets } from "./guard";
import { runPipeline } from "./pipeline";
import { AGENTS, type AgentKey, type EvidenceRef } from "./registry";
import { loadData, loadProjectContext, type LoadedData, type ToolCallLog } from "./tools";

type StartInfo = {
  execution_id: string;
  version_id: string;
  system_prompt: string;
  model: string | null;
  temperature: number;
  max_tokens: number;
  provider: string;
  input_price_per_mtok: number | null;
  output_price_per_mtok: number | null;
};

/** The generated RPC types mark SQL arguments as non-null even when the function accepts null. */
const nullable = <T>(v: T | null): T => v as T;

const redactJson = <T>(value: T): T => JSON.parse(redactSecrets(JSON.stringify(value)));

/**
 * Runs one agent for the signed-in person: validates input, opens an execution through the gated
 * RPC, reads data with the caller's own session, runs the pipeline, and always closes the execution
 * (as failed if anything throws) so the log and the token ledger stay truthful.
 */
export async function runAgent(ctx: OrgContext, key: AgentKey, rawInput: unknown): Promise<ActionResult<{ executionId: string; status: "succeeded" | "failed" }>> {
  const def = AGENTS[key];
  if (!ctx.permissions.has("agent.run")) return fail("You don't have permission to run agents.");
  const parsed = def.inputSchema.safeParse(rawInput);
  if (!parsed.success) return fromZodError(parsed.error);
  const input = parsed.data as { projectId?: string; text?: string };
  const projectId = input.projectId ? input.projectId : null;
  if (def.scope === "project" && !projectId) return fail("Choose a project.", { projectId: ["Choose a project."] });

  const supabase = await createSupabaseServerClient();
  const stored = redactJson({ ...(projectId ? { projectId } : {}), ...(input.text !== undefined ? { text: input.text } : {}) });
  const { data: start, error } = await supabase.rpc("start_agent_execution", {
    p_org: ctx.organization.id,
    p_agent_key: key,
    p_project: nullable(projectId),
    p_input: stored,
  });
  if (error) return fromPostgrestError(error);
  const info = start as unknown as StartInfo;

  const started = Date.now();
  let status: "succeeded" | "failed" = "failed";
  let output: unknown = null;
  let evidence: EvidenceRef[] = [];
  let toolCalls: ToolCallLog[] = [];
  let errorText: string | null = null;
  let proposals: unknown[] = [];
  let tokens = { input: 0, output: 0 };
  let modelUsed: string | null = info.model;

  try {
    const today = todayInTimeZone(new Date(), ctx.settings.timezone);
    const signalContext = { today, now: new Date(), staleAfterDays: ctx.settings.healthStaleAfterDays };
    const provider = resolveProvider(info.provider);

    let data: LoadedData;
    let scopeLabel: string;
    let portfolio = false;
    if (def.kind === "requirements") {
      const loaded = await loadProjectContext(supabase, ctx, def, projectId!);
      toolCalls = loaded.toolCalls;
      scopeLabel = loaded.project.code;
      data = { snapshots: [], evidence: new Map(), toolCalls: [], limitations: [] };
    } else {
      portfolio = !projectId;
      data = await loadData(supabase, ctx, def, projectId ? { projectId } : { portfolio: true }, today);
      toolCalls = data.toolCalls;
      scopeLabel = portfolio ? "Portfolio" : (data.snapshots[0]?.project.code ?? "Project");
    }

    const result = await runPipeline({
      agent: key,
      systemPrompt: info.system_prompt,
      model: info.model,
      temperature: Number(info.temperature),
      maxTokens: info.max_tokens,
      provider,
      snapshots: data.snapshots,
      evidence: data.evidence,
      limitations: data.limitations,
      signalContext,
      scopeLabel,
      portfolio,
      text: input.text,
    });
    tokens = { input: result.inputTokens, output: result.outputTokens };
    if (result.ok) {
      status = "succeeded";
      output = redactJson({ ...result.output, notes: result.notes });
      evidence = result.evidence;
      proposals = redactJson(result.proposals);
      modelUsed = result.model;
    } else {
      errorText = result.error;
    }
  } catch (e) {
    errorText = e instanceof Error ? redactSecrets(e.message) : "The run failed.";
  }

  const cost = estimateCost(tokens.input, tokens.output, info.input_price_per_mtok, info.output_price_per_mtok);
  const { error: finishError } = await supabase.rpc("finish_agent_execution", {
    p_execution: info.execution_id,
    p_status: status,
    p_output: nullable(output) as never,
    p_evidence: evidence as never,
    p_tool_calls: toolCalls as never,
    p_error: nullable(errorText),
    p_provider: info.provider,
    p_model: nullable(modelUsed),
    p_input_tokens: tokens.input,
    p_output_tokens: tokens.output,
    p_cost: nullable(cost),
    p_latency_ms: Date.now() - started,
    p_proposals: proposals as never,
  });
  if (finishError) return fromPostgrestError(finishError);

  if (status === "failed") return { ok: false, error: errorText ?? "The run failed." };
  return ok({ executionId: info.execution_id, status }, proposals.length > 0 ? `Done. ${proposals.length} proposal${proposals.length === 1 ? "" : "s"} waiting for approval.` : "Done.");
}
