import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ArchivedBadge, HealthBadge, StatusBadge } from "@/components/common/badges";
import { FilterBar } from "@/components/common/filter-bar";
import { PageHeader } from "@/components/common/page-header";
import { Pagination, withParams } from "@/components/common/pagination";
import { AccessDenied, EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgContext } from "@/lib/auth/org-context";
import { loadProjectFormOptions } from "@/lib/data/options";
import { listProjects } from "@/lib/data/projects";
import { isPastTargetEnd } from "@/lib/domain/kpis";
import { HEALTH_LABELS, PROJECT_HEALTHS, PROJECT_STATUSES, STATUS_LABELS } from "@/lib/domain/project-lifecycle";
import { formatDate, personName } from "@/lib/format";
import { projectListFiltersSchema } from "@/lib/validation/project";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.canReadProjects) return <AccessDenied what="projects" />;

  const raw = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const filters = projectListFiltersSchema.parse(raw);
  const [{ rows, total, page, pageSize }, options] = await Promise.all([listProjects(ctx, filters), loadProjectFormOptions(ctx)]);
  const current = raw as Record<string, string | undefined>;
  const now = new Date();
  const filtered = Object.keys(raw).some((k) => !["sort", "dir", "page"].includes(k));

  function sortHref(col: NonNullable<typeof filters.sort>) {
    const dir = filters.sort === col && (filters.dir ?? "asc") === "asc" ? "desc" : "asc";
    return withParams("/projects", current, { sort: col, dir, page: undefined });
  }
  const sortProps = (col: NonNullable<typeof filters.sort>) => ({
    href: sortHref(col),
    active: filters.sort === col,
    descending: filters.dir === "desc",
  });

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Projects"
        description={
          ctx.permissions.has("project.read_all")
            ? "Every project in the organization."
            : "Projects you manage, own, created or are a member of."
        }
        actions={
          ctx.permissions.has("project.create") && (
            <Button asChild>
              <Link href="/projects/new">
                <Plus className="size-4" /> New project
              </Link>
            </Button>
          )
        }
      />

      <FilterBar
        searchPlaceholder="Search name or code"
        filters={[
          {
            key: "status",
            label: "Statuses",
            options: [{ value: "in_flight", label: "In flight (planning, active, on hold)" }, ...PROJECT_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))],
          },
          { key: "health", label: "Health", options: PROJECT_HEALTHS.map((h) => ({ value: h, label: HEALTH_LABELS[h] })), allLabel: "Any health" },
          ...(options.clients.length ? [{ key: "client", label: "Clients", options: options.clients }] : []),
          ...(options.members.length ? [{ key: "manager", label: "Managers", options: options.members }] : []),
          ...(options.teams.length ? [{ key: "team", label: "Teams", options: options.teams }] : []),
          {
            key: "archived",
            label: "Archive",
            allLabel: "Active records",
            options: [
              { value: "include", label: "Include archived" },
              { value: "only", label: "Archived only" },
            ],
          },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState
          title={filtered ? "No projects match these filters" : "No projects yet"}
          description={
            filtered
              ? "Try clearing a filter."
              : ctx.permissions.has("project.create")
                ? "Create the first project to start tracking delivery."
                : "Projects you are assigned to will appear here."
          }
          action={
            !filtered &&
            ctx.permissions.has("project.create") && (
              <Button asChild>
                <Link href="/projects/new">New project</Link>
              </Button>
            )
          }
        />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead {...sortProps("code")} className="w-28">Code</SortHead>
                <SortHead {...sortProps("name")}>Name</SortHead>
                <SortHead {...sortProps("status")}>Status</SortHead>
                <SortHead {...sortProps("health")}>Health</SortHead>
                <TableHead className="hidden md:table-cell">Client</TableHead>
                <TableHead className="hidden lg:table-cell">Manager</TableHead>
                <SortHead {...sortProps("target_end_date")} className="hidden sm:table-cell">Target end</SortHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => {
                const overdue = ["planning", "active", "on_hold"].includes(p.status) && isPastTargetEnd(p, now);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.code}</TableCell>
                    <TableCell>
                      <Link href={`/projects/${p.id}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                      {p.archived_at && <ArchivedBadge />}
                      {p.team && <div className="text-xs text-muted-foreground">{p.team.name}</div>}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={p.status} />
                    </TableCell>
                    <TableCell>
                      <HealthBadge health={p.health} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{p.client?.name ?? <span className="text-muted-foreground">Internal</span>}</TableCell>
                    <TableCell className="hidden lg:table-cell">{personName(p.manager)}</TableCell>
                    <TableCell className="hidden tabular-nums sm:table-cell">
                      <span className={overdue ? "font-medium text-health-red" : undefined}>{formatDate(p.target_end_date)}</span>
                      {overdue && <span className="sr-only"> (past target end)</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} hrefForPage={(n) => withParams("/projects", current, { page: String(n) })} />
    </div>
  );
}

function SortHead({
  href,
  active,
  descending,
  children,
  className,
}: {
  href: string;
  active: boolean;
  descending: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = descending ? ArrowDown : ArrowUp;
  return (
    <TableHead className={className} aria-sort={active ? (descending ? "descending" : "ascending") : undefined}>
      <Link href={href} className="inline-flex items-center gap-1 hover:text-foreground">
        {children}
        {active && <Icon className="size-3" aria-hidden />}
      </Link>
    </TableHead>
  );
}
