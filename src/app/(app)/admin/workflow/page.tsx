import { Star } from "lucide-react";
import type { Metadata } from "next";

import { AccessDenied } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireOrgContext } from "@/lib/auth/org-context";
import { listWorkflowStates } from "@/lib/data/work";
import { CATEGORY_LABELS } from "@/lib/domain/work";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { StateDialog, StateRowActions, TransitionToggle } from "./workflow-controls";

export const metadata: Metadata = { title: "Workflow" };

export default async function WorkflowPage() {
  const ctx = await requireOrgContext();
  if (!ctx.permissions.has("workflow.manage")) return <AccessDenied what="workflow configuration" />;
  const supabase = await createSupabaseServerClient();
  const [states, { data: transitions }] = await Promise.all([
    listWorkflowStates(ctx),
    supabase.from("workflow_transitions").select("from_state_id, to_state_id").eq("organization_id", ctx.organization.id),
  ]);
  const allowed = new Set((transitions ?? []).map((t) => `${t.from_state_id}>${t.to_state_id}`));
  const restricted = new Set((transitions ?? []).map((t) => t.from_state_id));

  return (
    <div className="space-y-6">
      <Card className="pb-0">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Workflow states</CardTitle>
            <CardDescription>Shared by every project in {ctx.organization.name}; board columns follow this order.</CardDescription>
          </div>
          <StateDialog />
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">State</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>WIP limit</TableHead>
                <TableHead className="pr-6 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {states.map((s, i) => (
                <TableRow key={s.id}>
                  <TableCell className="pl-6 font-medium">
                    {s.name}{" "}
                    {s.is_default && (
                      <Badge variant="outline" className="ml-1 gap-1">
                        <Star className="size-3" aria-hidden /> Default
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{CATEGORY_LABELS[s.category]}</TableCell>
                  <TableCell className="tabular-nums">{s.wip_limit ?? "—"}</TableCell>
                  <TableCell className="pr-6">
                    <div className="flex justify-end">
                      <StateDialog state={{ id: s.id, name: s.name, category: s.category, wipLimit: s.wip_limit?.toString() ?? "" }} />
                      <StateRowActions id={s.id} name={s.name} isDefault={s.is_default} first={i === 0} last={i === states.length - 1} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transition rules</CardTitle>
          <CardDescription>
            By default an item can move between any two states. Tick boxes in a row to restrict that state: once a row has
            at least one tick, only the ticked moves are allowed from it. Rules are enforced by the database for boards,
            forms and imports alike.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
            <caption className="sr-only">Allowed moves from each state (rows) to each state (columns)</caption>
            <thead>
              <tr>
                <th scope="col" className="p-2 text-left font-medium">
                  From ↓ / To →
                </th>
                {states.map((s) => (
                  <th key={s.id} scope="col" className="p-2 text-center font-medium">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {states.map((from) => (
                <tr key={from.id}>
                  <th scope="row" className="border-t p-2 text-left font-normal">
                    {from.name}
                    <span className="block text-xs text-muted-foreground">{restricted.has(from.id) ? "Restricted" : "Any move allowed"}</span>
                  </th>
                  {states.map((to) => (
                    <td key={to.id} className="border-t p-2 text-center">
                      {from.id === to.id ? (
                        <span className="text-muted-foreground" aria-hidden>
                          —
                        </span>
                      ) : (
                        <TransitionToggle fromId={from.id} toId={to.id} fromName={from.name} toName={to.name} allowed={allowed.has(`${from.id}>${to.id}`)} />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
