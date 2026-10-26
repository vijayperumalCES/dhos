import { Construction } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PLANNED_MODULES } from "@/lib/navigation";

export async function generateMetadata({ params }: PageProps<"/roadmap/[module]">): Promise<Metadata> {
  const m = PLANNED_MODULES[(await params).module];
  return { title: m ? `${m.title} (planned)` : "Roadmap" };
}

/** Honest placeholder for a module that is not built: no fake screens, no fake numbers. */
export default async function PlannedModulePage({ params }: PageProps<"/roadmap/[module]">) {
  const m = PLANNED_MODULES[(await params).module];
  if (!m) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={m.title} meta={<Badge variant="outline">Planned · Phase {m.phase}</Badge>} />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Construction className="size-4" /> Not built yet
          </CardTitle>
          <CardDescription>{m.summary}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="font-medium">Planned scope</p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {m.scope.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            This page holds no data and performs no actions. See <code>docs/ROADMAP.md</code> for sequencing.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
