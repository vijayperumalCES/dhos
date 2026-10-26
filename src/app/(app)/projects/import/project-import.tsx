"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { CsvFileInput, CsvTemplateButton } from "@/components/common/csv-file-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { commitProjectImport, previewProjectImport } from "@/lib/actions/imports";
import type { ImportAnalysis } from "@/lib/data/project-import";

const EXAMPLE = [
  "PAY-02",
  "Payments Phase 2",
  "Second phase of the payments programme",
  "CONTOSO",
  "CONTOSO-DX",
  "CFO, Contoso Bank",
  "arjun@northwind.example",
  "",
  "Platform Engineering",
  "scrum",
  "2026-11-01",
  "2027-03-31",
  "Instant settlement for all corporate accounts",
  "",
  "",
  "",
];

export function ProjectImport({ columns }: { columns: readonly string[] }) {
  const router = useRouter();
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const valid = analysis?.rows.filter((r) => r.errors.length === 0).length ?? 0;
  const invalid = (analysis?.rows.length ?? 0) - valid;

  function preview(text: string, name: string) {
    setCsv(text);
    setFileName(name);
    setAnalysis(null);
    setError(null);
    startTransition(async () => {
      const r = await previewProjectImport(text);
      if (r.ok) setAnalysis(r.data);
      else setError(r.error);
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>1. Prepare a CSV</CardTitle>
          <CardDescription>
            Required columns: <code>code</code>, <code>name</code>. Optional: {columns.slice(2).map((c) => <code key={c} className="mr-1">{c}</code>)}.
            <br />
            <code>client</code> and <code>program</code> accept a code or name; people are matched by email; <code>primary_team</code> by team
            name. Dates use YYYY-MM-DD. Imported projects start as <strong>Proposed</strong> with health{" "}
            <strong>Not assessed</strong>; move them through the lifecycle afterwards so every change is recorded.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <CsvTemplateButton filename="stride-projects-template.csv" headers={columns} example={EXAMPLE} />
          <CsvFileInput onLoad={preview} disabled={pending} />
          {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {analysis?.fatal && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {analysis.fatal}
        </p>
      )}

      {analysis && !analysis.fatal && (
        <Card className="pb-0">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle>2. Review</CardTitle>
              <CardDescription>
                {valid} ready · {invalid} with errors. Nothing is imported unless every row is valid.
              </CardDescription>
            </div>
            <Button
              disabled={pending || invalid > 0 || !csv}
              onClick={() =>
                startTransition(async () => {
                  const r = await commitProjectImport(csv!);
                  if (r.ok) {
                    toast.success(r.message);
                    router.push("/projects?status=proposed");
                  } else setError(r.error);
                })
              }
            >
              {pending ? "Importing…" : `Import ${valid} project${valid === 1 ? "" : "s"}`}
            </Button>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16 pl-6">Line</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="pr-6">Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analysis.rows.map((r) => (
                  <TableRow key={r.line}>
                    <TableCell className="pl-6 tabular-nums">{r.line}</TableCell>
                    <TableCell className="font-mono text-xs">{r.code || "—"}</TableCell>
                    <TableCell>{r.name || "—"}</TableCell>
                    <TableCell className="pr-6">
                      {r.errors.length === 0 ? (
                        <span className="inline-flex items-center gap-1 text-sm">
                          <CheckCircle2 className="size-4 text-health-green" aria-hidden /> Ready
                        </span>
                      ) : (
                        <ul className="space-y-0.5 text-sm text-destructive">
                          {r.errors.map((e) => (
                            <li key={e} className="flex gap-1">
                              <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {e}
                            </li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
