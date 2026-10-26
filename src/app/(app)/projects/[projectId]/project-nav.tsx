"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export function ProjectNav({ projectId, tabs }: { projectId: string; tabs: { segment: string; label: string }[] }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;
  return (
    <nav aria-label="Project sections" className="mb-6 flex gap-1 overflow-x-auto border-b">
      {tabs.map((t) => {
        const href = t.segment ? `${base}/${t.segment}` : base;
        const active = t.segment ? pathname.startsWith(href) : pathname === base;
        return (
          <Link
            key={t.label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap",
              active ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
