"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type CopyState = "idle" | "copied" | "failed";

/**
 * A colour value that copies itself. The accessible name is the visible
 * text (format plus value) with the action added as screen reader text
 * ("Copy HEX #fff", "HEX #fff kopieren"), so it always contains what is
 * shown. The result is announced through a polite live region and shown
 * briefly as a badge. Texts come as props: no client message provider.
 */
export function CopyButton({
  format,
  value,
  before,
  after,
  copied,
  failed,
  className,
}: {
  /** Short visible format name, e.g. "HEX". */
  format: string;
  value: string;
  /** Screen reader text before and after the visible text, e.g. "Copy" / "". */
  before: string;
  after: string;
  copied: string;
  failed: string;
  className?: string;
}) {
  const [state, setState] = useState<CopyState>("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  const message = state === "copied" ? copied : state === "failed" ? failed : "";

  return (
    <span className={cn("relative flex", className)}>
      <button
        type="button"
        onClick={onCopy}
        className="relative flex min-h-11 w-full flex-col items-start justify-center rounded-control border border-border px-2.5 py-1 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {before && <span className="sr-only">{`${before} `}</span>}
        <span className="text-[0.625rem] font-medium text-muted-foreground">{format}</span>{" "}
        <code className="max-w-full truncate font-mono text-[0.6875rem]">{value}</code>
        {after && <span className="sr-only">{` ${after}`}</span>}
        {message && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 rounded-sm bg-foreground px-1.5 py-0.5 text-[0.6875rem] font-medium text-background"
          >
            {message}
          </span>
        )}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {message}
      </span>
    </span>
  );
}
