"use client";

import type { AnyToolDefinition, CanvasSize } from "@motivo/tool-registry";
import { memo, useMemo } from "react";
import type { ParamValues } from "../store/editor-store";
import { Motif } from "./motif";
import { renderMotif } from "./render";

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
 * Small preview through the same render path as the canvas, rendered at a
 * reduced size (`thumbnailRenderSize`) so many thumbnails stay cheap even for
 * large canvases. Designs are sized in relative units, so they keep their
 * look; params given in absolute px (e.g. an outline width) appear
 * proportionally bolder. Memoised: only re-renders when the design or size
 * changes.
 */
export const Thumbnail = memo(function Thumbnail({
  tool,
  params,
  seed,
  size,
  edge,
}: ThumbnailProps) {
  const { width, height } = size;
  const renderSize = useMemo(() => thumbnailRenderSize({ width, height }), [width, height]);
  const output = useMemo(
    () => renderMotif(tool, params, seed, renderSize),
    [tool, params, seed, renderSize],
  );
  const scale = edge / Math.max(renderSize.width, renderSize.height);
  return (
    <Motif output={output} width={renderSize.width} height={renderSize.height} scale={scale} />
  );
});
