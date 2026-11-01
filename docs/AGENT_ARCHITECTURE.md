# Stride — AI Sub-Agent Architecture (design)

> **Status: Phase 6 implemented (2026-11-04) for four agents — Project Health, Delivery Intelligence,
> Requirements and Reporting — on a provider-agnostic gateway with a built-in rule-based provider and
> an Anthropic provider. See [ADR-0011](DECISIONS/ADR-0011-ai-agents.md) for the decisions and
> "Implemented vs designed" below for what is not built.** Sections 1–7 remain the design; the
> deviations are listed at the end.

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
                         Tool layer ──▶ Stride data via user-scoped Supabase client (RLS)
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

## 8. Implemented vs designed (Phase 6)

| Design item | State |
|---|---|
| Orchestrator, caller-permission intersection, timeouts, retries, budgets | Built (`src/lib/ai/orchestrator.ts`, `tools.ts`, `pipeline.ts`; gates in `start_agent_execution`) |
| Model gateway (`generateStructured`) over providers | Built: `builtin` and `anthropic`. `generate` and `embed` are not built |
| `ai_providers` / `ai_models` tables | Not built: provider and model are organization settings; credentials are platform environment variables |
| `agent_definitions`, `agent_versions`, `agent_executions`, `agent_approvals` | Built, with `agent_org_settings` and `agent_eval_runs` added |
| `agent_tool_permissions`, `prompt_templates`, `prompt_versions` | Replaced: the tool allow-list and approval policy live in code (`registry.ts`), part of the reviewed safety boundary; the prompt and its history live in `agent_versions` |
| Evaluation datasets and regression gate | Built as code-defined golden cases over synthetic data; activation requires a passing run |
| Approvals with human decision | Built for `create_work_item`; other action types (attendance corrections, financial changes, external messages, reassignment) are not available to agents at all |
| Per-agent and per-org kill switch, token cap, usage dashboard | Built. Cost is estimated only when prices are configured |
| Agents: Sprint Planning, Resource Planning, Attendance & Timesheet, Risk & Escalation, Quality & Release, Financial Insights, Meeting Intelligence, Workflow Automation, Knowledge, Integration Monitoring | Not built |
| Scheduled and event-triggered runs | Not built (Phase 7 scheduler); every run is started by a person |
