import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/session";

import { MfaForm } from "./mfa-form";

export const metadata: Metadata = { title: "Verify your identity" };

export default async function MfaPage() {
  const user = await requireUser();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Verify your identity</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {user.email}. Your organization requires a second step with an authenticator app.
        </p>
      </div>
      <MfaForm />
    </div>
  );
}
