"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto mt-12 max-w-lg rounded-xl border p-8 text-center">
      <AlertTriangle className="mx-auto mb-3 size-8 text-destructive" aria-hidden />
      <h1 className="text-lg font-semibold">This page couldn&apos;t be loaded</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        An unexpected error occurred while loading data. Nothing was changed.
        {error.digest && <span className="mt-2 block font-mono text-xs">Reference: {error.digest}</span>}
      </p>
      <Button className="mt-4" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
