"use client";

import {
  closestCorners,
  DndContext,
  rectIntersection,
  type CollisionDetection,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { moveWorkItem } from "@/lib/actions/work";
import { fetchBoardItems, rankAtIndex, type BoardColumn, type BoardItem, type BoardScope } from "@/lib/board";
import { initials } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

import { BlockedBadge, PointsBadge, PriorityIcon, TypeIcon } from "./work-badges";

type Props = {
  projectId: string;
  scope: BoardScope;
  columns: BoardColumn[];
  initialItems: BoardItem[];
  canMove: boolean;
};

export function Board({ projectId, scope, columns, initialItems, canMove }: Props) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["board", projectId, scope.kind === "sprint" ? scope.sprintId : "all"], [projectId, scope]);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { data: items = initialItems } = useQuery({
    queryKey,
    queryFn: () => fetchBoardItems(supabase, projectId, scope),
    initialData: initialItems,
  });
  const [activeId, setActiveId] = useState<string | null>(null);

  // A server refresh (e.g. after quick add) brings fresh initial data; it is the source of truth.
  useEffect(() => {
    queryClient.setQueryData(queryKey, initialItems);
  }, [initialItems, queryClient, queryKey]);

  // Live updates from other people: any change to this project's items refreshes the board.
  useEffect(() => {
    const channel = supabase
      .channel(`board:${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "work_items", filter: `project_id=eq.${projectId}` }, () =>
        queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, projectId, queryClient, queryKey]);

  const byColumn = useMemo(() => {
    const map = new Map<string, BoardItem[]>(columns.map((c) => [c.id, []]));
    for (const item of [...items].sort((a, b) => a.rank - b.rank)) map.get(item.state_id)?.push(item);
    return map;
  }, [items, columns]);

  // closestCorners alone lets a small card in the neighbouring column beat a tall, empty target
  // column. Prefer what the dragged card actually overlaps — cards first, then columns.
  const collisionDetection = useMemo<CollisionDetection>(() => {
    const columnIds = new Set(columns.map((c) => c.id));
    return (args) => {
      const overlapping = rectIntersection(args);
      const cards = overlapping.filter((c) => !columnIds.has(String(c.id)));
      if (cards.length) return cards;
      if (overlapping.length) return overlapping;
      return closestCorners(args);
    };
  }, [columns]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || !canMove) return;
    const moving = items.find((i) => i.id === active.id);
    if (!moving) return;

    const overItem = items.find((i) => i.id === over.id);
    const targetColumn = overItem ? overItem.state_id : String(over.id);
    if (!byColumn.has(targetColumn)) return;
    const destination = (byColumn.get(targetColumn) ?? []).filter((i) => i.id !== moving.id);
    let index = overItem ? destination.findIndex((i) => i.id === overItem.id) : destination.length;
    // Dropping onto a card lower in the same column places the card after it.
    if (overItem && moving.state_id === targetColumn) {
      const original = byColumn.get(targetColumn)!;
      if (original.findIndex((i) => i.id === moving.id) < original.findIndex((i) => i.id === overItem.id)) index += 1;
    }
    if (index < 0) index = destination.length;
    const rank = rankAtIndex(destination, index);
    if (moving.state_id === targetColumn && rank === moving.rank) return;

    const previous = queryClient.getQueryData<BoardItem[]>(queryKey);
    queryClient.setQueryData<BoardItem[]>(queryKey, (old) => (old ?? []).map((i) => (i.id === moving.id ? { ...i, state_id: targetColumn, rank } : i)));
    const result = await moveWorkItem({ itemId: moving.id, stateId: moving.state_id !== targetColumn ? targetColumn : undefined, rank });
    if (!result.ok) {
      queryClient.setQueryData(queryKey, previous);
      toast.error(result.error);
    } else {
      const column = columns.find((c) => c.id === targetColumn);
      if (moving.state_id !== targetColumn && column) toast.success(`${moving.key} moved to ${column.name}.`);
    }
    void queryClient.invalidateQueries({ queryKey });
  }

  const active = activeId ? items.find((i) => i.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={onDragEnd}
      accessibility={{
        screenReaderInstructions: {
          draggable: "To move a card, press space or enter. Use the arrow keys to move between positions and columns, then press space or enter to drop, or escape to cancel.",
        },
      }}
    >
      <div className="flex gap-3 overflow-x-auto pb-4" role="list" aria-label="Board columns">
        {columns.map((col) => (
          <Column key={col.id} column={col} items={byColumn.get(col.id) ?? []} projectId={projectId} canMove={canMove} />
        ))}
      </div>
      <DragOverlay>{active ? <Card item={active} projectId={projectId} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

function Column({ column, items, projectId, canMove }: { column: BoardColumn; items: BoardItem[]; projectId: string; canMove: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id, disabled: !canMove });
  const points = items.reduce((s, i) => s + (i.story_points ?? 0), 0);
  const overLimit = column.wipLimit !== null && items.length > column.wipLimit;
  return (
    <section
      role="listitem"
      aria-label={`${column.name}, ${items.length} items`}
      className={cn("flex w-72 shrink-0 flex-col rounded-xl border bg-muted/30", isOver && "ring-2 ring-primary/40", overLimit && "border-health-red/50")}
    >
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <h3 className="text-sm font-medium">{column.name}</h3>
        <span className={cn("text-xs tabular-nums text-muted-foreground", overLimit && "font-medium text-health-red")}>
          {items.length}
          {column.wipLimit !== null && ` / ${column.wipLimit}`} · {points} pts
          {overLimit && <span className="sr-only"> (over the work-in-progress limit)</span>}
        </span>
      </header>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy} disabled={!canMove}>
        <ul ref={setNodeRef} className="flex min-h-24 flex-1 flex-col gap-2 p-2">
          {items.map((item) => (
            <SortableCard key={item.id} item={item} projectId={projectId} />
          ))}
          {items.length === 0 && <li className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">Drop items here</li>}
        </ul>
      </SortableContext>
    </section>
  );
}

function SortableCard({ item, projectId }: { item: BoardItem; projectId: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && "opacity-40")} {...attributes} {...listeners}>
      <Card item={item} projectId={projectId} />
    </li>
  );
}

function Card({ item, projectId, overlay }: { item: BoardItem; projectId: string; overlay?: boolean }) {
  const name = item.assignee?.user_profiles?.display_name;
  return (
    <div className={cn("space-y-2 rounded-lg border bg-card p-2.5 text-sm shadow-xs", overlay && "shadow-lg ring-2 ring-primary/30")}>
      <Link href={`/projects/${projectId}/items/${item.key}`} className="line-clamp-3 font-medium hover:underline" onPointerDown={(e) => e.stopPropagation()}>
        {item.title}
      </Link>
      {item.blocked && <BlockedBadge reason={item.blocked_reason} />}
      <div className="flex items-center gap-1.5">
        <TypeIcon type={item.type} />
        <span className="font-mono text-xs text-muted-foreground">{item.key}</span>
        <span className="ml-auto flex items-center gap-1.5">
          <PriorityIcon priority={item.priority} />
          <PointsBadge points={item.story_points} />
          {name ? (
            <Avatar className="size-5" title={name}>
              <AvatarFallback className="text-[9px]">{initials(name)}</AvatarFallback>
            </Avatar>
          ) : null}
        </span>
      </div>
    </div>
  );
}
