import { createRng } from "@musterli/engine";
import type { CanvasSize, RenderContext } from "./types";

/**
 * Builds the context for one render call. A fresh rng per call keeps preview
 * and export identical for the same (params, seed, size).
 */
export function createRenderContext(seed: number, size: CanvasSize, t?: number): RenderContext {
  const ctx: RenderContext = {
    seed: seed >>> 0,
    rng: createRng(seed),
    width: size.width,
    height: size.height,
  };
  if (t !== undefined) ctx.t = t;
  return ctx;
}
