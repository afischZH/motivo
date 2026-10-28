/**
 * Helpers around `WebglRenderer` (docs/ARCHITECTURE.md 4.15): the frame a
 * shader worker draws, and the CPU twin for Node (static motifs, tests).
 */
import { paletteTextureData } from "@musterli/shaders";
import { createRenderContext } from "./render";
import type {
  AnyToolDefinition,
  CanvasSize,
  PixelBuffer,
  UniformValue,
  WebglRenderer,
} from "./types";

/** Plain parameter object (type-erased). */
type Values = Readonly<Record<string, unknown>>;

export function isWebglTool(
  tool: AnyToolDefinition,
): tool is AnyToolDefinition & { render: WebglRenderer<Values> } {
  return tool.render.kind === "webgl";
}

/** Everything the GPU needs for one design (frame `t`), apart from size and tile. */
export interface WebglFrame {
  fragment: string;
  uniforms: Readonly<Record<string, UniformValue>>;
  palette: Uint8Array | null;
}

const paletteCache = new Map<string, Uint8Array>();
const PALETTE_CACHE = 16;

/** Palette texture of a colour list, cached (thumbnails share palettes). */
function paletteTexture(colors: readonly string[]): Uint8Array {
  const key = colors.join(",");
  const hit = paletteCache.get(key);
  if (hit) return hit;
  const data = paletteTextureData(colors);
  if (paletteCache.size >= PALETTE_CACHE) {
    const oldest = paletteCache.keys().next().value;
    if (oldest !== undefined) paletteCache.delete(oldest);
  }
  paletteCache.set(key, data);
  return data;
}

/**
 * Shader, uniforms and palette texture of a design at loop time `t`.
 * `params` must have passed the tool's schema. Throws for other tools.
 */
export function webglFrame(
  tool: AnyToolDefinition,
  params: Values,
  seed: number,
  design: CanvasSize,
  t?: number,
): WebglFrame {
  if (!isWebglTool(tool)) throw new TypeError(`Tool "${tool.id}" is not a WebGL tool`);
  const ctx = createRenderContext(seed, design, t);
  const renderer = tool.render;
  return {
    fragment: renderer.fragment,
    uniforms: renderer.uniforms(params, ctx),
    palette: renderer.palette ? paletteTexture(renderer.palette(params)) : null,
  };
}

/** Whether the tool can be rendered without WebGL (`WebglRenderer.reference`). */
export function hasWebglReference(tool: AnyToolDefinition): boolean {
  return isWebglTool(tool) && tool.render.reference !== undefined;
}

/**
 * The design rendered by the tool's CPU twin at `out` pixels (Node: static
 * motifs, contract tests). Throws for tools without one.
 */
export function renderWebglReference(
  tool: AnyToolDefinition,
  params: Values,
  seed: number,
  design: CanvasSize,
  out: CanvasSize,
  t?: number,
): PixelBuffer {
  if (!isWebglTool(tool) || !tool.render.reference) {
    throw new TypeError(`Tool "${tool.id}" has no CPU reference`);
  }
  const frame = webglFrame(tool, params, seed, design, t);
  return tool.render.reference({
    uniforms: frame.uniforms,
    palette: frame.palette,
    out: { width: out.width, height: out.height },
    design: { width: design.width, height: design.height },
  });
}

/**
 * Preview loop length in seconds for these params (`loopSeconds`), 0 for
 * still pictures and non-WebGL tools.
 */
export function webglLoopSeconds(tool: AnyToolDefinition, params: Values): number {
  if (!isWebglTool(tool) || !tool.render.loopSeconds) return 0;
  const s = tool.render.loopSeconds(params);
  return Number.isFinite(s) && s > 0 ? s : 0;
}
