import { SpanStatusCode, trace } from "@opentelemetry/api";

const tracer = trace.getTracer("stride-ces");

/**
 * Runs `fn` inside a span. With no OpenTelemetry SDK registered the API returns a no-op tracer, so
 * this costs nothing until OTEL_EXPORTER_OTLP_ENDPOINT is configured (see src/instrumentation.ts).
 */
export async function withSpan<T>(name: string, attributes: Record<string, string | number | boolean>, fn: () => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn();
    } catch (e) {
      span.recordException(e instanceof Error ? e : new Error(String(e)));
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw e;
    } finally {
      span.end();
    }
  });
}
