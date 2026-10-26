/**
 * Resolves the public origin (scheme + host) the app is being served from, so links in auth
 * emails point back to the same deployment the user signed up on rather than a hard-coded
 * localhost. Forwarded headers are set by Vercel and most reverse proxies.
 *
 * Header values are not trusted for security: Supabase only honours a redirect that matches
 * the project's Redirect URLs allow-list and otherwise falls back to the Site URL.
 */
export function resolveSiteOrigin(headers: Pick<Headers, "get">, fallback: string): string {
  const host = first(headers.get("x-forwarded-host")) ?? headers.get("host");
  if (!host || !/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) return stripSlash(fallback);

  const forwardedProto = first(headers.get("x-forwarded-proto"));
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
  const proto = forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : local ? "http" : "https";
  return `${proto}://${host}`;
}

function first(value: string | null): string | undefined {
  return value?.split(",")[0]?.trim() || undefined;
}

function stripSlash(url: string): string {
  return url.replace(/\/+$/, "");
}
