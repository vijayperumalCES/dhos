import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireOrgContext } from "@/lib/auth/org-context";

import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Organization settings" };

export default async function AdminSettingsPage() {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("org.settings.manage")) {
    redirect(ctx.permissions.has("org.members.read") ? "/admin/members" : "/admin/audit");
  }
  return (
    <SettingsForm
      defaultValues={{
        name: ctx.organization.name,
        timezone: ctx.settings.timezone,
        currencyCode: ctx.settings.currencyCode,
        healthStaleAfterDays: String(ctx.settings.healthStaleAfterDays),
      }}
    />
  );
}
