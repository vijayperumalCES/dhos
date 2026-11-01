import type { AnalysisOutput, RequirementsOutput, Severity } from "./registry";
import { SEVERITY_RANK } from "./registry";
import type { Signal } from "./signals";

/**
 * The built-in provider: rule-based, no network, no cost. It words the deterministic signals and
 * splits requirement notes into draft stories. It exists so agents work (and can be evaluated)
 * without an external model, and as the safe fallback. It is deliberately not "AI": its output
 * says so in `limitations`.
 */
const ADVICE: Record<string, string> = {
  health_red: "Review the recovery plan for the red project and record it as a risk, issue or escalation.",
  health_amber: "Agree what would move the amber project back to green and who owns it.",
  stale_health: "Ask the project manager to reassess and record the project's health.",
  past_target_end: "Re-baseline the target end date or record why the project is running late.",
  overdue_milestone: "Confirm a new date for each overdue milestone, or complete or cancel it.",
  slipped_milestone: "Check whether the slipped milestone endangers later commitments.",
  blocked_work: "Unblock the stuck work items, or escalate the blocker to someone who can.",
  overdue_work: "Re-plan or close the work items that are past their due date.",
  high_raid: "Confirm a mitigation owner and date for each high-scoring risk or issue.",
  overdue_raid: "Update or close the risks and issues that are past their due date.",
  overdue_escalation: "Respond to the overdue escalation or reassign it.",
  red_without_recovery: "Record the recovery action for the red project.",
};

function counts(signals: Signal[]): Record<Severity, number> {
  const c: Record<Severity, number> = { info: 0, low: 0, medium: 0, high: 0, critical: 0 };
  for (const s of signals) c[s.severity] += 1;
  return c;
}

function adviceFor(signals: Signal[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of signals) {
    const a = ADVICE[s.type];
    if (a && !seen.has(s.type)) {
      seen.add(s.type);
      out.push(a);
    }
    if (out.length === 10) break;
  }
  return out;
}

export function narrateAnalysis(input: {
  style: "analysis" | "brief";
  scopeLabel: string;
  projectCount: number;
  cleanProjects: number;
  signals: Signal[];
  limitations: string[];
  today: string;
}): AnalysisOutput {
  const { signals } = input;
  const c = counts(signals);
  const urgent = c.critical + c.high;
  const findings = signals.slice(0, 25).map((s) => ({ type: s.type, severity: s.severity, title: s.title, detail: s.detail.slice(0, 1000), evidence: s.evidence }));

  let summary: string;
  if (signals.length === 0) {
    summary = `${input.scopeLabel}: no delivery concerns found in the records read as of ${input.today}.`;
  } else if (input.style === "brief") {
    const top = signals.filter((s) => SEVERITY_RANK[s.severity] >= SEVERITY_RANK.medium).slice(0, 5);
    summary = [
      `Delivery brief — ${input.scopeLabel}, ${input.today}.`,
      urgent > 0 ? `${urgent} item${urgent === 1 ? "" : "s"} need${urgent === 1 ? "s" : ""} attention now.` : "Nothing is critical right now.",
      top.length ? `Main points: ${top.map((s) => s.title).join("; ")}.` : "Only minor items were found.",
      input.projectCount > 1 ? `${input.cleanProjects} of ${input.projectCount} projects have no findings.` : "",
    ]
      .filter(Boolean)
      .join(" ");
  } else {
    summary = `${input.scopeLabel}: ${signals.length} finding${signals.length === 1 ? "" : "s"} as of ${input.today} — ${c.critical} critical, ${c.high} high, ${c.medium} medium, ${c.low + c.info} lower. ${
      urgent > 0 ? `Start with: ${signals[0].title}.` : "No high-severity items."
    }${input.projectCount > 1 ? ` ${input.cleanProjects} of ${input.projectCount} projects have no findings.` : ""}`;
  }

  return {
    summary: summary.slice(0, 4000),
    findings,
    recommendedActions: adviceFor(signals),
    limitations: [
      "Produced by the built-in rule-based provider, not a language model: wording is templated and findings are limited to the defined checks.",
      "Forecasts are not made; findings describe records as they stand today.",
      ...input.limitations,
    ].slice(0, 10),
  };
}

const ACTORS = /\b(user|users|admin|administrator|customer|customers|manager|managers|developer|engineer|analyst|client|stakeholder|member|members|owner|reviewer|approver)\b/i;
const BUG_WORDS = /\b(bug|defect|broken|crash(es)?|fails?|failing|regression)\b/i;
const REQUIREMENT_WORDS = /\b(should|must|shall|need(s)? to|want(s)? to|wants?|can|able to|allow(s)?|so that|as an? )\b/i;

function candidates(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const line of lines) {
    // Prose lines are split into sentences; bullets and numbered lines stay whole.
    const parts = line.length > 160 ? line.split(/(?<=[.!?])\s+/) : [line];
    for (const part of parts) {
      const t = part.trim();
      if (t.length >= 12 && (REQUIREMENT_WORDS.test(t) || BUG_WORDS.test(t))) out.push(t);
    }
  }
  return out;
}

export function draftRequirements(text: string): RequirementsOutput {
  const found = candidates(text).slice(0, 15);
  const stories = found.map((sentence) => {
    const clauses = sentence
      .replace(/[.!?]+$/, "")
      .split(/;| and (?=\w+ )/)
      .map((c) => c.trim())
      .filter((c) => c.length >= 8)
      .slice(0, 4);
    return {
      title: (sentence.length > 90 ? `${sentence.slice(0, 87).trimEnd()}…` : sentence.replace(/[.!?]+$/, "")).slice(0, 300),
      description: sentence.slice(0, 2000),
      acceptanceCriteria: (clauses.length ? clauses : [sentence]).map((c) => `Verified: ${c}`.slice(0, 300)),
      type: BUG_WORDS.test(sentence) ? ("bug" as const) : ("story" as const),
    };
  });

  const openQuestions: string[] = [];
  if (stories.length > 0 && !ACTORS.test(text)) openQuestions.push("Who is the primary user or role these requirements serve?");
  if (/\b(tbd|etc\.?|and so on|to be decided)\b/i.test(text)) openQuestions.push("Some requirements are marked as undecided or open-ended; which are in scope?");
  if (stories.length > 0 && !/\b(by|before|deadline|due|target|sprint|release)\b/i.test(text)) openQuestions.push("Is there a target date or release these stories belong to?");

  return {
    summary: stories.length
      ? `Drafted ${stories.length} item${stories.length === 1 ? "" : "s"} from the notes. Review each before approving; nothing is created until it is approved.`
      : "No requirement statements were recognised. Describe what the system should do, for example “Users must be able to reset their password”.",
    stories,
    openQuestions,
    limitations: [
      "Produced by the built-in rule-based drafter, not a language model: stories mirror the wording of the notes and acceptance criteria are restatements to refine, not invented tests.",
      ...(found.length === 15 ? ["Only the first 15 requirement statements were drafted."] : []),
    ],
  };
}
