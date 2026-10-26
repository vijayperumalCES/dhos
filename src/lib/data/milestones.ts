import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function listMilestones(projectId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("project_milestones")
    .select(
      "id, name, description, due_date, baseline_due_date, completed_on, owner_membership_id, owner:organization_memberships!project_milestones_owner_membership_id_organization_id_fkey(id, user_profiles(display_name))",
    )
    .eq("project_id", projectId)
    .order("due_date");
  if (error) throw new Error(`Failed to load milestones: ${error.message}`);
  return data ?? [];
}

export async function listBaselines(projectId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("project_baselines")
    .select("id, name, snapshot, created_by, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load baselines: ${error.message}`);
  return data ?? [];
}
