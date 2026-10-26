import Link from "next/link";

import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <EmptyState
      className="mt-12"
      title="Not found"
      description="This record doesn't exist in the current organization, or you don't have access to it."
      action={
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to Command Center</Link>
        </Button>
      }
    />
  );
}
