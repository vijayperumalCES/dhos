"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { setProgramStatus } from "@/lib/actions/programs";

export function ProgramStatusButton({ id, status }: { id: string; status: "active" | "closed" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await setProgramStatus(id, status === "active" ? "closed" : "active");
          if (r.ok) {
            toast.success(r.message);
            router.refresh();
          } else toast.error(r.error);
        })
      }
    >
      {status === "active" ? "Close program" : "Reopen program"}
    </Button>
  );
}
