import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/common/states";
import { WorkItemForm } from "@/components/work/work-item-form";
import { requireOrgContext } from "@/lib/auth/org-context";
import { getWorkItemByKey, loadWorkFormOptions } from "@/lib/data/work";
import { itemToFormDefaults } from "@/lib/work-form-defaults";

export const metadata: Metadata = { title: "Edit work item" };

export default async function EditWorkItemPage({ params }: PageProps<"/projects/[projectId]/items/[itemKey]/edit">) {
  const { projectId, itemKey } = await params;
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("work.update")) return <AccessDenied what="work item editing" />;
  const item = await getWorkItemByKey(ctx, decodeURIComponent(itemKey));
  if (!item || item.project_id !== projectId) notFound();
  const options = await loadWorkFormOptions(ctx, projectId);

  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="mb-4 text-lg font-semibold">
        Edit <span className="font-mono">{item.key}</span>
      </h2>
      <WorkItemForm projectId={projectId} itemId={item.id} options={options} defaultValues={itemToFormDefaults(item)} />
    </div>
  );
}
