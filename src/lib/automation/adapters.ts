/**
 * Integration adapters. Only deterministic mock adapters exist: they let the whole path (link,
 * sync, detect a status change, notify) be exercised without a vendor account. A live adapter
 * implements the same interface and needs a credential store first (ADR-0012).
 */
export const PROVIDERS = ["github", "azure_devops", "jira"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const PROVIDER_LABELS: Record<Provider, string> = {
  github: "GitHub",
  azure_devops: "Azure DevOps",
  jira: "Jira",
};

export const PROVIDER_CONFIG_HINT: Record<Provider, { field: string; label: string; placeholder: string }> = {
  github: { field: "repo", label: "Repository", placeholder: "acme/app" },
  azure_devops: { field: "project", label: "Organization/project", placeholder: "acme/Delivery" },
  jira: { field: "site", label: "Jira site", placeholder: "acme.atlassian.net" },
};

export type SyncContext = { linkedAt: Date; now: Date };

export interface IntegrationAdapter {
  readonly provider: Provider;
  readonly mode: "mock";
  /** The linked issue's current status as the provider names it. */
  fetchIssueStatus(externalId: string, ctx: SyncContext): Promise<string>;
}

/** Statuses a mock issue moves through as days pass since it was linked. */
const MOCK_FLOW: Record<Provider, string[]> = {
  github: ["open", "open", "closed"],
  azure_devops: ["New", "Active", "Closed"],
  jira: ["To Do", "In Progress", "Done"],
};

export function mockStatus(provider: Provider, linkedAt: Date, now: Date): string {
  const days = Math.max(0, Math.floor((now.getTime() - linkedAt.getTime()) / 86_400_000));
  const flow = MOCK_FLOW[provider];
  return flow[days === 0 ? 0 : days < 3 ? 1 : 2];
}

export function mockAdapter(provider: Provider): IntegrationAdapter {
  return { provider, mode: "mock", fetchIssueStatus: async (_id, ctx) => mockStatus(provider, ctx.linkedAt, ctx.now) };
}

export function resolveAdapter(provider: string, mode: string): IntegrationAdapter {
  if (mode !== "mock" || !(PROVIDERS as readonly string[]).includes(provider)) throw new Error(`No adapter for ${provider} (${mode}).`);
  return mockAdapter(provider as Provider);
}

export function initialMockStatus(provider: Provider): string {
  return MOCK_FLOW[provider][0];
}

/** A link a person can click, when the connection has enough configuration to build one. */
export function externalUrl(provider: Provider, config: Record<string, unknown>, externalId: string): string | null {
  const str = (k: string) => (typeof config[k] === "string" ? (config[k] as string) : "");
  const num = externalId.match(/#(\d+)$/)?.[1];
  if (provider === "github" && /^[\w.-]+\/[\w.-]+$/.test(str("repo")) && num) return `https://github.com/${str("repo")}/issues/${num}`;
  if (provider === "jira" && /^[\w.-]+\.atlassian\.net$/.test(str("site")) && /^[A-Z][A-Z0-9]+-\d+$/.test(externalId)) return `https://${str("site")}/browse/${externalId}`;
  return null;
}
