"use client";

import { Download, Upload } from "lucide-react";
import { useId, useRef } from "react";

import { Button } from "@/components/ui/button";

/** Reads a chosen .csv file as text. Parsing and validation happen on the server. */
export function CsvFileInput({ onLoad, label = "Choose CSV file", disabled }: { onLoad: (text: string, name: string) => void; label?: string; disabled?: boolean }) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        id={id}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) onLoad(await file.text(), file.name);
          e.target.value = "";
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => ref.current?.click()}>
        <Upload className="size-4" /> {label}
      </Button>
    </>
  );
}

/** Downloads a CSV template built in the browser. */
export function CsvTemplateButton({ filename, headers, example }: { filename: string; headers: readonly string[]; example: string[] }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => {
        const quote = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
        const csv = `${headers.join(",")}\r\n${example.map(quote).join(",")}\r\n`;
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        const a = Object.assign(document.createElement("a"), { href: url, download: filename });
        a.click();
        URL.revokeObjectURL(url);
      }}
    >
      <Download className="size-4" /> Template
    </Button>
  );
}
