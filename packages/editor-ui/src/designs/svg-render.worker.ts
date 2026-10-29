/**
 * SVG render worker: runs a tool's own render function off the main thread
 * (the busiest generators, such as Starry Sky, Flow Field or Topo Lines,
 * take 30 to 60 ms and more on slow machines). Only the markup comes back;
 * decoding and rasterising stay with the raster export. Started by
 * `createSvgRenderWorker`.
 */
import { renderDesignSvg } from "@musterli/exporters";
import {
  createRenderContext,
  registry,
  type Params,
  type ParamsSchema,
} from "@musterli/tool-registry";
import type { SvgRenderRequest, SvgRenderResponse } from "./svg-render-protocol";

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<SvgRenderRequest>) => void) | null;
  postMessage(message: SvgRenderResponse): void;
};

scope.onmessage = (event) => {
  const { id, toolId, params, seed, size } = event.data;
  const tool = registry.get(toolId);
  if (!tool) {
    scope.postMessage({ id, ok: false });
    return;
  }
  try {
    const svg = renderDesignSvg(
      tool,
      params as Params<ParamsSchema>,
      createRenderContext(seed, size),
    );
    scope.postMessage({ id, ok: true, svg });
  } catch {
    // The caller renders on the main thread again and gets the real error there.
    scope.postMessage({ id, ok: false });
  }
};
