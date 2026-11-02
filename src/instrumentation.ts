import type { Instrumentation } from "next";

import { log } from "@/lib/observability/logger";

/**
 * Tracing is opt-in: with OTEL_EXPORTER_OTLP_ENDPOINT set (and optionally OTEL_EXPORTER_OTLP_HEADERS,
 * OTEL_SERVICE_NAME) Next.js's built-in spans plus ours are exported over OTLP/HTTP. Without it the
 * SDK is never loaded.
 */
export async function register() {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;
  const { registerOTel } = await import("@vercel/otel");
  registerOTel({ serviceName: process.env.OTEL_SERVICE_NAME ?? "stride-ces" });
}

/** Every unhandled server error becomes one structured log line, tied to the route that failed. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  log.error("unhandled request error", {
    error: err,
    digest: typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined,
    method: request.method,
    path: request.path,
    routePath: context.routePath,
    routeType: context.routeType,
    renderSource: context.renderSource,
  });
};
