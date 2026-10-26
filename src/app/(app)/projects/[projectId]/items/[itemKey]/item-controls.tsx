"use client";

import { Archive, ArchiveRestore, Link2, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/actions/result";
import { addComment, addDependency, addLink, deleteComment, moveWorkItem, removeDependency, removeLink, setWorkItemArchived } from "@/lib/actions/work";
import { LINK_KINDS, LINK_LABELS, type LinkKind } from "@/lib/domain/work";

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function run<T>(fn: () => Promise<ActionResult<T>>, onOk?: () => void, onFail?: (r: Extract<ActionResult<T>, { ok: false }>) => void) {
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        if (r.message) toast.success(r.message);
        onOk?.();
        router.refresh();
      } else if (onFail) onFail(r);
      else toast.error(r.error);
    });
  }
  return { pending, run };
}

export function StateSelect({ itemId, stateId, states, disabled }: { itemId: string; stateId: string; states: { value: string; label: string }[]; disabled?: boolean }) {
  const { pending, run } = useRun();
  return (
    <Select value={stateId} disabled={disabled || pending} onValueChange={(v) => run(() => moveWorkItem({ itemId, stateId: v }))}>
      <SelectTrigger className="h-8 w-44" aria-label="State">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {states.map((s) => (
          <SelectItem key={s.value} value={s.value}>
            {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ArchiveItemButton({ itemId, archived }: { itemId: string; archived: boolean }) {
  const { pending, run } = useRun();
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => setWorkItemArchived(itemId, !archived))}>
      {archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />} {archived ? "Restore" : "Archive"}
    </Button>
  );
}

export function CommentForm({ itemId }: { itemId: string }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useRun();
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        run(
          () => addComment({ itemId, body }),
          () => setBody(""),
          (r) => setError(r.fieldErrors?.body?.[0] ?? r.error),
        );
      }}
    >
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor="comment" className="sr-only">
          Add a comment
        </FieldLabel>
        <Textarea id="comment" rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment…" maxLength={10000} />
        {error && <FieldError>{error}</FieldError>}
      </Field>
      <Button type="submit" size="sm" disabled={pending || !body.trim()}>
        {pending ? "Posting…" : "Comment"}
      </Button>
    </form>
  );
}

export function DeleteCommentButton({ commentId }: { commentId: string }) {
  const { pending, run } = useRun();
  return (
    <Button variant="ghost" size="icon" className="size-7" aria-label="Delete comment" disabled={pending} onClick={() => run(() => deleteComment(commentId))}>
      <Trash2 className="size-3.5" />
    </Button>
  );
}

export function AddLinkForm({ itemId }: { itemId: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<LinkKind>("pull_request");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const { pending, run } = useRun();
  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Link2 className="size-4" /> Add link
      </Button>
    );
  }
  return (
    <form
      className="space-y-2 rounded-md border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        run(
          () => addLink({ itemId, kind, url, title }),
          () => {
            setUrl("");
            setTitle("");
            setOpen(false);
          },
          (r) => setErrors(r.fieldErrors ?? { url: [r.error] }),
        );
      }}
    >
      <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
        <Select value={kind} onValueChange={(v) => setKind(v as LinkKind)}>
          <SelectTrigger aria-label="Link type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LINK_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {LINK_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Field data-invalid={!!errors.url}>
          <Input aria-label="URL" placeholder="https://github.com/org/repo/pull/42" value={url} onChange={(e) => setUrl(e.target.value)} />
          {errors.url && <FieldError>{errors.url[0]}</FieldError>}
        </Field>
      </div>
      <Input aria-label="Link title" placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          Add link
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function RemoveLinkButton({ linkId }: { linkId: string }) {
  const { pending, run } = useRun();
  return (
    <Button variant="ghost" size="icon" className="size-7" aria-label="Remove link" disabled={pending} onClick={() => run(() => removeLink(linkId))}>
      <X className="size-3.5" />
    </Button>
  );
}

export function AddDependencyForm({ itemId }: { itemId: string }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [kind, setKind] = useState<"blocks" | "relates_to" | "duplicates">("blocks");
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useRun();
  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Add dependency
      </Button>
    );
  }
  return (
    <form
      className="space-y-2 rounded-md border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        run(
          () => addDependency({ successorId: itemId, predecessorKey: key, kind }),
          () => {
            setKey("");
            setOpen(false);
          },
          (r) => setError(r.fieldErrors?.predecessorKey?.[0] ?? r.error),
        );
      }}
    >
      <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
        <Field data-invalid={!!error}>
          <Input aria-label="Other item key" placeholder="Key of the other item, e.g. NW-PAY-5" value={key} onChange={(e) => setKey(e.target.value)} />
          {error && <FieldError>{error}</FieldError>}
        </Field>
        <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
          <SelectTrigger aria-label="Relationship">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="blocks">blocks this item</SelectItem>
            <SelectItem value="relates_to">relates to this item</SelectItem>
            <SelectItem value="duplicates">duplicates this item</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || !key.trim()}>
          Add
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function RemoveDependencyButton({ predecessorId, successorId, kind }: { predecessorId: string; successorId: string; kind: "blocks" | "relates_to" | "duplicates" }) {
  const { pending, run } = useRun();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7"
      aria-label="Remove dependency"
      disabled={pending}
      onClick={() => run(() => removeDependency(predecessorId, successorId, kind))}
    >
      <X className="size-3.5" />
    </Button>
  );
}
