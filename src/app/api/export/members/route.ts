import { NextResponse } from "next/server";

import { requireOrgContext } from "@/lib/auth/org-context";
import { csvResponse, toCsv } from "@/lib/csv";
import { listMembers } from "@/lib/data/members";

/** CSV of the member directory (requires org.members.read; suspended members only for managers). */
export async function GET() {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("org.members.read")) return new NextResponse("Forbidden", { status: 403 });

  const members = await listMembers(ctx, { includeSuspended: ctx.permissions.has("org.members.manage") });
  const emailById = new Map(members.map((m) => [m.id, m.email]));

  const csv = toCsv(members, [
    { header: "name", value: (m) => m.displayName },
    { header: "email", value: (m) => m.email },
    { header: "job_title", value: (m) => m.jobTitle },
    { header: "department", value: (m) => m.departmentName },
    { header: "manager_email", value: (m) => (m.managerMembershipId ? emailById.get(m.managerMembershipId) : "") },
    { header: "roles", value: (m) => m.roles.map((r) => r.key).join(";") },
    { header: "status", value: (m) => m.status },
    { header: "joined_at", value: (m) => m.joinedAt },
  ]);

  return csvResponse(csv, `${ctx.organization.slug}-members`);
}
