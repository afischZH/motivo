"use client";

import type { CanvasSize } from "@musterli/tool-registry";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cx } from "../controls/primitives";
import { Motif } from "./motif";
import type { MotifOutput } from "./render";

/** "fit" follows the stage size; a number is a fixed scale (1 = 100 %). */
export type Zoom = "fit" | number;

/** Fixed zoom steps offered as buttons (docs/DESIGN.md 2: Fit, 1:1, more). */
export const ZOOM_LEVELS: readonly number[] = [0.5, 1, 2];
export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 4;

/** Space between the motif and the stage edge in fit mode, in CSS pixels. */
const FIT_PADDING = 24;

/** Scale that fits `size` into a stage of `stage` pixels, never above 100 %. */
export function fitScale(size: CanvasSize, stage: { width: number; height: number }): number {
  const w = Math.max(1, stage.width - 2 * FIT_PADDING);
  const h = Math.max(1, stage.height - 2 * FIT_PADDING);
  return Math.min(1, w / size.width, h / size.height);
}

export function clampZoom(scale: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));
}

/** Checkerboard behind transparent designs, built from theme tokens. */
export const CHECKERBOARD_STYLE: CSSProperties = {
  backgroundColor: "var(--background)",
  backgroundImage: "repeating-conic-gradient(var(--muted) 0 25%, transparent 0 50%)",
  backgroundSize: "16px 16px",
};

// useLayoutEffect warns during server rendering; measurement only matters on the client.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface PreviewStageProps {
  output: MotifOutput;
  size: CanvasSize;
  zoom: Zoom;
  onZoomChange(zoom: Zoom): void;
  /** Called with the scale actually shown, e.g. for the zoom readout. */
  onScaleChange?(scale: number): void;
  /** Accessible description of the design. */
  label: string;
  /** Show the checkerboard (transparent background). */
  transparent: boolean;
  /** Shown instead of the motif when the render kind has no preview yet. */
  unsupportedText: string;
  /** Interactive layer over the motif (region editing), sized like the motif. */
  overlay?: ReactNode;
  className?: string;
}

/**
 * The canvas area: neutral stage, motif at the current zoom, scrollable when
 * zoomed in. Ctrl/⌘ + wheel zooms.
 */
export function PreviewStage(props: PreviewStageProps) {
  const { size, zoom, onZoomChange, onScaleChange } = props;
  const stageRef = useRef<HTMLDivElement>(null);
  const noticeId = useId();
  const [motifNotice, setMotifNotice] = useState(false);
  const [stage, setStage] = useState<{ width: number; height: number } | null>(null);

  useIsomorphicLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setStage((prev) =>
        prev && prev.width === rect.width && prev.height === rect.height
          ? prev
          : { width: rect.width, height: rect.height },
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scale = zoom === "fit" ? (stage ? fitScale(size, stage) : null) : zoom;

  useEffect(() => {
    if (scale !== null) onScaleChange?.(scale);
  }, [scale, onScaleChange]);

  // Non-passive listener: Ctrl/⌘ + wheel must not zoom the whole page.
  const scaleRef = useRef(scale);
  useEffect(() => {
    scaleRef.current = scale;
  });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const current = scaleRef.current ?? 1;
      const factor = Math.exp(-event.deltaY * 0.002);
      onZoomChange(clampZoom(Math.round(current * factor * 1000) / 1000));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onZoomChange]);

  return (
    <div
      ref={stageRef}
      className={cx("relative flex overflow-auto bg-canvas", props.className)}
      data-testid="preview-stage"
    >
      <div className="relative m-auto shrink-0">
        {/* A notice replacing the picture is a child of the image, so it is named as its description. */}
        <div
          role="img"
          aria-label={props.label}
          aria-describedby={
            scale !== null && (props.output.kind === "unsupported" || motifNotice)
              ? noticeId
              : undefined
          }
          className="shadow-sm"
          style={props.transparent ? CHECKERBOARD_STYLE : undefined}
          data-testid="preview"
        >
          {scale !== null &&
            (props.output.kind === "unsupported" ? (
              <div
                id={noticeId}
                className="flex items-center justify-center p-4 text-center text-sm text-muted-foreground"
                style={{ width: size.width * scale, height: size.height * scale }}
              >
                {props.unsupportedText}
              </div>
            ) : (
              <Motif
                output={props.output}
                width={size.width}
                height={size.height}
                scale={scale}
                animate
                noticeId={noticeId}
                onNoticeChange={setMotifNotice}
              />
            ))}
        </div>
        {/* Outside the role="img" box: an image's children are hidden from assistive tech. */}
        {scale !== null && props.output.kind !== "unsupported" && props.overlay}
      </div>
    </div>
  );
}
