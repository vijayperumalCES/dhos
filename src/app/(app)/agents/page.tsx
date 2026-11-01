import { Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AgentStateBadge } from "@/components/agents/badges";
import { RunAgentDialog } from "@/components/agents/agent-controls";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AGENTS } from "@/lib/ai/registry";
import { requireOrgContext } from "@/lib/auth/org-context";
import { getAgentOverview, listRunnableProjects } from "@/lib/data/agents";

export const metadata: Metadata = { title: "AI Agents" };

export default async function AgentsPage() {
  const ctx = await requireOrgContext();
  const canRun = ctx.permissions.has("agent.run");
  const [{ settings, agents }, projects] = await Promise.all([getAgentOverview(ctx), canRun ? listRunnableProjects(ctx) : Promise.resolve([])]);
  const orgEnabled = settings?.enabled ?? true;

  return (
    <div className="space-y-6">
      {settings && !settings.enabled && (
        <Alert>
          <Info className="size-4" />
          <AlertTitle>AI agents are switched off for this organization</AlertTitle>
          <AlertDescription>
            {ctx.permissions.has("agent.manage") ? (
              <>
                Turn them on in <Link className="underline" href="/agents/settings">Settings</Link>. Each agent also needs an evaluated, enabled version.
              </>
            ) : (
              "An administrator with the agent.manage permission can turn them on."
            )}
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {agents.map((a) => {
          const def = AGENTS[a.key];
          const ready = orgEnabled && a.enabled;
          return (
            <Card key={a.key}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle>{def.name}</CardTitle>
                  <AgentStateBadge enabled={a.enabled} orgEnabled={orgEnabled} hasVersion={!!a.activeVersionId} />
                </div>
                <CardDescription>{def.purpose}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5">
                  <dt className="text-muted-foreground">Reads</dt>
                  <dd className="flex flex-wrap gap-1">
                    {def.tools.map((t) => (
                      <Badge key={t} variant="outline">
                        {t.replace("_", " ")}
                      </Badge>
                    ))}
                  </dd>
                  <dt className="text-muted-foreground">You need</dt>
                  <dd>{def.callerNeeds}</dd>
                  <dt className="text-muted-foreground">Actions</dt>
                  <dd>{def.approvalPolicy}</dd>
                  {a.activeVersion && (
                    <>
                      <dt className="text-muted-foreground">Version</dt>
                      <dd>v{a.activeVersion}</dd>
                    </>
                  )}
                </dl>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {canRun && ready && <RunAgentDialog agentKey={a.key} projects={projects} />}
                  {canRun && !ready && <span className="text-xs text-muted-foreground">Not available to run right now.</span>}
                  {ctx.permissions.has("agent.read") && (
                    <Link href={`/agents/${a.key}`} className="text-sm underline underline-offset-2">
                      Configuration and evaluation
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
