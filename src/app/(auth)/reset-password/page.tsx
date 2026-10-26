import type { Metadata } from "next";

import { SetPasswordForm } from "@/components/auth/set-password-form";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Choose a new password" };

/** Reached from a password-reset email after /auth/confirm has established a session. */
export default async function ResetPasswordPage() {
  const user = await requireUser();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="text-sm text-muted-foreground">For {user.email}</p>
      </div>
      <SetPasswordForm submitLabel="Update password" redirectTo="/dashboard" />
    </div>
  );
}
