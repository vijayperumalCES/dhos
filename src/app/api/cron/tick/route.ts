import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { runTick } from "@/lib/automation/dispatcher";
import { defaultDeps } from "@/lib/automation/runtime";
import { log } from "@/lib/observability/logger";
import { withSpan } from "@/lib/observability/tracing";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * The scheduler's heartbeat: call every minute or so (Vercel Cron, a GitHub Actions schedule or
 * pg_cron + pg_net — see docs/DEPLOYMENT.md) with `Authorization: Bearer $CRON_SECRET`. Safe to call
 * concurrently or twice; every step claims its rows with SKIP LOCKED and is idempotent.
 */
async function tick(request: NextRequest) {
  if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 16) {
    return NextResponse.json({ error: "CRON_SECRET is not configured (at least 16 characters)." }, { status: 503 });
  }
  if (!authorized(request)) {
    log.warn("scheduler tick rejected: bad bearer token");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = createSupabaseServiceClient();
  if (!db) return NextResponse.json({ error: "SUPABASE_SECRET_KEY is not configured." }, { status: 503 });
  const summary = await withSpan("automation.tick", {}, () => runTick(db, defaultDeps()));
  const failed = summary.events.failed + summary.webhooks.failed + summary.emails.failed + summary.jobs.failed;
  const fields = { events: summary.events.claimed, webhooks: summary.webhooks.attempted, emails: summary.emails.attempted, jobs: summary.jobs.run, failed, errors: summary.errors };
  if (summary.errors.length > 0) log.error("scheduler tick finished with stage errors", fields);
  else log.info("scheduler tick", fields);
  return NextResponse.json(summary);
}

export const GET = tick;
export const POST = tick;
