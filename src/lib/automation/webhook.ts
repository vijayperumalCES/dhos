import { createHmac, timingSafeEqual } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

import { eventLabel, summarizeEvent } from "./events";

/** What the worker receives from claim_webhook_deliveries. */
export type Delivery = {
  id: string;
  url: string;
  format: string;
  secret: string;
  event_type: string;
  payload: unknown;
  attempts: number;
};

export const SIGNATURE_HEADER = "X-Stride-Signature";
const TIMEOUT_MS = 8000;
const MAX_ERROR = 280;

/** `t=<unix seconds>,v1=<hex hmac-sha256 of "<t>.<body>">`. The timestamp lets receivers reject replays. */
export function signPayload(secret: string, timestamp: number, body: string): string {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

/** For receivers (and our tests): constant-time check of a signature header. */
export function verifySignature(secret: string, header: string, body: string, toleranceSeconds = 300, now = Date.now() / 1000): boolean {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(now - t) > toleranceSeconds || !parts.v1) return false;
  const expected = Buffer.from(signPayload(secret, t, body).split("v1=")[1], "hex");
  const given = Buffer.from(parts.v1, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;
}
const V4_BLOCKS: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 3],
];

/** True for loopback, private, link-local (cloud metadata), CGNAT, multicast and reserved ranges. */
export function isBlockedAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const n = ipv4ToInt(ip);
    return V4_BLOCKS.some(([base, bits]) => bits === 0 || n >>> (32 - bits) === ipv4ToInt(base) >>> (32 - bits));
  }
  if (kind === 6) {
    const lower = ip.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedAddress(mapped[1]);
    return lower === "::" || lower === "::1" || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || /^ff/.test(lower);
  }
  return true;
}

export type Resolver = (hostname: string) => Promise<string[]>;
const defaultResolver: Resolver = async (host) => (await dnsLookup(host, { all: true })).map((r) => r.address);

/**
 * Refuses anything but https to a public address. Every address the name resolves to must be public,
 * so a name that also points at an internal host is rejected. (A name can still change between this
 * check and the connection; egress filtering at the network layer is the backstop — see ADR-0012.)
 */
export async function assertPublicHttpsUrl(raw: string, resolve: Resolver = defaultResolver): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("The URL is not valid.");
  }
  if (url.protocol !== "https:") throw new Error("Only https URLs are allowed.");
  if (url.username || url.password) throw new Error("URLs with credentials are not allowed.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : await resolve(host).catch(() => []);
  if (addresses.length === 0) throw new Error("The host could not be resolved.");
  if (addresses.some(isBlockedAddress)) throw new Error("The host resolves to a private or reserved address.");
  return url;
}

type Body = { id?: string; type: string; occurredAt?: string; projectId?: string | null; data?: Record<string, unknown> };

/** Chat services get a readable line; everything else gets the signed JSON envelope. */
export function buildBody(format: string, event_type: string, payload: unknown, siteUrl: string): string {
  const p = (payload ?? {}) as Body;
  const summary = summarizeEvent(event_type, p.data ?? {});
  const link = p.projectId ? `${siteUrl}/projects/${p.projectId}` : siteUrl;
  if (format === "slack") return JSON.stringify({ text: `*${eventLabel(event_type)}*\n${summary}\n<${link}|Open in Stride>` });
  if (format === "teams") {
    return JSON.stringify({
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            type: "AdaptiveCard",
            version: "1.4",
            body: [
              { type: "TextBlock", weight: "Bolder", text: eventLabel(event_type), wrap: true },
              { type: "TextBlock", text: summary, wrap: true },
            ],
            actions: [{ type: "Action.OpenUrl", title: "Open in Stride", url: link }],
          },
        },
      ],
    });
  }
  return JSON.stringify(payload);
}

export type SendDeps = { fetch?: typeof fetch; resolve?: Resolver; now?: () => number; siteUrl: string };
export type SendResult = { status: number | null; error: string | null };

/** One delivery attempt. Never throws; redirects are not followed (a redirect is a failure). */
export async function sendWebhook(d: Delivery, deps: SendDeps): Promise<SendResult> {
  try {
    const url = await assertPublicHttpsUrl(d.url, deps.resolve);
    const body = buildBody(d.format, d.event_type, d.payload, deps.siteUrl);
    const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "Stride-Webhooks/1", "x-stride-event": d.event_type, "x-stride-delivery": d.id };
    if (d.format === "generic") headers[SIGNATURE_HEADER] = signPayload(d.secret, Math.floor((deps.now?.() ?? Date.now()) / 1000), body);
    const res = await (deps.fetch ?? fetch)(url, { method: "POST", headers, body, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
    await res.body?.cancel().catch(() => undefined);
    return { status: res.status, error: res.status >= 200 && res.status < 300 ? null : `The endpoint answered HTTP ${res.status}.` };
  } catch (e) {
    const message = e instanceof Error ? (e.name === "TimeoutError" ? "The endpoint did not answer in time." : e.message) : "Delivery failed.";
    return { status: null, error: message.slice(0, MAX_ERROR) };
  }
}
