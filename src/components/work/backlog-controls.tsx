"use client";

import { ArrowDownToLine, ArrowUpToLine, MoreHorizontal, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { moveWorkItem, quickAddWorkItem } from "@/lib/actions/work";
import { TYPE_LABELS, WORK_ITEM_TYPES, type WorkItemType } from "@/lib/domain/work";
import { NONE } from "@/lib/validation/common";

export function QuickAdd({ projectId, sprintId, stateId, placeholder = "Add an item…" }: { projectId: string; sprintId?: string; stateId?: string; placeholder?: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<WorkItemType>("story");
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        startTransition(async () => {
          const r = await quickAddWorkItem({ projectId, type, title, sprintId: sprintId ?? NONE, stateId: stateId ?? NONE });
          if (r.ok) {
            toast.success(r.message);
            setTitle("");
            router.refresh();
          } else toast.error(r.fieldErrors?.title?.[0] ?? r.error);
        });
      }}
    >
      <Select value={type} onValueChange={(v) => setType(v as WorkItemType)}>
        <SelectTrigger className="h-8 w-32 shrink-0" aria-label="Type of new item">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {WORK_ITEM_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {TYPE_LABELS[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input className="h-8" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={placeholder} aria-label="New item title" maxLength={300} />
      <Button type="submit" size="sm" variant="outline" disabled={pending || !title.trim()} aria-label="Add item">
        <Plus className="size-4" />
      </Button>
    </form>
  );
}

export function BacklogRowActions({
  itemId,
  itemKey,
  sprints,
  currentSprintId,
  topRank,
  bottomRank,
}: {
  itemId: string;
  itemKey: string;
  sprints: { id: string; name: string }[];
  currentSprintId: string | null;
  topRank: number | null;
  bottomRank: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const move = (patch: { sprintId?: string; rank?: number }, message?: string) =>
    startTransition(async () => {
      const r = await moveWorkItem({ itemId, ...patch });
      if (r.ok) {
        if (message) toast.success(message);
        router.refresh();
      } else toast.error(r.error);
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" aria-label={`Actions for ${itemKey}`} disabled={pending}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {topRank !== null && (
          <DropdownMenuItem onSelect={() => move({ rank: topRank - 1024 })}>
            <ArrowUpToLine className="size-4" /> Move to top
          </DropdownMenuItem>
        )}
        {bottomRank !== null && (
          <DropdownMenuItem onSelect={() => move({ rank: bottomRank + 1024 })}>
            <ArrowDownToLine className="size-4" /> Move to bottom
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Move to</DropdownMenuLabel>
        {currentSprintId !== null && <DropdownMenuItem onSelect={() => move({ sprintId: NONE }, `${itemKey} moved to the backlog.`)}>Backlog</DropdownMenuItem>}
        {sprints
          .filter((s) => s.id !== currentSprintId)
          .map((s) => (
            <DropdownMenuItem key={s.id} onSelect={() => move({ sprintId: s.id }, `${itemKey} moved to ${s.name}.`)}>
              {s.name}
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
