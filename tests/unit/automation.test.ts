import { describe, expect, it, vi } from "vitest";

import { externalUrl, mockStatus, resolveAdapter } from "@/lib/automation/adapters";
import { runTick, syncConnection, type Deps } from "@/lib/automation/dispatcher";
import { composeEmail, resolveEmailProvider } from "@/lib/automation/email";
import { EVENTS, EVENT_TYPES, summarizeEvent } from "@/lib/automation/events";
import { describeRule, dryRun, evaluateConditions, parseConditions, ruleDefinitionSchema } from "@/lib/automation/rules";
import { assertPublicHttpsUrl, buildBody, isBlockedAddress, sendWebhook, signPayload, verifySignature, type Delivery } from "@/lib/automation/webhook";

describe("rule conditions", () => {
  const payload = { to: "red", from: "green", score: 20, code: "NW-PAY" };

  it("matches every event when there are no conditions", () => {
    expect(evaluateConditions([], payload)).toBe(true);
  });
  it("requires all conditions", () => {
    expect(evaluateConditions([{ field: "to", op: "eq", value: "red" }, { field: "score", op: "gte", value: "15" }], payload)).toBe(true);
    expect(evaluateConditions([{ field: "to", op: "eq", value: "red" }, { field: "score", op: "gte", value: "25" }], payload)).toBe(false);
  });
  it("supports in, contains, neq and lte", () => {
    expect(evaluateConditions([{ field: "to", op: "in", value: "amber, red" }], payload)).toBe(true);
    expect(evaluateConditions([{ field: "code", op: "contains", value: "pay" }], payload)).toBe(true);
    expect(evaluateConditions([{ field: "from", op: "neq", value: "green" }], payload)).toBe(false);
    expect(evaluateConditions([{ field: "score", op: "lte", value: "20" }], payload)).toBe(true);
  });
  it("treats a missing field as not equal and numeric operators on text as false", () => {
    expect(evaluateConditions([{ field: "nope", op: "eq", value: "x" }], payload)).toBe(false);
    expect(evaluateConditions([{ field: "nope", op: "neq", value: "x" }], payload)).toBe(true);
    expect(evaluateConditions([{ field: "to", op: "gte", value: "1" }], payload)).toBe(false);
  });
  it("never matches stored conditions that fail the schema", () => {
    expect(parseConditions([{ field: "to", op: "regex", value: ".*" }])).toBeNull();
    expect(parseConditions("nonsense")).toBeNull();
  });
});

describe("rule definitions", () => {
  const base = { triggerEvent: "raid.created", conditions: [], actions: [{ type: "notify", to: "project_manager", title: "New risk", severity: "info" }] };
  it("accepts a valid rule", () => {
    expect(ruleDefinitionSchema.safeParse(base).success).toBe(true);
  });
  it("requires at least one action and a known event", () => {
    expect(ruleDefinitionSchema.safeParse({ ...base, actions: [] }).success).toBe(false);
    expect(ruleDefinitionSchema.safeParse({ ...base, triggerEvent: "made.up" }).success).toBe(false);
  });
  it("requires a role or person when the recipient needs one", () => {
    expect(ruleDefinitionSchema.safeParse({ ...base, actions: [{ type: "notify", to: "role", title: "x1", severity: "info" }] }).success).toBe(false);
    expect(ruleDefinitionSchema.safeParse({ ...base, actions: [{ type: "notify", to: "role", roleKey: "developer", title: "x1", severity: "info" }] }).success).toBe(true);
  });
  it("rejects more than five actions", () => {
    const a = { type: "notify", to: "assignee", title: "hi", severity: "info" };
    expect(ruleDefinitionSchema.safeParse({ ...base, actions: [a, a, a, a, a, a] }).success).toBe(false);
  });
  it("dry-runs against recent events without side effects", () => {
    const events = [
      { id: "1", eventType: "raid.created", createdAt: "", payload: { score: 20 } },
      { id: "2", eventType: "raid.created", createdAt: "", payload: { score: 4 } },
      { id: "3", eventType: "escalation.raised", createdAt: "", payload: {} },
    ];
    const r = dryRun({ triggerEvent: "raid.created", conditions: [{ field: "score", op: "gte", value: "15" }] }, events);
    expect(r.considered).toBe(2);
    expect(r.matched.map((e) => e.id)).toEqual(["1"]);
  });
  it("describes a rule in words", () => {
    const text = describeRule({ triggerEvent: "raid.created", conditions: [{ field: "score", op: "gte", value: "15" }], actions: [{ type: "notify", to: "project_manager", title: "x1", severity: "info" }] }, { event: "RAID item created" });
    expect(text).toContain("RAID item created");
    expect(text).toContain("score is at least 15");
  });
});

describe("event catalogue", () => {
  it("only offers event names the outbox can hold", () => {
    for (const t of EVENT_TYPES) expect(t).toMatch(/^[a-z_]+\.[a-z_]+$/);
  });
  it("matches the event types the database triggers and jobs emit", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync("supabase/migrations/20261105000100_automation.sql", "utf8");
    const emitted = new Set([...sql.matchAll(/'((?:[a-z_]+)\.(?:[a-z_]+))', '(?:[a-z_]+)', (?:new|r|l|m|x)\.id|emit_event\([^,]+, '([a-z_.]+)'/g)].map((m) => m[2] ?? m[1]));
    for (const t of emitted) if (t) expect(Object.keys(EVENTS), t).toContain(t);
    for (const t of ["project.health_changed", "work_item.blocked", "timesheet.missing", "escalation.overdue", "integration.link_status_changed"]) expect(sql).toContain(`'${t}'`);
  });
  it("summarizes events from short labels", () => {
    expect(summarizeEvent("project.health_changed", { code: "NW", from: "green", to: "red" })).toBe("NW health: green → red");
  });
});

describe("webhook signing", () => {
  const body = '{"a":1}';
  it("signs and verifies", () => {
    const header = signPayload("whsec_x", 1_000, body);
    expect(header).toMatch(/^t=1000,v1=[0-9a-f]{64}$/);
    expect(verifySignature("whsec_x", header, body, 300, 1_100)).toBe(true);
  });
  it("rejects a wrong secret, a tampered body and a replay", () => {
    const header = signPayload("whsec_x", 1_000, body);
    expect(verifySignature("whsec_y", header, body, 300, 1_100)).toBe(false);
    expect(verifySignature("whsec_x", header, '{"a":2}', 300, 1_100)).toBe(false);
    expect(verifySignature("whsec_x", header, body, 300, 5_000)).toBe(false);
  });
});

describe("outbound URL guard", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"])("blocks %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });
  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "52.1.2.3", "2606:4700:4700::1111"])("allows %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });
  it("refuses http, credentials and unresolvable or internal names", async () => {
    const pub = async () => ["93.184.216.34"];
    await expect(assertPublicHttpsUrl("http://example.com/x", pub)).rejects.toThrow(/https/);
    await expect(assertPublicHttpsUrl("https://user:pw@example.com/x", pub)).rejects.toThrow(/credentials/);
    await expect(assertPublicHttpsUrl("https://internal.example.com", async () => ["10.0.0.5"])).rejects.toThrow(/private/);
    await expect(assertPublicHttpsUrl("https://mixed.example.com", async () => ["93.184.216.34", "127.0.0.1"])).rejects.toThrow(/private/);
    await expect(assertPublicHttpsUrl("https://gone.example.com", async () => [])).rejects.toThrow(/resolved/);
    await expect(assertPublicHttpsUrl("https://169.254.169.254/latest", pub)).rejects.toThrow(/private/);
    await expect(assertPublicHttpsUrl("https://example.com/ok", pub)).resolves.toBeInstanceOf(URL);
  });
});

describe("webhook delivery", () => {
  const delivery: Delivery = { id: "d1", url: "https://hooks.example.com/in", format: "generic", secret: "whsec_s", event_type: "raid.created", payload: { id: "e1", type: "raid.created", data: { title: "Vendor slips", type: "risk" } }, attempts: 1 };
  const deps = (fetchImpl: typeof fetch) => ({ fetch: fetchImpl, resolve: async () => ["93.184.216.34"], now: () => 2_000_000, siteUrl: "https://stride.test" });

  it("posts the signed envelope without following redirects", async () => {
    const f = vi.fn(async () => new Response(null, { status: 204 }));
    const r = await sendWebhook(delivery, deps(f as never));
    expect(r).toEqual({ status: 204, error: null });
    const [, init] = f.mock.calls[0] as unknown as [URL, RequestInit];
    expect(init.redirect).toBe("manual");
    const headers = init.headers as Record<string, string>;
    expect(verifySignature("whsec_s", headers["X-Stride-Signature"], init.body as string, 300, 2_000)).toBe(true);
    expect(headers["x-stride-event"]).toBe("raid.created");
  });
  it("reports non-2xx (including redirects) as failures", async () => {
    expect((await sendWebhook(delivery, deps((async () => new Response(null, { status: 302 })) as never))).error).toMatch(/302/);
    expect((await sendWebhook(delivery, deps((async () => new Response(null, { status: 500 })) as never))).status).toBe(500);
  });
  it("never calls out to a blocked host", async () => {
    const f = vi.fn();
    const r = await sendWebhook({ ...delivery, url: "https://evil.example.com" }, { ...deps(f as never), resolve: async () => ["169.254.169.254"] });
    expect(r.status).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it("turns network errors into a recorded failure", async () => {
    const r = await sendWebhook(delivery, deps((async () => { throw new Error("socket hang up"); }) as never));
    expect(r).toEqual({ status: null, error: "socket hang up" });
  });
  it("formats chat payloads and leaves them unsigned", async () => {
    expect(JSON.parse(buildBody("slack", "raid.created", delivery.payload, "https://s.test")).text).toContain("Vendor slips");
    expect(JSON.parse(buildBody("teams", "raid.created", delivery.payload, "https://s.test")).attachments[0].contentType).toContain("adaptive");
    const f = vi.fn(async () => new Response(null, { status: 200 }));
    await sendWebhook({ ...delivery, format: "teams" }, deps(f as never));
    expect(((f.mock.calls[0] as unknown as [URL, RequestInit])[1].headers as Record<string, string>)["X-Stride-Signature"]).toBeUndefined();
  });
});

describe("email", () => {
  it("is simulated without credentials and says so", async () => {
    const p = resolveEmailProvider({});
    expect(p.name).toBe("simulated");
    expect(await p.send({ to: "a@b.c", subject: "s", text: "t" })).toBe("simulated");
  });
  it("sends through Resend when configured and surfaces failures", async () => {
    const ok = vi.fn(async () => new Response("{}", { status: 200 }));
    const p = resolveEmailProvider({ RESEND_API_KEY: "k", EMAIL_FROM: "Stride <n@x.test>" }, ok as never);
    expect(await p.send({ to: "a@b.c", subject: "s", text: "t" })).toBe("sent");
    expect(JSON.parse((ok.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).to).toEqual(["a@b.c"]);
    const bad = resolveEmailProvider({ RESEND_API_KEY: "k", EMAIL_FROM: "n@x.test" }, (async () => new Response("no", { status: 500 })) as never);
    await expect(bad.send({ to: "a@b.c", subject: "s", text: "t" })).rejects.toThrow(/500/);
  });
  it("composes a message that links back into the app", () => {
    const m = composeEmail({ to_email: "a@b.c", title: "Timesheet not submitted", body: "Week of 2026-06-01", link: "/timesheets", organization_name: "Acme" }, "https://s.test");
    expect(m.subject).toBe("[Acme] Timesheet not submitted");
    expect(m.text).toContain("https://s.test/timesheets");
  });
});

describe("mock integration adapters", () => {
  const linked = new Date("2026-06-01T00:00:00Z");
  it("moves an issue through its provider's statuses as days pass", () => {
    expect(mockStatus("jira", linked, new Date("2026-06-01T10:00:00Z"))).toBe("To Do");
    expect(mockStatus("jira", linked, new Date("2026-06-02T10:00:00Z"))).toBe("In Progress");
    expect(mockStatus("jira", linked, new Date("2026-06-05T10:00:00Z"))).toBe("Done");
    expect(mockStatus("github", linked, new Date("2026-06-09T00:00:00Z"))).toBe("closed");
  });
  it("refuses live mode and unknown providers", () => {
    expect(() => resolveAdapter("jira", "live")).toThrow();
    expect(() => resolveAdapter("trello", "mock")).toThrow();
  });
  it("builds links only from valid configuration", () => {
    expect(externalUrl("github", { repo: "acme/app" }, "acme/app#7")).toBe("https://github.com/acme/app/issues/7");
    expect(externalUrl("github", { repo: "javascript:alert(1)//x" }, "x#7")).toBeNull();
    expect(externalUrl("jira", { site: "acme.atlassian.net" }, "PAY-12")).toBe("https://acme.atlassian.net/browse/PAY-12");
    expect(externalUrl("jira", { site: "evil.com/x" }, "PAY-12")).toBeNull();
  });
});

// A scripted stand-in for the service-role client: records each RPC and answers from a table.
function fakeDb(answers: Record<string, (args: Record<string, unknown>) => unknown>) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const db = {
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      calls.push({ name, args });
      const a = answers[name];
      if (!a) return { data: null, error: null };
      try {
        return { data: a(args), error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    },
  };
  return { db: db as never, calls };
}

const deps = (over: Partial<Deps> = {}): Deps => ({
  email: { name: "simulated", send: async () => "simulated" },
  send: { fetch: (async () => new Response(null, { status: 200 })) as never, resolve: async () => ["93.184.216.34"], siteUrl: "https://s.test" },
  siteUrl: "https://s.test",
  now: () => new Date("2026-06-10T00:00:00Z"),
  ...over,
});

describe("dispatcher", () => {
  it("applies only the rules whose conditions hold, then fans the event out", async () => {
    const { db, calls } = fakeDb({
      claim_outbox_events: () => [{ id: "e1", payload: { to: "red" } }],
      rule_candidates: () => [
        { rule_id: "r-red", conditions: [{ field: "to", op: "eq", value: "red" }] },
        { rule_id: "r-green", conditions: [{ field: "to", op: "eq", value: "green" }] },
        { rule_id: "r-broken", conditions: "garbage" },
      ],
      apply_workflow_rule: () => ({ applied: true }),
      fan_out_event: () => ({ notifications: 2, deliveries: 1 }),
    });
    const s = await runTick(db, deps());
    expect(calls.filter((c) => c.name === "apply_workflow_rule").map((c) => c.args.p_rule)).toEqual(["r-red"]);
    expect(s.events).toMatchObject({ claimed: 1, processed: 1, failed: 0, rulesApplied: 1, notifications: 2, deliveriesQueued: 1 });
    expect(calls.at(-1)?.name).toBe("record_heartbeat");
  });

  it("schedules a retry for an event that fails and keeps going", async () => {
    const { db, calls } = fakeDb({
      claim_outbox_events: () => [{ id: "bad", payload: {} }, { id: "good", payload: {} }],
      rule_candidates: () => [],
      fan_out_event: (a) => {
        if (a.p_event === "bad") throw new Error("boom");
        return { notifications: 0, deliveries: 0 };
      },
    });
    const s = await runTick(db, deps());
    expect(s.events).toMatchObject({ processed: 1, failed: 1 });
    expect(calls.find((c) => c.name === "fail_outbox_event")?.args).toMatchObject({ p_event: "bad", p_error: "boom" });
  });

  it("isolates stages: a failing stage does not stop the others or the heartbeat", async () => {
    const { db, calls } = fakeDb({
      claim_outbox_events: () => {
        throw new Error("db down");
      },
      claim_webhook_deliveries: () => [{ id: "d1", url: "https://h.example.com", format: "generic", secret: "s", event_type: "raid.created", payload: {}, attempts: 1 }],
    });
    const s = await runTick(db, deps());
    expect(s.errors[0]).toContain("events: db down");
    expect(s.webhooks).toMatchObject({ attempted: 1, succeeded: 1 });
    expect(calls.find((c) => c.name === "complete_webhook_delivery")?.args).toMatchObject({ p_delivery: "d1", p_status: 200 });
    expect(calls.at(-1)?.name).toBe("record_heartbeat");
  });

  it("records email outcomes, including provider failures", async () => {
    const { db, calls } = fakeDb({
      claim_pending_emails: () => [
        { id: "n1", to_email: "a@b.c", title: "t", body: null, link: "/x", organization_name: "Acme" },
        { id: "n2", to_email: "d@e.f", title: "t", body: null, link: null, organization_name: "Acme" },
      ],
    });
    let n = 0;
    const s = await runTick(db, deps({ email: { name: "resend", send: async () => { if (++n === 2) throw new Error("rejected"); return "sent"; } } }));
    expect(s.emails).toMatchObject({ attempted: 2, sent: 1, failed: 1 });
    expect(calls.filter((c) => c.name === "complete_notification_email").map((c) => c.args.p_status)).toEqual(["sent", "error"]);
  });

  it("runs database jobs through run_scheduled_job and integration sync in the app", async () => {
    const { db, calls } = fakeDb({
      claim_due_jobs: () => [
        { id: "j1", key: "retention", organization_id: "o1" },
        { id: "j2", key: "integration_sync", organization_id: "o1" },
      ],
      run_scheduled_job: () => ({ events: 0 }),
      due_integration_connections: () => [{ id: "c1", organization_id: "o1", provider: "jira", mode: "mock", config: {} }, { id: "c2", organization_id: "o2", provider: "jira", mode: "mock", config: {} }],
      integration_sync_inputs: () => [{ link_id: "l1", external_id: "PAY-1", external_status: "To Do", created_at: "2026-06-01T00:00:00Z" }],
      apply_integration_status: () => true,
    });
    const s = await runTick(db, deps());
    expect(s.jobs).toEqual({ run: 2, failed: 0 });
    expect(calls.filter((c) => c.name === "integration_sync_inputs").map((c) => c.args.p_connection)).toEqual(["c1"]);
    expect(calls.find((c) => c.name === "apply_integration_status")?.args).toEqual({ p_link: "l1", p_status: "Done" });
    expect(calls.find((c) => c.name === "record_job_result")?.args).toMatchObject({ p_job: "j2", p_status: "succeeded" });
  });

  it("records a failed sync and the connection's error", async () => {
    const { db, calls } = fakeDb({ integration_sync_inputs: () => { throw new Error("rate limited"); } });
    const r = await syncConnection(db, { id: "c1", provider: "github", mode: "mock" }, {});
    expect(r.ok).toBe(false);
    expect(calls.find((c) => c.name === "record_integration_sync")?.args).toMatchObject({ p_status: "failed", p_error: "rate limited" });
  });
});
