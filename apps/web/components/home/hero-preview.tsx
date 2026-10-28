"use client";

import { useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export interface PreviewFrame {
  /** Prerendered motif SVG. */
  src: string;
  /** Preset name, shown in the status bar and announced on change. */
  name: string;
}

interface HeroPreviewProps {
  /** Tool name in the window title. */
  toolName: string;
  /** Editor URL of the tool; the window links there. */
  editorHref: string;
  /** Defaults first, then every preset. */
  frames: readonly PreviewFrame[];
  /** Export formats shown as chips in the title bar. */
  formats: readonly string[];
  labels: {
    /** Key cap text, e.g. "Leertaste". */
    key: string;
    /** Button text, e.g. "Neue Variante". */
    next: string;
    /** Link text to open the editor. */
    open: string;
  };
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  // Space already activates buttons and links: do not switch twice.
  return /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(target.tagName);
}

/**
 * The home hero's product preview: an editor-like window whose stage shows the
 * tool's presets. Space (or the button) switches to the next one, the same
 * gesture as in the editor. Deterministic: presets cycle in order.
 */
export function HeroPreview({ toolName, editorHref, frames, formats, labels }: HeroPreviewProps) {
  const [index, setIndex] = useState(0);
  const current = frames[index] ?? frames[0];

  const next = useCallback(() => setIndex((i) => (i + 1) % frames.length), [frames.length]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== " " || event.repeat || event.metaKey || event.ctrlKey || event.altKey)
        return;
      if (isInteractiveTarget(event.target)) return;
      event.preventDefault();
      next();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_oklch(0_0_0/0.06),0_24px_64px_-24px_oklch(0.3_0.12_275/0.35)]">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
          </span>
          <span className="ml-2 text-sm font-medium">{toolName}</span>
        </div>
        <span aria-hidden="true" className="hidden gap-1 sm:flex">
          {formats.map((format) => (
            <span
              key={format}
              className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
            >
              {format}
            </span>
          ))}
        </span>
      </div>

      <a
        href={editorHref}
        aria-label={labels.open}
        className="relative block aspect-[16/10] bg-muted focus-visible:outline-offset-[-4px]"
      >
        {frames.map((frame, i) => (
          // Static SVG files; next/image would add nothing but a loader.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={frame.src}
            src={frame.src}
            alt=""
            width={1600}
            height={1000}
            loading={i === 0 ? "eager" : "lazy"}
            fetchPriority={i === 0 ? "high" : "auto"}
            decoding="async"
            draggable={false}
            className={cn(
              "absolute inset-0 size-full object-cover transition-opacity duration-300 ease-out",
              i === index ? "opacity-100" : "opacity-0",
            )}
          />
        ))}
      </a>

      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
        <p aria-live="polite" className="truncate text-sm text-muted-foreground">
          {current?.name}{" "}
          <span className="tabular-nums">
            · {index + 1}/{frames.length}
          </span>
        </p>
        <button
          type="button"
          onClick={next}
          aria-keyshortcuts="Space"
          className="inline-flex shrink-0 items-center gap-2 rounded-md px-2 py-1 text-sm font-medium hover:bg-accent"
        >
          <kbd className="rounded-sm border border-border bg-muted px-1.5 font-sans text-xs">
            {labels.key}
          </kbd>
          {labels.next}
        </button>
      </div>
    </div>
  );
}
