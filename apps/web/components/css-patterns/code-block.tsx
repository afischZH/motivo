"use client";

import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";

type CopyState = "idle" | "copied" | "failed";

/**
 * A titled code block with a copy button. The `<pre>` is focusable, so a
 * long line can be scrolled with the keyboard; the copy result is announced.
 */
export function CodeBlock({
  title,
  code,
  copy,
  copyLabel,
  copied,
  copyFailed,
}: {
  title: string;
  code: string;
  copy: string;
  copyLabel: string;
  copied: string;
  copyFailed: string;
}) {
  const id = useId();
  const [state, setState] = useState<CopyState>("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 3000);
    return () => clearTimeout(timer);
  }, [state]);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${id}-title`} className="text-sm font-semibold">
          {title}
        </h3>
        <div className="flex items-center gap-3">
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
            {state === "copied" ? copied : state === "failed" ? copyFailed : ""}
          </p>
          <Button type="button" size="sm" variant="outline" onClick={onCopy} aria-label={copyLabel}>
            {copy}
          </Button>
        </div>
      </div>
      <pre
        tabIndex={0}
        aria-labelledby={`${id}-title`}
        className="max-h-80 overflow-auto rounded-card border border-border bg-muted p-4 text-xs leading-relaxed whitespace-pre-wrap break-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}
