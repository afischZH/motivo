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

/**
 * Small preview through the same render path as the canvas. Memoised: only
 * re-renders when the design or size changes.
 */
export const Thumbnail = memo(function Thumbnail({
  tool,
  params,
  seed,
  size,
  edge,
}: ThumbnailProps) {
  const output = useMemo(() => renderMotif(tool, params, seed, size), [tool, params, seed, size]);
  const scale = edge / Math.max(size.width, size.height);
  return <Motif output={output} width={size.width} height={size.height} scale={scale} />;
});
