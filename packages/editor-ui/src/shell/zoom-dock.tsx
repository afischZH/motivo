"use client";

import type { ReactNode } from "react";
import { Hint } from "../controls/hint";
import { FOCUS_RING, cx } from "../controls/primitives";
import { useT } from "../i18n";
import { FitIcon, MinusIcon, PlusIcon } from "./icons";
import { ZOOM_MAX, ZOOM_MIN, type Zoom } from "./preview";

/** Steps of the − and + buttons (fractions of 100 %). */
export const ZOOM_STEPS: readonly number[] = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
const SMALLEST_STEP = 0.1;

/** The next step above (`direction` 1) or below (-1) the shown scale. */
export function stepZoom(scale: number, direction: 1 | -1): number {
  const eps = 0.001;
  const next =
    direction === 1
      ? ZOOM_STEPS.find((s) => s > scale + eps)
      : [...ZOOM_STEPS].reverse().find((s) => s < scale - eps);
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next ?? scale));
}

/** A floating pill over the editor stage (zoom, view toggles). */
export const FLOATING_BAR_CLASS =
  "pointer-events-auto flex items-center gap-0.5 rounded-full border border-border bg-background/90 p-1 shadow-[0_1px_2px_oklch(0_0_0/0.08),0_8px_24px_-8px_oklch(0_0_0/0.25)] backdrop-blur-sm";

/** A round button inside `FLOATING_BAR_CLASS`. */
export const FLOATING_BUTTON_CLASS = cx(
  "inline-flex h-8 min-w-8 shrink-0 items-center justify-center gap-1 rounded-full px-2 text-xs font-medium text-muted-foreground tabular-nums transition-colors",
  "hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4",
  "aria-pressed:bg-foreground/10 aria-pressed:text-foreground",
  FOCUS_RING,
);

/**
 * Zoom controls floating at the bottom of the stage: −, the shown scale, +,
 * then "fit" and 100 % as toggles (keys 0 and 1).
 */
export function ZoomDock(props: {
  zoom: Zoom;
  /** The scale actually shown (fit resolves to a number once measured). */
  shownScale: number | null;
  onZoomChange(zoom: Zoom): void;
  /** Extra controls after the zoom buttons. */
  children?: ReactNode;
  className?: string;
}) {
  const t = useT();
  const scale = props.shownScale;
  const percent = (s: number) => Math.round(s * 100);
  return (
    <div
      role="group"
      aria-label={t("Editor.shell.zoom")}
      className={cx(FLOATING_BAR_CLASS, props.className)}
      data-testid="zoom-dock"
    >
      <Hint label={t("Editor.shell.zoomOut")} side="top">
        <button
          type="button"
          className={FLOATING_BUTTON_CLASS}
          onClick={() => scale !== null && props.onZoomChange(stepZoom(scale, -1))}
          disabled={scale === null || scale <= SMALLEST_STEP + 0.001}
          aria-label={t("Editor.shell.zoomOut")}
        >
          <MinusIcon />
        </button>
      </Hint>
      <output
        className="min-w-12 text-center text-xs font-medium text-foreground tabular-nums"
        aria-label={t("Editor.shell.zoomCurrent")}
      >
        {scale === null ? "" : t("Editor.shell.zoomPercent", { percent: percent(scale) })}
      </output>
      <Hint label={t("Editor.shell.zoomIn")} side="top">
        <button
          type="button"
          className={FLOATING_BUTTON_CLASS}
          onClick={() => scale !== null && props.onZoomChange(stepZoom(scale, 1))}
          disabled={scale === null || scale >= ZOOM_MAX - 0.001}
          aria-label={t("Editor.shell.zoomIn")}
        >
          <PlusIcon />
        </button>
      </Hint>
      <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-border" />
      <Hint label={t("Editor.shell.zoomFit")} keys={["0"]} side="top">
        <button
          type="button"
          className={FLOATING_BUTTON_CLASS}
          aria-pressed={props.zoom === "fit"}
          aria-keyshortcuts="0"
          aria-label={t("Editor.shell.zoomFit")}
          onClick={() => props.onZoomChange("fit")}
        >
          <FitIcon />
        </button>
      </Hint>
      <Hint label={t("Editor.shell.zoomPercent", { percent: 100 })} keys={["1"]} side="top">
        <button
          type="button"
          className={FLOATING_BUTTON_CLASS}
          aria-pressed={props.zoom === 1}
          aria-keyshortcuts="1"
          onClick={() => props.onZoomChange(1)}
        >
          {t("Editor.shell.zoomPercent", { percent: 100 })}
        </button>
      </Hint>
      {props.children}
    </div>
  );
}
