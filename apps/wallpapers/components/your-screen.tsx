"use client";

import { detectScreen, type ScreenInfo } from "@musterli/devices";
import { useSyncExternalStore } from "react";

import { formatSize } from "@/lib/format";

interface YourScreenProps {
  locale: string;
  labels: {
    heading: string;
    detecting: string;
    matched: string;
    unknown: string;
    nativeSize: string;
  };
}

/** Screen size as a stable string, so useSyncExternalStore can compare snapshots. */
function snapshot(): string {
  return `${window.screen.width}x${window.screen.height}x${window.devicePixelRatio}`;
}

function parse(value: string): ScreenInfo {
  const [width = 0, height = 0, pixelRatio = 0] = value.split("x").map(Number);
  return { width, height, pixelRatio };
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

/** Recognizes the visitor's screen; on the server it renders the "detecting" state. */
export function YourScreen({ locale, labels }: YourScreenProps) {
  const value = useSyncExternalStore(subscribe, snapshot, () => null);
  const detection = value ? detectScreen(parse(value)) : undefined;

  return (
    <section
      aria-labelledby="screen-title"
      aria-live="polite"
      className="border-border bg-surface mt-10 rounded-[14px] border p-5"
    >
      <h2 id="screen-title" className="text-muted text-sm font-medium">
        {labels.heading}
      </h2>
      {detection ? (
        <dl className="mt-2 grid gap-x-8 gap-y-1 sm:grid-cols-[auto_1fr]">
          <dt className="text-muted text-sm">{labels.matched}</dt>
          <dd className="font-medium">{detection.device?.name ?? labels.unknown}</dd>
          <dt className="text-muted text-sm">{labels.nativeSize}</dt>
          <dd className="font-medium tabular-nums">
            {formatSize(detection.width, detection.height, locale)} px
          </dd>
        </dl>
      ) : (
        <p className="mt-2">{labels.detecting}</p>
      )}
    </section>
  );
}
