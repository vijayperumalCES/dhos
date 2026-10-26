/**
 * Minimal RFC 4180 CSV support for imports and exports.
 *
 * Exports guard against spreadsheet formula injection: cells starting with = + - @ (or a tab /
 * carriage return) are prefixed with an apostrophe so Excel and Sheets treat them as text.
 */

export type CsvColumn<T> = { header: string; value: (row: T) => string | number | null | undefined };

const FORMULA_START = /^[=+\-@\t\r]/;

export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (typeof value === "string" && FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((c) => escapeCsvCell(c.header)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => escapeCsvCell(c.value(row))).join(","));
  // BOM so Excel opens UTF-8 correctly; CRLF per RFC 4180.
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** Parses CSV text into rows of cells. Handles quoted fields, escaped quotes, CRLF and a BOM. */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (quoted) throw new Error("Unterminated quoted field.");
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Parses CSV with a header row into objects keyed by normalised (lower_snake) header names. */
export function parseCsvRecords(text: string): { headers: string[]; records: Record<string, string>[] } {
  const [header, ...body] = parseCsv(text);
  if (!header) return { headers: [], records: [] };
  const headers = header.map((h) =>
    h
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, ""),
  );
  const records = body.map((cells) => Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? "").trim()])));
  return { headers, records };
}

/** A downloadable, uncached CSV response named `<basename>-<YYYY-MM-DD>.csv`. */
export function csvResponse(csv: string, basename: string) {
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${basename}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
