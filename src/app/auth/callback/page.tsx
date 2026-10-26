"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { safeNextPath } from "@/lib/validation/auth";

/**
 * Landing page for links that carry the session in the URL fragment (implicit flow), which the
 * server never sees: invitation emails. PKCE links (`?code=`) are forwarded to /auth/confirm.
 */
function Callback() {
  const router = useRouter();
  const params = useSearchParams();
  const [message, setMessage] = useState("Signing you in…");
  // The fragment is consumed on first read, so run exactly once (dev mode mounts effects twice).
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    completeSignIn(params.get("next"), params.get("code")).then((result) => {
      if (result.ok) router.replace(result.next);
      else setMessage(result.error);
    });
  }, [params, router]);

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
        {message !== "Signing you in…" && (
          <a href="/login" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
            Go to sign in
          </a>
        )}
      </div>
    </main>
  );
}

const INVALID = "This sign-in link is invalid or has expired.";

async function completeSignIn(
  nextParam: string | null,
  code: string | null,
): Promise<{ ok: true; next: string } | { ok: false; error: string }> {
  const next = safeNextPath(nextParam ?? "/welcome");
  if (code) {
    window.location.replace(`/auth/confirm?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`);
    return new Promise(() => {}); // navigating away
  }

  const hash = new URLSearchParams(window.location.hash.slice(1));
  // Drop tokens from the address bar and history straight away.
  window.history.replaceState(null, "", window.location.pathname);
  if (hash.get("error")) return { ok: false, error: hash.get("error_description") ?? INVALID };

  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (!accessToken || !refreshToken) return { ok: false, error: INVALID };

  const { error } = await createSupabaseBrowserClient().auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  return error ? { ok: false, error: INVALID } : { ok: true, next };
}

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <Callback />
    </Suspense>
  );
}
