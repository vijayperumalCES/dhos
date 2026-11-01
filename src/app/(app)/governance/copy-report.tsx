"use client";

import { Check, ClipboardCopy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function CopyReportButton({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(markdown);
          setCopied(true);
          toast.success("Report copied as Markdown.");
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error("Couldn't copy. Select the text in the preview instead.");
        }
      }}
    >
      {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />} Copy as Markdown
    </Button>
  );
}
