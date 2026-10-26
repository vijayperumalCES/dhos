import "server-only";

import type { OrgContext } from "@/lib/auth/org-context";

import { listMemberOptions } from "./members";
import { listClientOptions, listTeamOptions } from "./projects";

export async function loadProjectFormOptions(ctx: OrgContext) {
  const [clients, members, teams] = await Promise.all([
    listClientOptions(ctx),
    listMemberOptions(ctx),
    listTeamOptions(ctx),
  ]);
  return {
    clients: clients.map((c) => ({ value: c.id, label: c.name })),
    members: members.map((m) => ({ value: m.id, label: m.jobTitle ? `${m.displayName} — ${m.jobTitle}` : m.displayName })),
    teams: teams.map((t) => ({ value: t.id, label: t.name })),
  };
}
