import type { Metadata } from "next";
import Link from "next/link";

import { FilterBar } from "@/components/common/filter-bar";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/states";
import { VisibilityBadge } from "@/components/governance/badges";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgContext } from "@/lib/auth/org-context";
import { listDocuments } from "@/lib/data/documents";
import { listGovernanceProjects } from "@/lib/data/governance";
import { DOCUMENT_TYPE_LABELS, DOCUMENT_TYPES, DOCUMENT_VISIBILITIES, DOCUMENT_VISIBILITY_LABELS } from "@/lib/domain/governance";
import { formatDateTime, personName } from "@/lib/format";
import { governanceFilterSchema } from "@/lib/validation/governance";

import { NewDocumentDialog } from "./document-controls";

export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsPage({ searchParams }: PageProps<"/documents">) {
  const ctx = await requireOrgContext();
  const raw = await searchParams;
  const filters = governanceFilterSchema.parse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
  const first = (k: string) => (Array.isArray(raw[k]) ? raw[k]?.[0] : (raw[k] as string | undefined));
  const canManage = ctx.permissions.has("document.manage");
  const archived = first("archived") === "1";

  const [documents, projects] = await Promise.all([
    listDocuments(ctx, { project: filters.project, type: first("doctype"), visibility: first("visibility"), q: filters.q, archived }),
    listGovernanceProjects(ctx),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Documents" description="Project documents with immutable versions. Internal documents need document access; client-shared ones are open to people on the project." />
      <Card className="pb-0">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>{archived ? "Archived documents" : "Documents"}</CardTitle>
            <CardDescription>{documents.length} shown</CardDescription>
          </div>
          {canManage && !archived && <NewDocumentDialog projects={projects} fixedProject={filters.project} />}
        </CardHeader>
        <CardContent className="px-0">
          <div className="px-6">
            <FilterBar
              searchPlaceholder="Search titles"
              filters={[
                { key: "project", label: "Project", options: projects },
                { key: "doctype", label: "Type", options: DOCUMENT_TYPES.map((t) => ({ value: t, label: DOCUMENT_TYPE_LABELS[t] })) },
                { key: "visibility", label: "Visibility", options: DOCUMENT_VISIBILITIES.map((v) => ({ value: v, label: DOCUMENT_VISIBILITY_LABELS[v] })) },
                { key: "archived", label: "Archive", allLabel: "Current", options: [{ value: "1", label: "Archived" }] },
              ]}
            />
          </div>
          {documents.length === 0 ? (
            <EmptyState className="mx-6 mb-6" title="No documents" description="Charters, requirements and plans live here with their full version history." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Document</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Visibility</TableHead>
                  <TableHead className="hidden md:table-cell">Owner</TableHead>
                  <TableHead className="pr-6">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="max-w-md pl-6 whitespace-normal">
                      <Link href={`/documents/${d.id}`} className="font-medium hover:underline">
                        {d.title}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        <span className="font-mono">{d.project?.code}</span> · v{d.current_version}
                        {d.description ? ` · ${d.description}` : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{DOCUMENT_TYPE_LABELS[d.doc_type]}</Badge>
                    </TableCell>
                    <TableCell>
                      <VisibilityBadge visibility={d.visibility} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{personName(d.owner)}</TableCell>
                    <TableCell className="pr-6 text-xs text-muted-foreground">{formatDateTime(d.updated_at, ctx.settings.timezone)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
