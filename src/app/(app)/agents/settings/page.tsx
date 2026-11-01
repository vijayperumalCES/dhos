import type { Metadata } from "next";

import { AgentSettingsForm } from "@/components/agents/agent-controls";
import { AccessDenied } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/auth/org-context";
import { getAgentOverview } from "@/lib/data/agents";
import { PROVIDER_LABELS, type PROVIDERS } from "@/lib/validation/agents";

export const metadata: Metadata = { title: "Agent settings" };

export default async function AgentSettingsPage() {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("agent.manage")) return <AccessDenied what="agent settings" />;
  const { settings } = await getAgentOverview(ctx);
  if (!settings) return <AccessDenied what="agent settings" />;
  const anthropicConfigured = !!process.env.ANTHROPIC_API_KEY;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <CardTitle>Organization settings</CardTitle>
          <CardDescription>The organization switch, provider, model and monthly token cap. Changes are audited.</CardDescription>
        </div>
        <AgentSettingsForm
          currency={ctx.settings.currencyCode}
          defaults={{
            enabled: settings.enabled,
            provider: settings.provider,
            model: settings.model ?? "",
            monthlyTokenCap: String(settings.monthly_token_cap),
            inputPrice: settings.input_price_per_mtok === null ? "" : String(settings.input_price_per_mtok),
            outputPrice: settings.output_price_per_mtok === null ? "" : String(settings.output_price_per_mtok),
          }}
        />
      </CardHeader>
      <CardContent>
        <dl className="grid max-w-xl grid-cols-[11rem_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Agents</dt>
          <dd>
            <Badge variant="secondary">{settings.enabled ? "On" : "Off"}</Badge>
          </dd>
          <dt className="text-muted-foreground">Provider</dt>
          <dd>{PROVIDER_LABELS[settings.provider as (typeof PROVIDERS)[number]] ?? settings.provider}</dd>
          <dt className="text-muted-foreground">Model</dt>
          <dd>{settings.model ?? "Provider default"}</dd>
          <dt className="text-muted-foreground">Monthly token cap</dt>
          <dd className="tabular-nums">{settings.monthly_token_cap.toLocaleString()}</dd>
          <dt className="text-muted-foreground">Prices (per million)</dt>
          <dd>{settings.input_price_per_mtok === null ? "Not set — cost is not estimated" : `${settings.input_price_per_mtok} in · ${settings.output_price_per_mtok ?? "?"} out (${ctx.settings.currencyCode})`}</dd>
          <dt className="text-muted-foreground">Anthropic credentials</dt>
          <dd>{anthropicConfigured ? "Configured on the server" : "Not configured (set ANTHROPIC_API_KEY to use this provider)"}</dd>
        </dl>
      </CardContent>
    </Card>
  );
}
