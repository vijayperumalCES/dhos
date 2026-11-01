# ADR-0011: AI agents — gateway, registry, approvals and limits

**Status:** Accepted · 2026-11-04

## Context
Phase 6 adds agents that read delivery data and draft text. The risks are the usual ones for LLM
features, made sharper by multi-tenant data: an agent seeing more than the person who ran it, text
in the data steering the agent, an agent acting without a human, invented claims presented as
fact, and runaway cost. The design makes each of these a property of the system, not of a prompt.

## Decisions

1. **Agents act as the person who runs them.** Every read goes through that person's own Supabase
   session, so Row Level Security bounds the data exactly. There is no service-role client and no
   agent service principal. A tool also runs only if the agent's allow-list names it *and* the caller
   holds the tool's permission (`TOOL_REQUIRES`); otherwise it is skipped and reported as a
   limitation, never read as "nothing wrong".
2. **Models never call tools.** The orchestrator runs a fixed read plan (`src/lib/ai/tools.ts`) and
   gives the model the result. Text inside records, notes or webhooks therefore has nothing to
   invoke. Untrusted text is fenced in `<untrusted_data>` tags in the prompt, and the system prompt
   says to treat it as data.
3. **Deterministic signals decide what is wrong; a model only words it.** `src/lib/ai/signals.ts`
   computes findings (overdue milestones, blocked work, high risks, overdue escalations, stale
   health…) from rows that were read. The prompt carries the signals; the model may phrase and
   prioritise but every finding must cite evidence.
4. **Citations are checked.** `guardAnalysis` resolves each citation against the records actually
   read and drops any that don't match; a finding left with no citation is removed. Evidence links
   are built by the tool layer, never by a model. Output must pass a Zod schema or the run fails.
5. **A closed set of actions behind approval.** An agent can only *propose*. The one action type
   is `create_work_item` (Requirements agent), a CHECK constraint on `agent_approvals.action_type`.
   A proposal is decided by a *different* person holding `agent.approve` and the permission for the
   action on that project (`decide_agent_approval`); the approved action then runs *as the
   approver* through their own session and RLS. The audit log records both people. Analysis agents
   propose nothing.
6. **Execution content is private to the requester.** `agent_executions` rows are readable only by
   the person who ran them, not by administrators or operators; operators get aggregate usage
   (`agent_usage`) with no content. Runs are written only through `start_agent_execution` (which
   enforces every gate) and `finish_agent_execution` (requester only, once). Audit entries for runs
   carry agent, project and token counts, never the input.
7. **Gates before a run starts**, all in `start_agent_execution`: organization switch, agent switch,
   an active version, the caller's `agent.run`, read access to the project, a rate limit (30 runs
   per person per hour) and the organization's monthly token cap. Abandoned `running` rows older
   than ten minutes are failed so they don't hold the rate limit.
8. **Versions are immutable and gated by evaluation.** `agent_versions` are insert-only. A version
   can be activated only if its *latest* evaluation passed; rollback is activating an earlier
   version that passed. An agent can be enabled only with an active version, and disabled at any
   time (the kill switch); the organization switch stops every agent. Everything starts off.
9. **Evaluation is a regression harness over synthetic data** (`src/lib/ai/eval.ts`): known problems
   are reported, every citation resolves, a healthy project stays clean, instructions hidden in
   data are ignored, fabricated citations are discarded, and requirement notes produce only
   approval proposals. It runs the same pipeline and guards as a live run, against the
   organization's configured provider and the version's prompt, and reads no organization data.
10. **Providers are server configuration.** `builtin` is rule-based, free and offline, and says so
    in every output's limitations; it keeps agents testable without a vendor. `anthropic` calls the
    Messages API with `ANTHROPIC_API_KEY` from the platform environment (never stored in the
    database, never sent to the browser), with a deadline, two retries with backoff on 429/5xx, and
    token counts recorded. Cost is estimated only if the organization sets prices; Stride ships no
    price table.

## Consequences
- Agent output is reproducible and testable for the signal-driven agents; a language model changes
  wording and emphasis, not which problems exist.
- Prompt injection can degrade wording but cannot widen data access, call a tool, change a project,
  or approve anything.
- Evaluation tokens against a paid provider are not counted against the monthly cap, and an operator
  with `agent.manage` can record an evaluation verdict (audited) — operators are trusted with
  configuration, not with data.
- Free-form agent-driven writes, tool-calling models, embeddings/knowledge retrieval and the
  remaining planned agents are out of scope for this phase (see `docs/ROADMAP.md`).
