import { NextResponse } from "next/server";

import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Liveness and readiness for load balancers and uptime monitors. Public, returns no tenant data:
 * only whether this process is up and whether Supabase Auth answers.
 */
export async function GET() {
  const started = Date.now();
  let database: "ok" | "unreachable" = "unreachable";
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
      signal: AbortSignal.timeout(2500),
      cache: "no-store",
    });
    if (res.ok) database = "ok";
  } catch {
    // reported as unreachable below
  }
  const ok = database === "ok";
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", database, latencyMs: Date.now() - started, release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
