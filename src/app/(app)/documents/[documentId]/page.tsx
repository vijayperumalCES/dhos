import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/common/page-header";
import { ArchivedBadge } from "@/components/common/badges";
import { VisibilityBadge } from "@/components/governance/badges";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/auth/org-context";
import { getDocument } from "@/lib/data/documents";
import { resolveUserNames } from "@/lib/data/projects";
import { DOCUMENT_TYPE_LABELS } from "@/lib/domain/governance";
import { formatDateTime, personName } from "@/lib/format";

import { DocumentDetailsActions, NewVersionDialog } from "../document-controls";

export const metadata: Metadata = { title: "Document" };

export default async function DocumentPage({ params }: PageProps<"/documents/[documentId]">) {
  const { documentId } = await params;
  const ctx = await requireOrgContext();
  const doc = await getDocument(ctx, documentId);
  if (!doc) notFound();
  const canManage = ctx.permissions.has("document.manage");
  const archived = doc.archived_at !== null;
  const names = await resolveUserNames(doc.versions.map((v) => v.created_by));
  const [latest, ...earlier] = doc.versions;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        breadcrumbs={[{ label: "Documents", href: "/documents" }, { label: doc.title }]}
        title={doc.title}
        description={doc.description}
        meta={
          <>
            <Badge variant="outline">{DOCUMENT_TYPE_LABELS[doc.doc_type]}</Badge>
            <VisibilityBadge visibility={doc.visibility} />
            <Badge variant="outline">
              {doc.project?.code} · {doc.project?.name}
            </Badge>
            <span className="text-xs text-muted-foreground">Owner {personName(doc.owner)}</span>
            {archived && <ArchivedBadge />}
          </>
        }
        actions={
          canManage && (
            <>
              {!archived && <NewVersionDialog documentId={doc.id} />}
              <DocumentDetailsActions documentId={doc.id} archived={archived} details={{ title: doc.title, docType: doc.doc_type, visibility: doc.visibility, description: doc.description ?? "" }} />
            </>
          )
        }
      />

      {latest && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Version {latest.version} · current</CardTitle>
            <CardDescription>
              {formatDateTime(latest.created_at, ctx.settings.timezone)} · {latest.created_by ? (names.get(latest.created_by) ?? "a user") : "system"}
              {latest.change_note ? ` · ${latest.change_note}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VersionBody content={latest.content} url={latest.url} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Version history</CardTitle>
          <CardDescription>Versions are never edited or deleted.</CardDescription>
        </CardHeader>
        <CardContent>
          {earlier.length === 0 ? (
            <p className="text-sm text-muted-foreground">This is the first version.</p>
          ) : (
            <ul className="space-y-2">
              {earlier.map((v) => (
                <li key={v.id}>
                  <details className="rounded-lg border px-4 py-3">
                    <summary className="cursor-pointer text-sm">
                      <span className="font-medium">Version {v.version}</span>{" "}
                      <span className="text-muted-foreground">
                        · {formatDateTime(v.created_at, ctx.settings.timezone)} · {v.created_by ? (names.get(v.created_by) ?? "a user") : "system"}
                        {v.change_note ? ` · ${v.change_note}` : ""}
                      </span>
                    </summary>
                    <div className="mt-3">
                      <VersionBody content={v.content} url={v.url} />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Content is shown as plain preformatted text: it is never interpreted as HTML. */
function VersionBody({ content, url }: { content: string | null; url: string | null }) {
  return (
    <div className="space-y-3">
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          {url} <ExternalLink className="size-3" aria-hidden />
        </a>
      )}
      {content && <pre className="max-h-[32rem] overflow-auto rounded-md bg-muted/50 p-4 text-sm whitespace-pre-wrap">{content}</pre>}
    </div>
  );
}
