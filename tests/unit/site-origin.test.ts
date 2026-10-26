import { describe, expect, it } from "vitest";

import { resolveSiteOrigin } from "@/lib/auth/site-origin";

const h = (values: Record<string, string>) => new Headers(values);
const FALLBACK = "http://localhost:3100/";

describe("resolveSiteOrigin", () => {
  it("uses the forwarded host and protocol from the hosting proxy", () => {
    expect(resolveSiteOrigin(h({ "x-forwarded-host": "stride.example.com", "x-forwarded-proto": "https", host: "internal:3000" }), FALLBACK)).toBe(
      "https://stride.example.com",
    );
  });

  it("takes the first value of comma-separated forwarded headers", () => {
    expect(resolveSiteOrigin(h({ "x-forwarded-host": "a.example.com, b.internal", "x-forwarded-proto": "https,http" }), FALLBACK)).toBe(
      "https://a.example.com",
    );
  });

  it("defaults to https for public hosts and http for localhost", () => {
    expect(resolveSiteOrigin(h({ host: "stride.example.com" }), FALLBACK)).toBe("https://stride.example.com");
    expect(resolveSiteOrigin(h({ host: "localhost:3100" }), FALLBACK)).toBe("http://localhost:3100");
  });

  it("falls back to the configured site URL when the host is missing or malformed", () => {
    expect(resolveSiteOrigin(h({}), FALLBACK)).toBe("http://localhost:3100");
    expect(resolveSiteOrigin(h({ host: "evil.example/path?x=1" }), FALLBACK)).toBe("http://localhost:3100");
  });
});
