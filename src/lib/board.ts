import type { SupabaseClient } from "@supabase/supabase-js";

import { rankBetween } from "@/lib/domain/work";
import type { Database } from "@/lib/supabase/database.types";

export type BoardScope = { kind: "sprint"; sprintId: string } | { kind: "all" };

const BOARD_COLUMNS = `id, key, title, type, priority, story_points, state_id, rank, blocked, blocked_reason, sprint_id, completed_at,
  assignee:organization_memberships!work_items_assignee_membership_id_organization_id_fkey(id, user_profiles(display_name))`;

/** Done items older than this drop off the "all work" board so it stays usable. */
export const DONE_WINDOW_DAYS = 14;

/**
 * Board cards for a project. Shared by the server render (initial data) and the browser query
 * (live refresh); both clients run under the user's session, so RLS applies either way.
 */
export async function fetchBoardItems(supabase: SupabaseClient<Database>, projectId: string, scope: BoardScope) {
  let query = supabase.from("work_items").select(BOARD_COLUMNS).eq("project_id", projectId).is("archived_at", null).order("rank").limit(500);
  if (scope.kind === "sprint") query = query.eq("sprint_id", scope.sprintId);
  else {
    const since = new Date(Date.now() - DONE_WINDOW_DAYS * 86_400_000).toISOString();
    query = query.or(`completed_at.is.null,completed_at.gte.${since}`);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load the board: ${error.message}`);
  return (data ?? []).map((i) => ({ ...i, story_points: i.story_points === null ? null : Number(i.story_points) }));
}

export type BoardItem = Awaited<ReturnType<typeof fetchBoardItems>>[number];
export type BoardColumn = { id: string; name: string; category: "todo" | "in_progress" | "done"; wipLimit: number | null };

/** Rank for a card placed at `index` among `cards` (the destination column without the moving card). */
export function rankAtIndex(cards: { rank: number }[], index: number): number {
  return rankBetween(index > 0 ? cards[index - 1].rank : null, index < cards.length ? cards[index].rank : null);
}
