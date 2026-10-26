# DHOS — AI Sub-Agent Architecture (design)

> **Status: design only. No AI agent, model gateway or agent execution exists in the codebase.**
> Implementation is Phase 6. The AI brief card on the Command Center is labelled "Not available".

## 1. Goals

Specialised, permission-bounded agents that analyse delivery data, draft artefacts and execute
approved workflows — never a single unrestricted agent, and never one that can exceed the data
access of the human it acts for.

## 2. Components

```
User / schedule / event ──▶ Orchestrator ──▶ Agent registry (versioned definitions)
                                │                 │
                                │                 └─ tool allow-list, schemas, policies
                                ▼
                         Model gateway (provider-agnostic) ──▶ configured LLM providers
                                │
                                ▼
                         Tool layer ──▶ DHOS data via user-scoped Supabase client (RLS)
                                │
                                ▼
                         Approval service ──▶ human decision ──▶ action executor
                                │
                                ▼
                         agent_executions / agent_approvals / token & cost ledger
```

### Orchestrator responsibilities
Receive requests and triggers; select an agent; bind organization + project context; resolve the
caller's permissions; restrict tools to the intersection of agent allow-list and caller permissions;
enforce timeouts, retries, token and cost budgets; request approval for consequential actions;
persist execution state, inputs/outputs (redacted), evidence and cost.

### Model gateway
Single interface (`generate`, `generateStructured`, `embed`) over providers configured in
`ai_providers` / `ai_models`. Secrets live server-side (Supabase Vault or platform secrets), never in
the browser. Per-org model allow-lists and spend caps.

## 3. Agent definition contract

Every agent version declares:

| Field | Example (Project Health Agent) |
|---|---|
| purpose | Identify schedule variance, stale updates and risks for one project |
| input schema | `{ projectId: uuid, asOf?: date }` (Zod / JSON Schema) |
| output schema | `{ summary, findings[{type, severity, evidence[]}], recommendedActions[] }` |
| allowed tools | `projects.read`, `status_history.read`, `milestones.read` (Phase 2+) |
| permissions required of caller | `project.read_*` on the target project |
| model config | model id, temperature, max tokens |
| timeout / retries | 60s / 2 with backoff |
| evaluation | golden dataset + rubric; regression gate before activation |
| approval policy | none (read-only) — any write action routes to approval |

An agent is **disabled by default** until its definition, permissions and safety policy are complete.

## 4. Planned agents

Delivery Intelligence, Project Health, Sprint Planning, Resource Planning, Attendance & Timesheet,
Risk & Escalation, Quality & Release, Financial Insights, Meeting Intelligence, Reporting,
Requirements, Workflow Automation, Knowledge, Integration Monitoring. Phase 6 starts with the model
gateway, registry, Delivery Intelligence, Project Health, Requirements and Reporting agents.

## 5. Safety rules

1. Agents query through the **same RLS boundary** as the user; no service-role access.
2. Retrieved documents, user text and webhook payloads are **untrusted input**: they are delimited
   in prompts, never treated as instructions, and tool calls derived from them require policy checks.
3. **Consequential actions require human approval** per configurable policy: attendance corrections,
   financial changes, external communications, resource reassignment, commitment changes, releases.
4. Every output cites evidence (record ids) so humans can verify; forecasts are labelled as such.
5. Full execution logs, token usage and cost per org; kill switch per agent and per org.

## 6. Control plane (Phase 6)

Registry and versions, model/provider config, tool registry, permission scopes, prompt templates
with history, input/output schemas, execution logs, token/cost/latency/error dashboards, evaluation
datasets and regression runs, enable/disable, rollback, approval policies, audit history.

## 7. Data model (planned)

`ai_providers`, `ai_models`, `agent_definitions`, `agent_versions`, `agent_tool_permissions`,
`agent_executions`, `agent_approvals`, `prompt_templates`, `prompt_versions` — all tenant-scoped with
RLS, following `docs/DATABASE.md` conventions.
