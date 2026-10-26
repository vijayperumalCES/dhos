import { describe, expect, it } from "vitest";

import { escapeCsvCell, parseCsv, parseCsvRecords, toCsv } from "@/lib/csv";

describe("csv", () => {
  it("round-trips quotes, commas and newlines", () => {
    const rows = [{ a: 'He said "hi"', b: "x, y", c: "line1\nline2" }];
    const csv = toCsv(rows, [
      { header: "a", value: (r) => r.a },
      { header: "b", value: (r) => r.b },
      { header: "c", value: (r) => r.c },
    ]);
    expect(parseCsv(csv)).toEqual([
      ["a", "b", "c"],
      ['He said "hi"', "x, y", "line1\nline2"],
    ]);
  });

  it("neutralises spreadsheet formulas in exported text", () => {
    expect(escapeCsvCell("=HYPERLINK(\"http://evil\")")).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(escapeCsvCell("+1")).toBe("'+1");
    expect(escapeCsvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(escapeCsvCell(-5)).toBe("-5"); // real numbers are left alone
    expect(escapeCsvCell(null)).toBe("");
  });

  it("handles CRLF, a BOM, trailing newline and blank lines", () => {
    expect(parseCsv("﻿a,b\r\n1,2\r\n\r\n3,4\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("rejects an unterminated quote", () => {
    expect(() => parseCsv('a,"b\n1,2')).toThrow("Unterminated");
  });

  it("normalises headers and pads missing cells", () => {
    const { headers, records } = parseCsvRecords("Code, Project Name ,Target End Date\nPAY-1,Payments\n");
    expect(headers).toEqual(["code", "project_name", "target_end_date"]);
    expect(records).toEqual([{ code: "PAY-1", project_name: "Payments", target_end_date: "" }]);
  });
});
