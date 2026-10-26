import { FlaskConical } from "lucide-react";

export function DemoBanner({ orgName }: { orgName: string }) {
  return (
    <div role="note" className="flex items-center gap-2 bg-demo px-4 py-1.5 text-xs text-demo-foreground">
      <FlaskConical className="size-3.5 shrink-0" aria-hidden />
      <span>
        <strong>Demo data.</strong> {orgName} is a seeded demonstration organization. Its clients, projects and people
        are fictional and do not describe real delivery performance.
      </span>
    </div>
  );
}
