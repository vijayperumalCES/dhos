import type { Json } from "@/lib/supabase/database.types";
import { formatDateTime } from "@/lib/format";

type AuditRow = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  changes: Json;
  metadata: Json;
  occurred_at: string;
};

const HIDDEN_FIELDS = new Set(["id", "organization_id", "created_by", "status_changed_at", "health_updated_at"]);

function describeAction(action: string) {
  const [table, op] = action.split(".");
  const noun = table.replace(/_/g, " ").replace(/s$/, "");
  return { insert: `Created ${noun}`, update: `Updated ${noun}`, delete: `Removed ${noun}` }[op] ?? action;
}

function renderValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function AuditTrail({ rows, names, showEntity = false }: { rows: AuditRow[]; names: Map<string, string>; showEntity?: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No audit events recorded.</p>;

  return (
    <ol className="space-y-3">
      {rows.map((r) => {
        const changes = (r.changes ?? {}) as Record<string, unknown>;
        const isUpdate = r.action.endsWith(".update");
        const reason = (r.metadata as Record<string, unknown> | null)?.reason;
        const entries = Object.entries(changes).filter(([k]) => !HIDDEN_FIELDS.has(k));
        return (
          <li key={r.id} className="rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p>
                <span className="font-medium">{describeAction(r.action)}</span>
                {showEntity && <span className="text-muted-foreground"> · {r.entity_type}</span>}
                <span className="text-muted-foreground"> by {r.actor_id ? (names.get(r.actor_id) ?? "a user") : "system"}</span>
              </p>
              <time className="text-xs text-muted-foreground" dateTime={r.occurred_at}>
                {formatDateTime(r.occurred_at)}
              </time>
            </div>
            {typeof reason === "string" && <p className="mt-1 text-muted-foreground">Reason: {reason}</p>}
            {isUpdate && entries.length > 0 && (
              <dl className="mt-2 grid gap-1 text-xs">
                {entries.map(([field, diff]) => {
                  const d = diff as { from?: unknown; to?: unknown };
                  return (
                    <div key={field} className="flex flex-wrap gap-1">
                      <dt className="font-medium">{field.replace(/_/g, " ")}:</dt>
                      <dd className="text-muted-foreground">
                        <span className="line-through decoration-1">{renderValue(d.from)}</span> → {renderValue(d.to)}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            )}
          </li>
        );
      })}
    </ol>
  );
}
