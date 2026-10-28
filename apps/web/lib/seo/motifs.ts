/**
 * Static motifs for SEO pages, catalogue cards and OG images. Everything is
 * rendered through the tool's single render function with the
 * tool's default size, so a preset thumbnail looks exactly like the preset
 * in the editor. Server only: pages and route handlers call it at build time.
 */
import { designToHash } from "@musterli/editor-ui/share";
import {
  DEFAULT_CANVAS_SIZE,
  createRenderContext,
  registry,
  type AnyToolDefinition,
  type CanvasSize,
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

/** Whether every static motif of the tool can be rendered on the server. */
export function hasStaticMotif(tool: AnyToolDefinition): boolean {
  return tool.render.kind === "svg" || tool.render.kind === "css";
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
