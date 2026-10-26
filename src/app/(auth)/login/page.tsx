import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  const isLocal = process.env.NODE_ENV !== "production";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-muted-foreground">Use your work email and password.</p>
      </div>
      {error === "confirm" && (
        <p role="alert" className="rounded-md border px-3 py-2 text-sm">
          That confirmation link is invalid or has expired. Sign in or request a new link.
        </p>
      )}
      <LoginForm next={typeof next === "string" ? next : undefined} />
      <p className="text-sm text-muted-foreground">
        New to DHOS?{" "}
        <Link href="/signup" className="font-medium text-primary underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
      {isLocal && (
        <div className="rounded-lg border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Local demo accounts</p>
          <p className="mt-1">
            Seeded by <code>supabase db reset</code>. Password for all: <code>DemoPass123</code>
          </p>
          <ul className="mt-2 space-y-0.5">
            <li>
              <code>priya@northwind.example</code> — Delivery Head + Admin
            </li>
            <li>
              <code>arjun@northwind.example</code> — Project Manager
            </li>
            <li>
              <code>dev@northwind.example</code> — Developer
            </li>
            <li>
              <code>omar@northwind.example</code> — Org Admin only
            </li>
            <li>
              <code>claire@contoso.example</code> — Client stakeholder
            </li>
          </ul>
          <p className="mt-2">This panel is hidden in production builds.</p>
        </div>
      )}
    </div>
  );
}
