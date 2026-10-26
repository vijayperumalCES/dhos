import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/common/page-header";
import { AccessDenied, EmptyState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgContext } from "@/lib/auth/org-context";
import { listPrograms } from "@/lib/data/programs";
import { IN_FLIGHT_STATUSES } from "@/lib/domain/project-lifecycle";
import { personName } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Programs" };

export default async function ProgramsPage({ searchParams }: PageProps<"/programs">) {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.canReadProjects) return <AccessDenied what="programs" />;
  const includeClosed = (await searchParams).closed === "include";
  const programs = await listPrograms(ctx, { includeClosed });
  const canManage = ctx.permissions.has("program.manage");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Programs"
        description="Groups of related projects with shared outcomes. Health counts include only projects you can see."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={includeClosed ? "/programs" : "/programs?closed=include"}>{includeClosed ? "Hide closed" : "Show closed"}</Link>
            </Button>
            {canManage && (
              <Button asChild>
                <Link href="/programs/new">
                  <Plus className="size-4" /> New program
                </Link>
              </Button>
            )}
          </>
        }
      />
      {programs.length === 0 ? (
        <EmptyState
          title="No programs yet"
          description="Create a program to group related projects and track their milestones together."
          action={
            canManage && (
              <Button asChild>
                <Link href="/programs/new">New program</Link>
              </Button>
            )
          }
        />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Program</TableHead>
                <TableHead className="hidden md:table-cell">Owner</TableHead>
                <TableHead className="text-right">In flight</TableHead>
                <TableHead>Health of in-flight projects</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {programs.map((g) => {
                const inFlight = g.projects.filter((p) => IN_FLIGHT_STATUSES.includes(p.status));
                const count = (h: string) => inFlight.filter((p) => p.health === h).length;
                return (
                  <TableRow key={g.id}>
                    <TableCell>
                      <Link href={`/programs/${g.id}`} className="font-medium hover:underline">
                        {g.name}
                      </Link>{" "}
                      <span className="font-mono text-xs text-muted-foreground">{g.code}</span>{" "}
                      {g.status === "closed" && <Badge variant="outline">Closed</Badge>}
                      {g.description && <p className="line-clamp-1 text-xs text-muted-foreground">{g.description}</p>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{personName(g.owner)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {inFlight.length}
                      <span className="text-muted-foreground"> / {g.projects.length}</span>
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-2 text-xs">
                        {(["red", "amber", "green", "not_assessed"] as const).map((h) => (
                          <span key={h} className={cn("inline-flex items-center gap-1", count(h) === 0 && "opacity-40")}>
                            <span
                              className={cn(
                                "size-2 rounded-full",
                                h === "red" && "bg-health-red",
                                h === "amber" && "bg-health-amber",
                                h === "green" && "bg-health-green",
                                h === "not_assessed" && "bg-health-none",
                              )}
                              aria-hidden
                            />
                            {count(h)} {h === "not_assessed" ? "not assessed" : h}
                          </span>
                        ))}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
