"use server";

import { revalidatePath } from "next/cache";

import { runEvaluation } from "@/lib/ai/eval";
import { resolveProvider } from "@/lib/ai/gateway";
import { runAgent } from "@/lib/ai/orchestrator";
import { createWorkItemPayloadSchema, isAgentKey } from "@/lib/ai/registry";
import { requireOrgContext } from "@/lib/auth/org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { agentSettingsSchema, agentVersionSchema, decisionNoteSchema } from "@/lib/validation/agents";
import { uuid } from "@/lib/validation/common";

import { fail, fromPostgrestError, fromZodError, ok, type ActionResult } from "./result";

const NO_MANAGE = "You don't have permission to configure agents.";

function revalidateAgents() {
  revalidatePath("/agents", "layout");
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------
export async function runAgentAction(agentKey: string, input: unknown): Promise<ActionResult<{ executionId: string }>> {
  const ctx = await requireOrgContext();
  if (!isAgentKey(agentKey)) return fail("Unknown agent.");
  const result = await runAgent(ctx, agentKey, input);
  revalidateAgents();
  revalidatePath("/dashboard");
  return result.ok ? ok({ executionId: result.data.executionId }, result.message) : result;
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------
/** Runs an approved proposal as the approver. A failed run can be retried from the approvals page. */
export async function executeApproval(approvalId: string): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(approvalId).success) return fail("Invalid request.");
  const supabase = await createSupabaseServerClient();

  const { data: approval, error } = await supabase
    .from("agent_approvals")
    .select("id, status, action_type, payload, project_id, decided_by_membership_id")
    .eq("id", approvalId)
    .maybeSingle();
  if (error) return fromPostgrestError(error);
  if (!approval) return fail("The proposal was not found or you no longer have access to it.");
  if (approval.decided_by_membership_id !== ctx.membershipId || !["approved", "failed"].includes(approval.status)) {
    return fail("Only the person who approved a proposal can run it, and only once.");
  }

  let result: { ok: boolean; detail: Record<string, unknown> };
  if (approval.action_type === "create_work_item" && ctx.permissions.has("work.create")) {
    result = await createWorkItemFromProposal(ctx.organization.id, approval.project_id, approval.payload);
  } else {
    result = { ok: false, detail: { error: "You don't have permission to perform this action." } };
  }

  const { error: completeError } = await supabase.rpc("complete_agent_approval", {
    p_approval: approvalId,
    p_ok: result.ok,
    p_result: result.detail as never,
  });
  if (completeError) return fromPostgrestError(completeError);

  revalidateAgents();
  revalidatePath(`/projects/${approval.project_id}`, "layout");
  if (!result.ok) return fail(String(result.detail.error ?? "The action could not be completed."));
  return ok(undefined, `Created ${String(result.detail.key)}.`);
}

async function createWorkItemFromProposal(orgId: string, projectId: string, rawPayload: unknown): Promise<{ ok: boolean; detail: Record<string, unknown> }> {
  const payload = createWorkItemPayloadSchema.safeParse(rawPayload);
  if (!payload.success) return { ok: false, detail: { error: "The proposal's content is not valid." } };
  const p = payload.data;
  const supabase = await createSupabaseServerClient();

  const { data: state } = await supabase.from("workflow_states").select("id").eq("organization_id", orgId).eq("is_default", true).is("archived_at", null).maybeSingle();
  if (!state) return { ok: false, detail: { error: "No default workflow state is configured." } };

  const { data, error } = await supabase
    .from("work_items")
    .insert({
      organization_id: orgId,
      project_id: projectId,
      type: p.type,
      title: p.title,
      description: p.description || null,
      acceptance_criteria: p.acceptanceCriteria.length ? p.acceptanceCriteria.map((c) => `- ${c}`).join("\n") : null,
      labels: ["ai-drafted"],
      state_id: state.id,
    })
    .select("id, key")
    .single();
  if (error) return { ok: false, detail: { error: error.code === "42501" ? "You don't have permission to create work items on this project." : "The work item could not be created." } };
  return { ok: true, detail: { id: data.id, key: data.key } };
}

export async function decideApproval(approvalId: string, approve: boolean, input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(approvalId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("agent.approve")) return fail("You don't have permission to decide agent proposals.");
  const parsed = decisionNoteSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("decide_agent_approval", { p_approval: approvalId, p_approve: approve, p_note: parsed.data.note || undefined });
  if (error) return fromPostgrestError(error);

  if (approve) {
    const executed = await executeApproval(approvalId);
    revalidateAgents();
    return executed.ok ? ok(undefined, `Approved. ${executed.message ?? ""}`.trim()) : fail(`Approved, but the action failed: ${executed.error} You can retry it from the approvals page.`);
  }
  revalidateAgents();
  return ok(undefined, "Rejected.");
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
export async function saveAgentSettings(input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("agent.manage")) return fail(NO_MANAGE);
  const parsed = agentSettingsSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;
  if (v.provider === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
    return fail("The Anthropic provider needs the ANTHROPIC_API_KEY platform secret, which isn't configured on this server.", { provider: ["Not configured on this server."] });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("agent_org_settings")
    .update({
      enabled: v.enabled,
      provider: v.provider,
      model: v.model,
      monthly_token_cap: v.monthlyTokenCap,
      input_price_per_mtok: v.inputPrice,
      output_price_per_mtok: v.outputPrice,
    })
    .eq("organization_id", ctx.organization.id)
    .select("organization_id");
  if (error) return fromPostgrestError(error);
  if (!data?.length) return fail("You don't have permission to configure agents.");

  revalidateAgents();
  return ok(undefined, "Settings saved.");
}

export async function setAgentEnabled(agentId: string, enabled: boolean): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(agentId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("agent.manage")) return fail(NO_MANAGE);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_agent_enabled", { p_agent: agentId, p_enabled: enabled });
  if (error) return fromPostgrestError(error);
  revalidateAgents();
  return ok(undefined, enabled ? "Agent enabled." : "Agent disabled.");
}

export async function createAgentVersion(agentId: string, input: unknown): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(agentId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("agent.manage")) return fail(NO_MANAGE);
  const parsed = agentVersionSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("agent_versions").insert({
    organization_id: ctx.organization.id,
    agent_id: agentId,
    system_prompt: v.systemPrompt,
    model: v.model,
    temperature: v.temperature,
    max_tokens: v.maxTokens,
    notes: v.notes,
  });
  if (error) return fromPostgrestError(error);
  revalidateAgents();
  return ok(undefined, "New version saved. Evaluate it before activating.");
}

/** Runs the golden cases against a version with the organization's provider and records the verdict. */
export async function evaluateAgentVersion(versionId: string): Promise<ActionResult<{ passed: number; total: number }>> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(versionId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("agent.manage")) return fail(NO_MANAGE);
  const supabase = await createSupabaseServerClient();

  const [{ data: version }, { data: settings }] = await Promise.all([
    supabase.from("agent_versions").select("id, system_prompt, model, temperature, max_tokens, agent:agent_definitions!agent_versions_agent_id_organization_id_fkey(key)").eq("id", versionId).maybeSingle(),
    supabase.from("agent_org_settings").select("provider, model").eq("organization_id", ctx.organization.id).maybeSingle(),
  ]);
  if (!version || !settings || !version.agent || !isAgentKey(version.agent.key)) return fail("The version was not found.");

  let summary;
  try {
    summary = await runEvaluation({
      agent: version.agent.key,
      systemPrompt: version.system_prompt,
      model: version.model ?? settings.model,
      temperature: Number(version.temperature),
      maxTokens: version.max_tokens,
      provider: resolveProvider(settings.provider),
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "The evaluation could not run.");
  }

  const { error } = await supabase.rpc("record_agent_eval", {
    p_version: versionId,
    p_passed: summary.ok,
    p_total: summary.total,
    p_passed_cases: summary.passed,
    p_results: summary.results as never,
  });
  if (error) return fromPostgrestError(error);
  revalidateAgents();
  const data = { passed: summary.passed, total: summary.total };
  return summary.ok ? ok(data, `Passed ${summary.passed} of ${summary.total} cases.`) : { ok: false, error: `Passed ${summary.passed} of ${summary.total} cases. Review the failures before activating.` };
}

export async function activateAgentVersion(versionId: string): Promise<ActionResult> {
  const ctx = await requireOrgContext();
  if (!uuid.safeParse(versionId).success) return fail("Invalid request.");
  if (!ctx.permissions.has("agent.manage")) return fail(NO_MANAGE);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("activate_agent_version", { p_version: versionId });
  if (error) return fromPostgrestError(error);
  revalidateAgents();
  return ok(undefined, "Version activated.");
}
