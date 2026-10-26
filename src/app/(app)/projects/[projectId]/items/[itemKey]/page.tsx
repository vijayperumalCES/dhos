import { ExternalLink, Pencil, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BlockedBadge, PriorityIcon, StateBadge, TypeIcon } from "@/components/work/work-badges";
import { ArchivedBadge } from "@/components/common/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrgContext } from "@/lib/auth/org-context";
import { getWorkItemByKey, getWorkItemRelations, listWorkflowStates } from "@/lib/data/work";
import { ALLOWED_PARENTS, LINK_LABELS, PRIORITY_LABELS, SEVERITY_LABELS, TYPE_LABELS, type WorkItemType } from "@/lib/domain/work";
import { formatDate, formatDateTime, formatRelative, personName } from "@/lib/format";

import {
  AddDependencyForm,
  AddLinkForm,
  ArchiveItemButton,
  CommentForm,
  DeleteCommentButton,
  RemoveDependencyButton,
  RemoveLinkButton,
  StateSelect,
} from "./item-controls";

export async function generateMetadata({ params }: PageProps<"/projects/[projectId]/items/[itemKey]">): Promise<Metadata> {
  return { title: decodeURIComponent((await params).itemKey) };
}

const FIELD_LABELS: Record<string, string> = {
  state: "state",
  assignee: "assignee",
  sprint: "sprint",
  priority: "priority",
  story_points: "story points",
  type: "type",
  parent: "parent",
  blocked: "blocked",
  title: "title",
  due_date: "due date",
};

export default async function WorkItemPage({ params }: PageProps<"/projects/[projectId]/items/[itemKey]">) {
  const { projectId, itemKey } = await params;
  const ctx = await requireOrgContext();
  const item = await getWorkItemByKey(ctx, decodeURIComponent(itemKey));
  if (!item || item.project_id !== projectId) notFound();
  const [rel, states] = await Promise.all([getWorkItemRelations(item.id), listWorkflowStates(ctx)]);
  const p = ctx.permissions;
  const archived = item.archived_at !== null;
  const canEdit = p.has("work.update") && !archived;
  const tz = ctx.settings.timezone;
  const openBlockers = rel.blockedBy.filter((d) => d.kind === "blocks" && d.item?.state?.category !== "done");
  const childTypes = (Object.keys(ALLOWED_PARENTS) as WorkItemType[]).filter((t) => ALLOWED_PARENTS[t].includes(item.type));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0 space-y-6">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <TypeIcon type={item.type} />
            <span>{TYPE_LABELS[item.type]}</span>
            <span className="font-mono">{item.key}</span>
            {item.parent && (
              <>
                <span>in</span>
                <Link href={`/projects/${projectId}/items/${item.parent.key}`} className="font-mono hover:underline">
                  {item.parent.key}
                </Link>
              </>
            )}
            {archived && <ArchivedBadge />}
            {item.blocked && <BlockedBadge reason={item.blocked_reason} />}
            {openBlockers.length > 0 && (
              <Badge variant="outline" className="text-health-red">
                Waiting on {openBlockers.length} item{openBlockers.length === 1 ? "" : "s"}
              </Badge>
            )}
          </div>
          <h2 className="text-xl font-semibold text-balance">{item.title}</h2>
          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <StateSelect itemId={item.id} stateId={item.state_id} states={states.map((s) => ({ value: s.id, label: s.name }))} />
            ) : (
              <StateBadge state={item.state} />
            )}
            {canEdit && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/projects/${projectId}/items/${item.key}/edit`}>
                  <Pencil className="size-4" /> Edit
                </Link>
              </Button>
            )}
            {p.has("work.archive") && <ArchiveItemButton itemId={item.id} archived={archived} />}
          </div>
          {item.blocked && item.blocked_reason && <p className="rounded-md border border-health-red/30 bg-health-red/5 px-3 py-2 text-sm">Blocked: {item.blocked_reason}</p>}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="whitespace-pre-wrap">{item.description || <span className="text-muted-foreground">No description.</span>}</p>
            <div>
              <p className="mb-1 font-medium">Acceptance criteria</p>
              <p className="whitespace-pre-wrap text-muted-foreground">{item.acceptance_criteria || "Not written yet."}</p>
            </div>
          </CardContent>
        </Card>

        {(childTypes.length > 0 || rel.children.length > 0) && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle>Child items ({rel.children.length})</CardTitle>
              {p.has("work.create") && childTypes.length > 0 && !archived && (
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/projects/${projectId}/items/new?parent=${item.id}&type=${childTypes[0]}`}>
                    <Plus className="size-4" /> Add child
                  </Link>
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {rel.children.length === 0 ? (
                <p className="text-sm text-muted-foreground">None yet.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {rel.children.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                      <Link href={`/projects/${projectId}/items/${c.key}`} className="flex min-w-0 items-center gap-2 hover:underline">
                        <TypeIcon type={c.type} />
                        <span className="font-mono text-xs text-muted-foreground">{c.key}</span>
                        <span className="truncate">{c.title}</span>
                      </Link>
                      <StateBadge state={c.state} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Dependencies</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {rel.blockedBy.length === 0 && rel.blocking.length === 0 && <p className="text-muted-foreground">No dependencies.</p>}
            {rel.blockedBy.map((d) => (
              <div key={`in-${d.item!.id}-${d.kind}`} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="text-muted-foreground">{d.kind === "blocks" ? "Blocked by" : d.kind === "relates_to" ? "Relates to" : "Duplicate of"}</span>
                  <Link href={`/projects/${projectId}/items/${d.item!.key}`} className="font-mono text-xs hover:underline">
                    {d.item!.key}
                  </Link>
                  <span className="truncate">{d.item!.title}</span>
                  <StateBadge state={d.item!.state} />
                </span>
                {canEdit && <RemoveDependencyButton predecessorId={d.item!.id} successorId={item.id} kind={d.kind} />}
              </div>
            ))}
            {rel.blocking.map((d) => (
              <div key={`out-${d.item!.id}-${d.kind}`} className="flex items-center gap-2">
                <span className="text-muted-foreground">{d.kind === "blocks" ? "Blocks" : d.kind === "relates_to" ? "Relates to" : "Duplicated by"}</span>
                <Link href={`/projects/${projectId}/items/${d.item!.key}`} className="font-mono text-xs hover:underline">
                  {d.item!.key}
                </Link>
                <span className="truncate">{d.item!.title}</span>
              </div>
            ))}
            {canEdit && <AddDependencyForm itemId={item.id} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {rel.links.length === 0 && (
              <p className="text-muted-foreground">No linked pull requests, builds or documents. Integrations will add these automatically in Phase 7.</p>
            )}
            {rel.links.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2">
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-2 hover:underline">
                  <Badge variant="outline">{LINK_LABELS[l.kind]}</Badge>
                  <span className="truncate">{l.title || l.url}</span>
                  <ExternalLink className="size-3 shrink-0" aria-hidden />
                </a>
                {canEdit && <RemoveLinkButton linkId={l.id} />}
              </div>
            ))}
            {canEdit && <AddLinkForm itemId={item.id} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Comments ({rel.comments.filter((c) => !c.deleted_at).length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {rel.comments.map((c) => (
              <div key={c.id} className="text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p>
                    <span className="font-medium">{rel.names.get(c.author_id) ?? "A user"}</span>{" "}
                    <span className="text-xs text-muted-foreground">{formatDateTime(c.created_at, tz)}</span>
                  </p>
                  {c.author_id === ctx.user.id && !c.deleted_at && <DeleteCommentButton commentId={c.id} />}
                </div>
                <p className="whitespace-pre-wrap text-muted-foreground">{c.deleted_at ? <em>Comment deleted.</em> : c.body}</p>
              </div>
            ))}
            {!archived && <CommentForm itemId={item.id} />}
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Priority</dt>
              <dd className="flex items-center gap-1">
                <PriorityIcon priority={item.priority} /> {PRIORITY_LABELS[item.priority]}
              </dd>
              {item.severity && (
                <>
                  <dt className="text-muted-foreground">Severity</dt>
                  <dd>{SEVERITY_LABELS[item.severity]}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Assignee</dt>
              <dd>{personName(item.assignee)}</dd>
              <dt className="text-muted-foreground">Reviewer</dt>
              <dd>{personName(item.reviewer)}</dd>
              <dt className="text-muted-foreground">Reporter</dt>
              <dd>{personName(item.reporter)}</dd>
              <dt className="text-muted-foreground">Sprint</dt>
              <dd>{item.sprint ? `${item.sprint.name}${item.sprint.state === "active" ? " (active)" : ""}` : "Backlog"}</dd>
              <dt className="text-muted-foreground">Story points</dt>
              <dd className="tabular-nums">{item.story_points ?? "—"}</dd>
              <dt className="text-muted-foreground">Estimate</dt>
              <dd className="tabular-nums">{item.estimate_hours !== null ? `${item.estimate_hours} h` : "—"}</dd>
              <dt className="text-muted-foreground">Business value</dt>
              <dd className="tabular-nums">{item.business_value ?? "—"}</dd>
              <dt className="text-muted-foreground">Start</dt>
              <dd>{formatDate(item.start_date)}</dd>
              <dt className="text-muted-foreground">Due</dt>
              <dd>{formatDate(item.due_date)}</dd>
              <dt className="text-muted-foreground">Team</dt>
              <dd>{item.team?.name ?? "—"}</dd>
              <dt className="text-muted-foreground">Component</dt>
              <dd>{item.component ?? "—"}</dd>
              <dt className="text-muted-foreground">Labels</dt>
              <dd className="flex flex-wrap gap-1">
                {item.labels.length ? item.labels.map((l) => <Badge key={l} variant="secondary">{l}</Badge>) : "—"}
              </dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd>{formatDateTime(item.created_at, tz)}</dd>
              <dt className="text-muted-foreground">Completed</dt>
              <dd>{formatDateTime(item.completed_at, tz)}</dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-xs">
              {rel.activity.map((a) => (
                <li key={a.id}>
                  <span className="font-medium">{a.actor_id ? (rel.names.get(a.actor_id) ?? "A user") : "System"}</span>{" "}
                  {a.kind === "created" && "created this item"}
                  {a.kind === "archived" && "archived this item"}
                  {a.kind === "restored" && "restored this item"}
                  {a.kind === "changed" && (
                    <>
                      changed {FIELD_LABELS[a.field ?? ""] ?? a.field}
                      {a.field !== "title" && (
                        <>
                          {" "}
                          from <span className="font-medium">{a.from_value ?? "none"}</span> to <span className="font-medium">{a.to_value ?? "none"}</span>
                        </>
                      )}
                    </>
                  )}
                  <span className="block text-muted-foreground">{formatRelative(a.created_at)}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
