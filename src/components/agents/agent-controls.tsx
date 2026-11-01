"use client";

import { CheckCircle2, Play, Plus, Power, PowerOff, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { SelectField, TextareaField, TextField, type Option } from "@/components/forms/fields";
import { CheckboxField, FormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { activateAgentVersion, createAgentVersion, evaluateAgentVersion, runAgentAction, saveAgentSettings, setAgentEnabled } from "@/lib/actions/agents";
import { fail } from "@/lib/actions/result";
import { AGENTS, type AgentKey } from "@/lib/ai/registry";
import { NONE } from "@/lib/validation/common";
import { agentSettingsSchema, agentVersionSchema, PROVIDER_LABELS, PROVIDERS, runInputSchema } from "@/lib/validation/agents";

type RunValues = { projectId: string; text: string };

export function RunAgentDialog({ agentKey, projects }: { agentKey: AgentKey; projects: Option[] }) {
  const router = useRouter();
  const def = AGENTS[agentKey];
  const portfolioOk = def.scope !== "project";
  const options = portfolioOk ? [{ value: NONE, label: def.scope === "portfolio" ? "All projects I can see" : "Whole portfolio" }, ...(def.scope === "portfolio" ? [] : projects)] : projects;
  return (
    <FormDialog<RunValues>
      wide={agentKey === "requirements"}
      trigger={
        <Button size="sm">
          <Play className="size-4" /> Run
        </Button>
      }
      title={`Run ${def.name}`}
      description="The agent reads only what you can already see, and records the run, its sources and its token use."
      submitLabel="Run agent"
      schema={runInputSchema}
      defaultValues={{ projectId: def.scope === "portfolio" ? "" : portfolioOk ? NONE : "", text: "" }}
      onSubmit={async (v) => {
        const projectId = v.projectId === NONE ? "" : v.projectId;
        if (def.scope === "project" && !projectId) return fail("Please correct the highlighted fields.", { projectId: ["Choose a project."] });
        const input = agentKey === "requirements" ? { projectId, text: v.text } : agentKey === "delivery_intelligence" ? {} : { projectId };
        const r = await runAgentAction(agentKey, input);
        if (r.ok) router.push(`/agents/runs/${r.data.executionId}`);
        return r;
      }}
    >
      {def.scope !== "portfolio" && <SelectField name="projectId" label="Project" options={options} required={def.scope === "project"} />}
      {agentKey === "requirements" && (
        <TextareaField
          name="text"
          label="Notes or requirements"
          rows={8}
          required
          description="Paste meeting notes or a requirements document. It is treated as data, never as instructions. Nothing is created until a different person approves each draft."
        />
      )}
    </FormDialog>
  );
}

export function EnableToggle({ agentId, enabled, canEnable }: { agentId: string; enabled: boolean; canEnable: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant={enabled ? "outline" : "default"}
      size="sm"
      disabled={pending || (!enabled && !canEnable)}
      title={!enabled && !canEnable ? "Activate an evaluated version first" : undefined}
      onClick={() =>
        startTransition(async () => {
          const r = await setAgentEnabled(agentId, !enabled);
          if (r.ok) {
            toast.success(r.message);
            router.refresh();
          } else toast.error(r.error);
        })
      }
    >
      {enabled ? <PowerOff className="size-4" /> : <Power className="size-4" />} {enabled ? "Disable (kill switch)" : "Enable"}
    </Button>
  );
}

export function EvaluateButton({ versionId }: { versionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await evaluateAgentVersion(versionId);
          if (r.ok) toast.success(r.message);
          else toast.error(r.error);
          router.refresh();
        })
      }
    >
      <ShieldCheck className="size-4" /> {pending ? "Evaluating…" : "Run evaluation"}
    </Button>
  );
}

export function ActivateButton({ versionId, label = "Activate" }: { versionId: string; label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await activateAgentVersion(versionId);
          if (r.ok) {
            toast.success(r.message);
            router.refresh();
          } else toast.error(r.error);
        })
      }
    >
      <CheckCircle2 className="size-4" /> {label}
    </Button>
  );
}

type VersionValues = { systemPrompt: string; model: string; temperature: string; maxTokens: string; notes: string };

export function NewVersionDialog({ agentId, base }: { agentId: string; base: VersionValues }) {
  return (
    <FormDialog<VersionValues>
      wide
      trigger={
        <Button variant="outline" size="sm">
          <Plus className="size-4" /> New version
        </Button>
      }
      title="New prompt version"
      description="Versions are never edited. A new version must pass the evaluation before it can be activated; the previous one stays available for rollback."
      schema={agentVersionSchema}
      defaultValues={base}
      onSubmit={(v) => createAgentVersion(agentId, v)}
    >
      <TextareaField name="systemPrompt" label="System prompt" rows={10} required description="Keep the security rules about untrusted data. The evaluation checks the agent still resists injected instructions." />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField name="model" label="Model override" placeholder="Organization default" />
        <TextField name="temperature" label="Temperature" inputMode="decimal" />
        <TextField name="maxTokens" label="Max output tokens" inputMode="numeric" />
      </div>
      <TextField name="notes" label="What changed" />
    </FormDialog>
  );
}

type SettingsValues = { enabled: boolean; provider: string; model: string; monthlyTokenCap: string; inputPrice: string; outputPrice: string };

export function AgentSettingsForm({ defaults, currency }: { defaults: SettingsValues; currency: string }) {
  const [open, setOpen] = useState(false);
  return (
    <FormDialog<SettingsValues>
      open={open}
      onOpenChange={setOpen}
      trigger={<Button size="sm">Edit settings</Button>}
      title="AI agent settings"
      description="The organization switch stops every agent at once. Provider credentials are platform secrets on the server; they are never entered or stored here."
      schema={agentSettingsSchema}
      defaultValues={defaults}
      onSubmit={(v) => saveAgentSettings(v)}
    >
      <CheckboxField name="enabled" label="AI agents are on for this organization" description="Individual agents still need an evaluated, enabled version." />
      <SelectField name="provider" label="Provider" options={PROVIDERS.map((p) => ({ value: p, label: PROVIDER_LABELS[p] }))} required />
      <TextField name="model" label="Model" placeholder="Provider default" description="Used by agent versions that don't name their own model." />
      <TextField name="monthlyTokenCap" label="Monthly token cap" inputMode="numeric" required description="Input plus output tokens across the organization. New runs are refused once it is reached." />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="inputPrice" label={`Input price per million tokens (${currency})`} inputMode="decimal" description="Optional. Only used to estimate cost." />
        <TextField name="outputPrice" label={`Output price per million tokens (${currency})`} inputMode="decimal" />
      </div>
    </FormDialog>
  );
}
