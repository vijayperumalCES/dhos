import "server-only";

import { cache } from "react";

import type { OrgContext } from "@/lib/auth/org-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { WorkFilters } from "@/lib/validation/work";

import { listMemberOptions } from "./members";
import { resolveUserNames } from "./projects";
import { sanitizeSearch } from "./search";


export const WORK_ITEM_LIST_COLUMNS = `
  id, key, seq, type, title, priority, severity, story_points, rank, blocked, blocked_reason, due_date, completed_at,
  archived_at, labels, project_id, sprint_id, parent_id, state_id, assignee_membership_id, updated_at,
  state:workflow_states!work_items_state_id_organization_id_fkey(id, name, category),
  assignee:organization_memberships!work_items_assignee_membership_id_organization_id_fkey(id, user_profiles(display_name)),
  sprint:sprints!work_items_sprint_id_organization_id_fkey(id, name, state)
`;

export const listWorkflowStates = cache(async (ctx: OrgContext) => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("workflow_states")
    .select("id, name, category, position, is_default, wip_limit, archived_at")
    .eq("organization_id", ctx.organization.id)
    .is("archived_at", null)
    .order("position");
  if (error) throw new Error(`Failed to load workflow: ${error.message}`);
  return data ?? [];
});

export async function listWorkItems(ctx: OrgContext, projectId: string, filters: WorkFilters = {}) {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("work_items").select(WORK_ITEM_LIST_COLUMNS).eq("project_id", projectId).order("rank").limit(1000);
  query = applyFilters(query, ctx, filters);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load work items: ${error.message}`);
  return data ?? [];
}

export type WorkItemRow = Awaited<ReturnType<typeof listWorkItems>>[number];

/** Items assigned to the caller across every project they can see. */
export async function listMyWork(ctx: OrgContext, filters: WorkFilters = {}) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("work_items")
    .select(`${WORK_ITEM_LIST_COLUMNS}, project:projects!work_items_project_id_organization_id_fkey(id, code, name)`)
    .eq("organization_id", ctx.organization.id)
    .order("updated_at", { ascending: false })
    .limit(500);
  query = applyFilters(query, ctx, { ...filters, assignee: filters.assignee ?? "me" });
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load work: ${error.message}`);
  return data ?? [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters<Q extends { eq: any; is: any; not: any; or: any }>(query: Q, ctx: OrgContext, f: WorkFilters): Q {
  let q = query;
  q = f.archived === "only" ? q.not("archived_at", "is", null) : q.is("archived_at", null);
  if (f.type) q = q.eq("type", f.type);
  if (f.state) q = q.eq("state_id", f.state);
  if (f.priority) q = q.eq("priority", f.priority);
  if (f.blocked === "yes") q = q.eq("blocked", true);
  if (f.assignee === "me") q = q.eq("assignee_membership_id", ctx.membershipId);
  else if (f.assignee === "unassigned") q = q.is("assignee_membership_id", null);
  else if (f.assignee) q = q.eq("assignee_membership_id", f.assignee);
  if (f.sprint === "backlog") q = q.is("sprint_id", null);
  else if (f.sprint) q = q.eq("sprint_id", f.sprint);
  const term = sanitizeSearch(f.q);
  if (term) q = q.or(`title.ilike.%${term}%,key.ilike.%${term}%`);
  return q;
}

export async function getWorkItemByKey(ctx: OrgContext, key: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("work_items")
    .select(
      `*,
       state:workflow_states!work_items_state_id_organization_id_fkey(id, name, category),
       assignee:organization_memberships!work_items_assignee_membership_id_organization_id_fkey(id, user_profiles(display_name)),
       reporter:organization_memberships!work_items_reporter_membership_id_organization_id_fkey(id, user_profiles(display_name)),
       reviewer:organization_memberships!work_items_reviewer_membership_id_organization_id_fkey(id, user_profiles(display_name)),
       sprint:sprints!work_items_sprint_id_organization_id_fkey(id, name, state),
       team:teams!work_items_team_id_organization_id_fkey(id, name)`,
    )
    .eq("organization_id", ctx.organization.id)
    .eq("key", key.toUpperCase())
    .maybeSingle();
  if (error) throw new Error(`Failed to load work item: ${error.message}`);
  if (!data) return null;
  // Self-referencing embeds are ambiguous in PostgREST; load the parent explicitly.
  const parent = data.parent_id
    ? ((await supabase.from("work_items").select("id, key, title, type").eq("id", data.parent_id).maybeSingle()).data ?? null)
    : null;
  return { ...data, parent };
}

export type WorkItemDetail = NonNullable<Awaited<ReturnType<typeof getWorkItemByKey>>>;

export async function getWorkItemRelations(itemId: string) {
  const supabase = await createSupabaseServerClient();
  const brief = "id, key, title, type, state:workflow_states!work_items_state_id_organization_id_fkey(name, category)";
  const [children, blockedBy, blocking, comments, links, activity] = await Promise.all([
    supabase.from("work_items").select(brief).eq("parent_id", itemId).is("archived_at", null).order("rank"),
    supabase
      .from("work_item_dependencies")
      .select(`kind, created_at, item:work_items!work_item_dependencies_predecessor_id_organization_id_fkey(${brief})`)
      .eq("successor_id", itemId),
    supabase
      .from("work_item_dependencies")
      .select(`kind, created_at, item:work_items!work_item_dependencies_successor_id_organization_id_fkey(${brief})`)
      .eq("predecessor_id", itemId),
    supabase.from("work_item_comments").select("id, author_id, body, created_at, edited_at, deleted_at").eq("work_item_id", itemId).order("created_at"),
    supabase.from("work_item_links").select("id, kind, url, title, created_at").eq("work_item_id", itemId).order("created_at"),
    supabase
      .from("work_item_activity")
      .select("id, actor_id, kind, field, from_value, to_value, created_at")
      .eq("work_item_id", itemId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const names = await resolveUserNames([...(comments.data ?? []).map((c) => c.author_id), ...(activity.data ?? []).map((a) => a.actor_id)]);
  return {
    children: children.data ?? [],
    // RLS hides dependencies on items the viewer cannot see; the embed is then null.
    blockedBy: (blockedBy.data ?? []).filter((d) => d.item),
    blocking: (blocking.data ?? []).filter((d) => d.item),
    comments: comments.data ?? [],
    links: links.data ?? [],
    activity: activity.data ?? [],
    names,
  };
}

export async function listSprints(projectId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("sprints")
    .select("id, name, goal, start_date, end_date, state, started_at, completed_at, committed_points, committed_count, completed_points, completed_count")
    .eq("project_id", projectId)
    .order("start_date", { ascending: false });
  if (error) throw new Error(`Failed to load sprints: ${error.message}`);
  return data ?? [];
}

export type SprintRow = Awaited<ReturnType<typeof listSprints>>[number];

export async function getSprintStats(sprintId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("sprint_daily_stats").select("day, scope_points, done_points, scope_count, done_count").eq("sprint_id", sprintId).order("day");
  if (error) throw new Error(`Failed to load sprint statistics: ${error.message}`);
  return (data ?? []).map((d) => ({ ...d, scope_points: Number(d.scope_points), done_points: Number(d.done_points) }));
}

/** Options for item pickers within one project. */
export async function loadWorkFormOptions(ctx: OrgContext, projectId: string) {
  const supabase = await createSupabaseServerClient();
  const [states, sprints, parents, members, teams] = await Promise.all([
    listWorkflowStates(ctx),
    supabase.from("sprints").select("id, name, state").eq("project_id", projectId).neq("state", "completed").order("start_date"),
    supabase
      .from("work_items")
      .select("id, key, title, type")
      .eq("project_id", projectId)
      .in("type", ["epic", "feature", "story", "task"])
      .is("archived_at", null)
      .order("seq"),
    listMemberOptions(ctx),
    supabase.from("teams").select("id, name").eq("organization_id", ctx.organization.id).is("archived_at", null).order("name"),
  ]);
  return {
    states: states.map((s) => ({ value: s.id, label: s.name, category: s.category, isDefault: s.is_default })),
    sprints: (sprints.data ?? []).map((s) => ({ value: s.id, label: s.state === "active" ? `${s.name} (active)` : s.name })),
    parents: (parents.data ?? []).map((p) => ({ value: p.id, label: `${p.key} · ${p.title}`, type: p.type })),
    members: members.map((m) => ({ value: m.id, label: m.displayName })),
    teams: (teams.data ?? []).map((t) => ({ value: t.id, label: t.name })),
  };
}
