export type ReportingInput = {
  id: string;
  managerId: string | null;
  name: string;
  jobTitle: string | null;
  department: string | null;
};

export type ReportingNode = Omit<ReportingInput, "managerId"> & { reports: ReportingNode[] };

/**
 * Builds the reporting forest. People whose manager is absent from the input (suspended,
 * or not visible) become roots, so nobody disappears from the chart. The database prevents
 * cycles; a defensive visited-set still guarantees termination.
 */
export function buildReportingTree(people: ReportingInput[]): ReportingNode[] {
  const ids = new Set(people.map((p) => p.id));
  const byManager = new Map<string | null, ReportingInput[]>();
  for (const p of people) {
    const key = p.managerId && ids.has(p.managerId) ? p.managerId : null;
    byManager.set(key, [...(byManager.get(key) ?? []), p]);
  }
  const visited = new Set<string>();
  const build = (p: ReportingInput): ReportingNode => {
    visited.add(p.id);
    const reports = (byManager.get(p.id) ?? []).filter((c) => !visited.has(c.id)).map(build);
    reports.sort(compare);
    return { id: p.id, name: p.name, jobTitle: p.jobTitle, department: p.department, reports };
  };
  return (byManager.get(null) ?? []).map(build).sort(compare);
}

function compare(a: { reports: unknown[]; name: string }, b: { reports: unknown[]; name: string }) {
  return b.reports.length - a.reports.length || a.name.localeCompare(b.name);
}
