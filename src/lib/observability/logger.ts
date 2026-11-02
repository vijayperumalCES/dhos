/**
 * Structured logging: one JSON object per line on stdout/stderr, which Vercel, Datadog, Loki and
 * CloudWatch all ingest without a parser. Fields named like secrets are redacted so a log line can
 * never carry a token, password or webhook secret even if a caller passes the wrong object.
 */

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SECRET_KEY = /secret|token|password|authorization|cookie|api[-_]?key|signature/i;
const MAX_STRING = 500;
const MAX_DEPTH = 4;

function threshold(): number {
  const configured = (process.env.LOG_LEVEL ?? "").toLowerCase() as Level;
  return ORDER[configured] ?? ORDER.info;
}

export function redact(value: unknown, depth = 0): unknown {
  if (value instanceof Error) return { name: value.name, message: value.message.slice(0, MAX_STRING) };
  if (typeof value === "string") return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  const out: Fields = {};
  for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
  return out;
}

export function formatLine(level: Level, message: string, fields: Fields = {}, now = new Date()): string {
  return JSON.stringify({
    ts: now.toISOString(),
    level,
    service: process.env.OTEL_SERVICE_NAME ?? "stride-ces",
    message,
    ...(redact(fields) as Fields),
  });
}

function emit(level: Level, message: string, fields?: Fields) {
  if (ORDER[level] < threshold()) return;
  const line = formatLine(level, message, fields);
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (message: string, fields?: Fields) => emit("debug", message, fields),
  info: (message: string, fields?: Fields) => emit("info", message, fields),
  warn: (message: string, fields?: Fields) => emit("warn", message, fields),
  error: (message: string, fields?: Fields) => emit("error", message, fields),
};
