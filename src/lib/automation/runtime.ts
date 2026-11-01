import "server-only";

import { env } from "@/lib/env";

import type { Deps } from "./dispatcher";
import { resolveEmailProvider } from "./email";

/** The real dependencies for a tick: fetch, DNS, the configured email provider. */
export function defaultDeps(): Deps {
  return { email: resolveEmailProvider(process.env), send: { siteUrl: env.NEXT_PUBLIC_SITE_URL }, siteUrl: env.NEXT_PUBLIC_SITE_URL };
}
