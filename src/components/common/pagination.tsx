import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function Pagination({
  page,
  pageSize,
  total,
  hrefForPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  hrefForPage: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-2 pt-4 text-sm text-muted-foreground">
      <span>
        {first}–{last} of {total}
      </span>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" asChild disabled={page <= 1} aria-disabled={page <= 1}>
          {page <= 1 ? (
            <span>
              <ChevronLeft className="size-4" /> Previous
            </span>
          ) : (
            <Link href={hrefForPage(page - 1)}>
              <ChevronLeft className="size-4" /> Previous
            </Link>
          )}
        </Button>
        <Button variant="outline" size="sm" asChild disabled={page >= pages} aria-disabled={page >= pages}>
          {page >= pages ? (
            <span>
              Next <ChevronRight className="size-4" />
            </span>
          ) : (
            <Link href={hrefForPage(page + 1)}>
              Next <ChevronRight className="size-4" />
            </Link>
          )}
        </Button>
      </div>
    </nav>
  );
}

/** Builds a URL for the current route with some search params replaced. */
export function withParams(path: string, current: Record<string, string | undefined>, changes: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...changes })) if (v) params.set(k, v);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
