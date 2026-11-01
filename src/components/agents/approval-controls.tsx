"use client";

import { Check, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { NoteDialog } from "@/components/common/note-dialog";
import { Button } from "@/components/ui/button";
import { decideApproval, executeApproval } from "@/lib/actions/agents";

export function ApprovalButtons({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await decideApproval(id, true, { note: "" });
            if (r.ok) toast.success(r.message);
            else toast.error(r.error);
            router.refresh();
          })
        }
      >
        <Check className="size-4" /> Approve
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => setRejecting(true)}>
        <X className="size-4" /> Reject
      </Button>
      <NoteDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title="Reject this proposal"
        description="The requester will see your reason."
        label="Reason"
        submitLabel="Reject"
        destructive
        onSubmit={(note) => decideApproval(id, false, { note })}
      />
    </div>
  );
}

export function RetryButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await executeApproval(id);
          if (r.ok) toast.success(r.message);
          else toast.error(r.error);
          router.refresh();
        })
      }
    >
      <RotateCcw className="size-4" /> Retry
    </Button>
  );
}
