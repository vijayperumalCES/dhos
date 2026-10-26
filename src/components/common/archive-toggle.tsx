"use client";

import { Archive, ArchiveRestore } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { setClientArchived } from "@/lib/actions/clients";
import { setTeamArchived } from "@/lib/actions/teams";

const ACTIONS = { team: setTeamArchived, client: setClientArchived };

export function ArchiveToggle({ kind, id, archived, label }: { kind: keyof typeof ACTIONS; id: string; archived: boolean; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const result = await ACTIONS[kind](id, !archived);
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else toast.error(result.error);
    });
  }

  if (archived) {
    return (
      <Button variant="outline" size="sm" onClick={toggle} disabled={pending}>
        <ArchiveRestore className="size-4" /> Restore
      </Button>
    );
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending}>
          <Archive className="size-4" /> Archive
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive {label}?</AlertDialogTitle>
          <AlertDialogDescription>
            It will be hidden from lists and pickers. Nothing is deleted, existing links are kept, and it can be restored
            at any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={toggle}>Archive</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
