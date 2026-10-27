"use client";

import type { AnyToolDefinition, CanvasSize } from "@motivo/tool-registry";
import { memo, useMemo } from "react";
import type { ParamValues } from "../store/editor-store";
import { Motif } from "./motif";
import { peekMotif, renderMotifCached, type MotifOutput } from "./render";
import { useHydrated } from "./use-hydrated";

export interface ThumbnailProps {
  tool: AnyToolDefinition;
  params: ParamValues;
  seed: number;
  size: CanvasSize;
  /** Longest edge of the thumbnail in CSS pixels. */
  edge: number;
}

/** Longest edge thumbnails are rendered at, in CSS pixels (about 3x the shown size, for HiDPI). */
export const THUMBNAIL_RENDER_EDGE = 256;

/**
 * Canvas size a thumbnail is rendered at: the design size scaled down so the
 * longest edge is at most `maxEdge`, keeping the aspect ratio (each edge at
 * least 1 px). Sizes already small enough are returned unchanged.
 */
export function thumbnailRenderSize(size: CanvasSize, maxEdge = THUMBNAIL_RENDER_EDGE): CanvasSize {
  const longest = Math.max(size.width, size.height);
  if (longest <= maxEdge) return size;
  const k = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(size.width * k)),
    height: Math.max(1, Math.round(size.height * k)),
  };
}

/**
 * Small preview through the same render path as the canvas.
 *
 * - Client only: the server and the hydration pass show an empty box of the
 *   same size, so thumbnails do not bloat the HTML with data URLs.
 * - If the preview already rendered exactly this design (the active
 *   variant), its output is reused, so the design is rendered and decoded
 *   once. Otherwise it renders at a reduced size (`thumbnailRenderSize`).
 *   Designs are sized in relative units and keep their look; params in
 *   absolute px (e.g. an outline width) appear proportionally bolder.
 *
 * Memoised: only re-renders when the design or size changes.
 */
export const Thumbnail = memo(function Thumbnail({
  tool,
  params,
  seed,
  size,
  edge,
}: ThumbnailProps) {
  const hydrated = useHydrated();
  const { width, height } = size;
  const motif = useMemo((): { output: MotifOutput; size: CanvasSize } | null => {
    if (!hydrated) return null;
    const full = { width, height };
    const shared = peekMotif(tool, params, seed, full);
    if (shared) return { output: shared, size: full };
    const reduced = thumbnailRenderSize(full);
    return { output: renderMotifCached(tool, params, seed, reduced), size: reduced };
  }, [hydrated, tool, params, seed, width, height]);

  const shown = motif?.size ?? thumbnailRenderSize({ width, height });
  const scale = edge / Math.max(shown.width, shown.height);
  if (!motif) {
    return (
      <span
        aria-hidden="true"
        className="block"
        style={{ width: shown.width * scale, height: shown.height * scale }}
        data-thumbnail-placeholder=""
      />
    );
  }
  return <Motif output={motif.output} width={shown.width} height={shown.height} scale={scale} />;
});
