import type { Metadata } from "next";

import { SetPasswordForm } from "@/components/auth/set-password-form";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/auth/org-context";

import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profile" };

export default async function AccountPage() {
  const ctx = await requireOrgContext();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Your profile" breadcrumbs={[{ label: "Profile" }]} />
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>{ctx.user.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm displayName={ctx.user.displayName} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Change the password you use to sign in. Forgotten it? Sign out and use “Forgot password?”.</CardDescription>
        </CardHeader>
        <CardContent className="max-w-md">
          <SetPasswordForm submitLabel="Change password" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Access in {ctx.organization.name}</CardTitle>
          <CardDescription>Your roles and the permissions they grant. Ask an administrator to change them.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1">
            {ctx.roles.map((r) => (
              <Badge key={r.key}>{r.name}</Badge>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {ctx.permissions.toArray().map((p) => (
              <code key={p} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                {p}
              </code>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
