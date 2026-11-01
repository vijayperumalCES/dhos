import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TimeEntryRow } from "@/lib/data/workforce";
import { TIME_CATEGORY_LABELS, WEEKDAY_LABELS, formatHours, timesheetTotals, weekDates } from "@/lib/domain/workforce";
import { cn } from "@/lib/utils";

function rowKey(e: TimeEntryRow) {
  return `${e.category}|${e.project_id ?? ""}|${e.work_item_id ?? ""}`;
}

function rowLabel(e: TimeEntryRow) {
  if (e.category !== "delivery") return { title: TIME_CATEGORY_LABELS[e.category], sub: null };
  return {
    title: e.project ? `${e.project.code} · ${e.project.name}` : "Project",
    sub: e.work_item ? `${e.work_item.key} ${e.work_item.title}` : null,
  };
}

/** Read-only weekly grid: one row per category/project/work item, one column per day. */
export function TimesheetGrid({ weekStart, entries, holidays }: { weekStart: string; entries: TimeEntryRow[]; holidays: Map<string, string> }) {
  const dates = weekDates(weekStart);
  const keyed = entries.map((e) => ({ ...e, rowKey: rowKey(e) }));
  const totals = timesheetTotals(keyed);
  const rows = [...new Map(keyed.map((e) => [e.rowKey, e])).values()];
  const cell = new Map<string, number>();
  for (const e of keyed) cell.set(`${e.rowKey}@${e.entry_date}`, (cell.get(`${e.rowKey}@${e.entry_date}`) ?? 0) + e.hours);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-48 pl-6">Work</TableHead>
            {dates.map((d, i) => (
              <TableHead key={d} className={cn("text-right tabular-nums", i >= 5 && "text-muted-foreground")} title={holidays.get(d)}>
                <div>{WEEKDAY_LABELS[i]}</div>
                <div className="text-xs font-normal">{d.slice(5).replace("-", "/")}</div>
                {holidays.has(d) && <div className="text-[10px] font-normal text-chart-2">Holiday</div>}
              </TableHead>
            ))}
            <TableHead className="pr-6 text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                No time logged this week.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => {
              const label = rowLabel(r);
              return (
                <TableRow key={r.rowKey}>
                  <TableCell className="pl-6">
                    <div className="font-medium">{label.title}</div>
                    {label.sub && <div className="max-w-64 truncate text-xs text-muted-foreground">{label.sub}</div>}
                  </TableCell>
                  {dates.map((d) => {
                    const h = cell.get(`${r.rowKey}@${d}`);
                    return (
                      <TableCell key={d} className="text-right tabular-nums">
                        {h ? h : <span className="text-muted-foreground/50">·</span>}
                      </TableCell>
                    );
                  })}
                  <TableCell className="pr-6 text-right font-medium tabular-nums">{formatHours(totals.byRow.get(r.rowKey) ?? 0)}</TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="pl-6">Day total</TableCell>
            {dates.map((d) => (
              <TableCell key={d} className="text-right tabular-nums">
                {totals.byDate.get(d) ?? 0}
              </TableCell>
            ))}
            <TableCell className="pr-6 text-right tabular-nums">{formatHours(totals.total)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
