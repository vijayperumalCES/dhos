import type { Metadata } from "next";

import { AccessDenied } from "@/components/common/states";
import { WorkItemForm } from "@/components/work/work-item-form";
import { requireOrgContext } from "@/lib/auth/org-context";
import { loadWorkFormOptions } from "@/lib/data/work";
import { WORK_ITEM_TYPES, type WorkItemType } from "@/lib/domain/work";
import { uuid } from "@/lib/validation/common";
import { newItemDefaults } from "@/lib/work-form-defaults";

export const metadata: Metadata = { title: "New work item" };

export default async function NewWorkItemPage({ params, searchParams }: PageProps<"/projects/[projectId]/items/new">) {
  const { projectId } = await params;
  const sp = await searchParams;
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("work.create")) return <AccessDenied what="work item creation" />;
  const options = await loadWorkFormOptions(ctx, projectId);
  const pick = (v: unknown) => (typeof v === "string" && uuid.safeParse(v).success ? v : undefined);
  const type = WORK_ITEM_TYPES.includes(sp.type as WorkItemType) ? (sp.type as WorkItemType) : undefined;
  const defaultState = options.states.find((s) => s.isDefault) ?? options.states[0];

  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="mb-4 text-lg font-semibold">New work item</h2>
      <WorkItemForm
        projectId={projectId}
        options={options}
        defaultValues={newItemDefaults(defaultState.value, { type, parentId: pick(sp.parent), sprintId: pick(sp.sprint) })}
      />
    </div>
  );
}
