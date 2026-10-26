"use client";

import { Bell, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

export type QuickCreate = { label: string; href: string }[];

export function TopBar({ quickCreate }: { quickCreate: QuickCreate }) {
  const router = useRouter();
  const params = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  // "/" focuses global search, matching common enterprise tooling.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-5" />
      <form
        role="search"
        className="relative flex max-w-md flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          const q = new FormData(e.currentTarget).get("q")?.toString().trim();
          if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          name="q"
          defaultValue={params.get("q") ?? ""}
          placeholder="Search projects, teams, clients…"
          aria-label="Global search"
          className="h-9 pl-8"
        />
        <kbd className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border px-1.5 text-[10px] text-muted-foreground sm:block">
          /
        </kbd>
      </form>
      <div className="ml-auto flex items-center gap-1">
        {quickCreate.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="gap-1">
                <Plus className="size-4" />
                <span className="hidden sm:inline">Create</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Quick create</DropdownMenuLabel>
              {quickCreate.map((q) => (
                <DropdownMenuItem key={q.href} asChild>
                  <Link href={q.href}>{q.label}</Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Notifications">
              <Bell className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 text-sm">
            <p className="font-medium">Notifications</p>
            <p className="mt-1 text-muted-foreground">
              The notification center is not built yet. Alerts for overdue milestones, unowned risks and health
              changes arrive with the Notifications module in Phase 7. Until then, the Command Center lists projects
              needing attention.
            </p>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  );
}
