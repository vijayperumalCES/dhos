"use client";

import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ActionResult } from "@/lib/actions/result";

export type RowAction =
  | "separator"
  | {
      label: string;
      icon?: React.ComponentType<{ className?: string }>;
      destructive?: boolean;
      /** Runs a server action directly… */
      run?: () => Promise<ActionResult<unknown>>;
      /** …or hands control to the caller (to open a dialog). */
      onSelect?: () => void;
    };

/** Overflow menu for a table row. Server actions toast their result and refresh the page. */
export function RowActions({ label, items }: { label: string; items: (RowAction | false | null | undefined)[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const visible = items.filter((i): i is RowAction => !!i);
  if (visible.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} disabled={pending}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {visible.map((item, i) =>
          item === "separator" ? (
            <DropdownMenuSeparator key={`sep-${i}`} />
          ) : (
            <DropdownMenuItem
              key={item.label}
              variant={item.destructive ? "destructive" : "default"}
              onSelect={() => {
                if (item.onSelect) return item.onSelect();
                const run = item.run;
                if (!run) return;
                startTransition(async () => {
                  const r = await run();
                  if (r.ok) {
                    if (r.message) toast.success(r.message);
                    router.refresh();
                  } else toast.error(r.error);
                });
              }}
            >
              {item.icon && <item.icon className="size-4" />} {item.label}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
