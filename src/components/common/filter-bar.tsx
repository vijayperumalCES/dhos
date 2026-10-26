"use client";

import { X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type FilterDef = { key: string; label: string; options: { value: string; label: string }[]; allLabel?: string };

const ALL = "__all";

/** URL-driven filters: every filter is a search param, so views are shareable and bookmarkable. */
export function FilterBar({ filters, searchPlaceholder, searchKey = "q" }: { filters: FilterDef[]; searchPlaceholder?: string; searchKey?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === "" || v === ALL) next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    startTransition(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`));
  }

  const active = filters.some((f) => params.get(f.key)) || !!params.get(searchKey);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2" aria-busy={pending}>
      {searchPlaceholder && (
        <form
          className="w-full sm:w-64"
          onSubmit={(e) => {
            e.preventDefault();
            update({ [searchKey]: new FormData(e.currentTarget).get(searchKey)?.toString().trim() ?? null });
          }}
        >
          <Input
            key={params.get(searchKey) ?? ""}
            name={searchKey}
            defaultValue={params.get(searchKey) ?? ""}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-9"
          />
        </form>
      )}
      {filters.map((f) => (
        <Select key={f.key} value={params.get(f.key) ?? ALL} onValueChange={(v) => update({ [f.key]: v })}>
          <SelectTrigger className="h-9 w-full sm:w-auto sm:min-w-40" aria-label={f.label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{f.allLabel ?? `All ${f.label.toLowerCase()}`}</SelectItem>
            {f.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
      {active && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => update(Object.fromEntries([...filters.map((f) => [f.key, null]), [searchKey, null]]))}
        >
          <X className="size-4" /> Clear
        </Button>
      )}
    </div>
  );
}
