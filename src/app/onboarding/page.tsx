import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { acceptInvitationsAndContinue } from "@/lib/actions/organization";
import { signOut } from "@/lib/actions/auth";
import { getOrgContext } from "@/lib/auth/org-context";
import { requireUser } from "@/lib/auth/session";

import { CreateOrganizationForm } from "./create-organization-form";

export const metadata: Metadata = { title: "Get started" };

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const user = await requireUser();
  const { new: wantsNew, invites } = await searchParams;
  const ctx = await getOrgContext();
  if (ctx && !wantsNew) redirect("/dashboard");

  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col justify-center gap-6 px-4 py-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{ctx ? "Create another organization" : "Welcome to Stride"}</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {user.email}.{" "}
          {ctx ? (
            <Link href="/dashboard" className="text-primary hover:underline">
              Back to {ctx.organization.name}
            </Link>
          ) : (
            "You are not a member of any organization yet."
          )}
        </p>
      </div>

      {!ctx && (
        <Card>
          <CardHeader>
            <CardTitle>Were you invited?</CardTitle>
            <CardDescription>
              Invitations are matched to your verified email address. Email delivery of invitations is not configured
              yet, so ask your administrator to invite <strong>{user.email}</strong>, then check again.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <form action={acceptInvitationsAndContinue}>
              <Button type="submit" variant="outline">
                Check for invitations
              </Button>
            </form>
            {invites === "none" && <span className="text-sm text-muted-foreground">No pending invitations found.</span>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Create an organization</CardTitle>
          <CardDescription>
            You become its Organization Administrator and Delivery Head. You can invite colleagues and assign roles
            afterwards.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateOrganizationForm />
        </CardContent>
      </Card>

      {!ctx && (
        <form action={signOut}>
          <Button type="submit" variant="link" className="px-0 text-muted-foreground">
            Sign out
          </Button>
        </form>
      )}
    </div>
  );
}
