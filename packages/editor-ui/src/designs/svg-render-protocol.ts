/** Messages between `svg-render-client.ts` and `svg-render.worker.ts`. */
import type { CanvasSize } from "@musterli/tool-registry";

export interface SvgRenderRequest {
  id: number;
  toolId: string;
  params: Readonly<Record<string, unknown>>;
  seed: number;
  size: CanvasSize;
}

export type SvgRenderResponse =
  | { id: number; ok: true; svg: string }
  /** Unknown tool or a render error: the caller falls back to the main thread. */
  | { id: number; ok: false };
