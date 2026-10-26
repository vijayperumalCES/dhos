import type { Metadata } from "next";
import Link from "next/link";

import { SetPasswordForm } from "@/components/auth/set-password-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrgContext } from "@/lib/auth/org-context";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Welcome" };

/** Landing page for invitation links: accepts pending invitations and offers to set a password. */
export default async function WelcomePage() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("accept_pending_invitations");
  const ctx = await getOrgContext();

  return (
    <div className="mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-6 px-4 py-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to Stride</h1>
        <p className="text-sm text-muted-foreground">
          {ctx ? (
            <>
              You&apos;re a member of <strong>{ctx.organizations.map((o) => o.name).join(", ")}</strong>.
            </>
          ) : (
            <>No pending invitation was found for {user.email}.</>
          )}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Set a password</CardTitle>
          <CardDescription>
            So you can sign in with {user.email} and a password next time. Skip this if you already have one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SetPasswordForm submitLabel="Set password and continue" redirectTo={ctx ? "/dashboard" : "/onboarding"} />
        </CardContent>
      </Card>

      <Button asChild variant="link" className="self-start px-0">
        <Link href={ctx ? "/dashboard" : "/onboarding"}>Skip for now</Link>
      </Button>
    </div>
  );
}
