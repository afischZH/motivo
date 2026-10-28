/**
 * Static motifs for SEO pages, catalogue cards and OG images. Everything is
 * rendered through the tool's single render function with the
 * tool's default size, so a preset thumbnail looks exactly like the preset
 * in the editor. Server only: pages and route handlers call it at build time.
 */
import { designToHash } from "@musterli/editor-ui/share";
import { resizeCover } from "@musterli/effects";
import { toBase64 } from "@musterli/engine";
import { PngStreamEncoder } from "@musterli/exporters/png-stream";
import {
  DEFAULT_CANVAS_SIZE,
  createRenderContext,
  fitSize,
  isImageEffectTool,
  photoSampleSize,
  registry,
  renderImageEffect,
  type AnyToolDefinition,
  type CanvasSize,
  type PixelBuffer,
} from "@musterli/tool-registry";

/** Seed of every static motif, as in the editor's first render. */
export const STATIC_SEED = 1;

/** File name (without `.svg`) of the motif rendered from the tool's defaults. */
export const DEFAULT_MOTIF = "default";

/** How many preset thumbnails a landing page shows. */
export const LANDING_PRESET_COUNT = 4;

export interface StaticDesign {
  /** `DEFAULT_MOTIF` or a preset id. */
  id: string;
  /** i18n key of the preset name; undefined for the defaults. */
  nameKey?: string;
  params: Readonly<Record<string, unknown>>;
  seed: number;
}

export function toolSize(tool: AnyToolDefinition): CanvasSize {
  return tool.defaultSize ?? DEFAULT_CANVAS_SIZE;
}

/** The defaults plus every preset, each with the seed it is designed for. */
export function staticDesigns(tool: AnyToolDefinition): StaticDesign[] {
  return [
    { id: DEFAULT_MOTIF, params: tool.defaults, seed: STATIC_SEED },
    ...tool.presets.map((p) => ({
      id: p.id,
      nameKey: p.nameKey,
      params: p.params,
      seed: p.seed ?? STATIC_SEED,
    })),
  ];
}

export function findDesign(tool: AnyToolDefinition, id: string): StaticDesign | undefined {
  return staticDesigns(tool).find((d) => d.id === id);
}

/**
 * The design as one standalone SVG document: SVG tools return it directly,
 * CSS tools provide their SVG equivalent. Undefined for render kinds that
 * cannot be rendered on the server (canvas, WebGL, image effects).
 */
export function designSvg(tool: AnyToolDefinition, design: StaticDesign): string | undefined {
  const ctx = createRenderContext(design.seed, toolSize(tool));
  // Static designs come from the tool itself (defaults, presets), which pass its schema.
  const params = design.params as Parameters<typeof tool.randomize>[1];
  const renderer = tool.render;
  if (renderer.kind === "svg") return renderer.render(params, ctx);
  if (renderer.kind === "css") return renderer.render(params, ctx).previewSvg;
  return undefined;
}

/**
 * Longest edge of the picture inside an image-effect motif: sharp enough
 * for cards and OG images, about 150 to 300 KB per motif.
 */
export const EFFECT_MOTIF_EDGE = 480;

/**
 * The tool's sample picture scaled to `out`, per tool, version and size.
 * Generating the sample (about 0.2 s for 1500 × 1000 px) dominated the
 * build of every preset's motif; the pixels are the same as the ones
 * `renderImageEffect` would generate itself.
 */
const effectSources = new Map<string, PixelBuffer>();

function effectSource(tool: AnyToolDefinition, design: CanvasSize, out: CanvasSize): PixelBuffer {
  const key = `${tool.id}@${tool.version}:${design.width}x${design.height}:${out.width}x${out.height}`;
  let source = effectSources.get(key);
  if (source === undefined && tool.photoSource) {
    const s = photoSampleSize(design);
    const sample = tool.photoSource.sample(s.width, s.height);
    source =
      sample.width === out.width && sample.height === out.height
        ? sample
        : resizeCover(sample, out.width, out.height);
    effectSources.set(key, source);
  }
  if (source === undefined) throw new TypeError(`Tool "${tool.id}" has no photo source`);
  return source;
}

/**
 * An image effect applied to the tool's sample picture (docs/ARCHITECTURE.md
 * 4.14), as an SVG that wraps one PNG of at most `EFFECT_MOTIF_EDGE` px.
 * Same `render` as the editor; the sample is scaled with `resizeCover`
 * instead of a canvas, so the pixels may differ slightly from the editor.
 */
export async function effectMotifSvg(
  tool: AnyToolDefinition,
  design: StaticDesign,
): Promise<string | undefined> {
  if (!isImageEffectTool(tool)) return undefined;
  const size = toolSize(tool);
  const out = fitSize(size, EFFECT_MOTIF_EDGE);
  const source = effectSource(tool, size, out);
  const pixels = renderImageEffect(tool, design.params, design.seed, size, out, source);
  const encoder = new PngStreamEncoder(out.width, out.height);
  await encoder.addRows(pixels.data, out.height);
  const parts = await encoder.finish();
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  const { width, height } = size;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<image width="${width}" height="${height}" preserveAspectRatio="none" href="data:image/png;base64,${toBase64(png)}"/></svg>`
  );
}

/** `designSvg`, plus image effects (async: their PNG is compressed with `CompressionStream`). */
export async function staticMotifSvg(
  tool: AnyToolDefinition,
  design: StaticDesign,
): Promise<string | undefined> {
  return designSvg(tool, design) ?? effectMotifSvg(tool, design);
}

/** Whether every static motif of the tool can be rendered on the server (`staticMotifSvg`). */
export function hasStaticMotif(tool: AnyToolDefinition): boolean {
  return tool.render.kind === "svg" || tool.render.kind === "css" || isImageEffectTool(tool);
}

/** Public path of a static motif SVG (see `app/motifs/[toolId]/[file]/route.ts`). */
export function motifPath(toolId: string, designId: string): string {
  return `/motifs/${toolId}/${designId}.svg`;
}

/** `#d=...` that opens the design in the editor (share-link format). */
export function designEditorHash(tool: AnyToolDefinition, design: StaticDesign): string {
  const result = designToHash(
    { toolId: tool.id, params: { ...design.params }, seed: design.seed, size: toolSize(tool) },
    registry,
  );
  return result.ok ? result.value : "";
}

/** Presets shown as thumbnails on the landing page. */
export function landingPresets(tool: AnyToolDefinition): StaticDesign[] {
  return staticDesigns(tool).slice(1, 1 + LANDING_PRESET_COUNT);
}
