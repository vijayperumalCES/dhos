import { describe, expect, it } from "vitest";

import { formatLine, redact } from "@/lib/observability/logger";

describe("structured logger", () => {
  it("emits one parseable JSON line with level, message and service", () => {
    const line = formatLine("info", "hello", { n: 1 }, new Date("2026-11-06T10:00:00Z"));
    expect(JSON.parse(line)).toMatchObject({ ts: "2026-11-06T10:00:00.000Z", level: "info", message: "hello", n: 1, service: "stride-ces" });
    expect(line.includes("\n")).toBe(false);
  });

  it("redacts secret-looking keys at any depth", () => {
    const out = redact({ ok: "x", token: "abc", nested: { Authorization: "Bearer z", webhook_secret: "s", keep: 1 }, list: [{ apiKey: "k" }] });
    expect(out).toEqual({ ok: "x", token: "[redacted]", nested: { Authorization: "[redacted]", webhook_secret: "[redacted]", keep: 1 }, list: [{ apiKey: "[redacted]" }] });
  });

  it("reduces errors to name and message (no stack, no cause)", () => {
    const out = redact({ error: new TypeError("boom") }) as { error: Record<string, unknown> };
    expect(out.error).toEqual({ name: "TypeError", message: "boom" });
  });

  it("truncates long strings, long arrays and deep objects", () => {
    expect((redact("a".repeat(900)) as string).length).toBe(501);
    expect((redact(Array.from({ length: 50 }, (_, i) => i)) as number[]).length).toBe(20);
    expect(JSON.stringify(redact({ a: { b: { c: { d: { e: 1 } } } } }))).toContain("[truncated]");
  });
});
