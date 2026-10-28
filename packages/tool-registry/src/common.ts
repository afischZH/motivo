/**
 * Shared schema building blocks for tool params and design state.
 *
 * Tool params extend `visualParamsShape` (background + palette). Canvas size
 * and seed are deliberately not part of the params: they are stored as
 * separate design columns and reach the renderer via `RenderContext`.
 */
// Namespace import on purpose: `import { z }` defeats tree shaking and pulls in
// all zod locales (about 92 KB gzip instead of about 27 KB).
import * as z from "zod";
import type { CanvasSize, ControlKind } from "./types";

/**
 * Maps shared schemas to the control kind the editor should use, so tools do
 * not have to repeat `kind: "color"` for every colour param. Lookups are by
 * schema identity: wrapping a schema (`.optional()`, `.default()`) creates a
 * new instance that is not registered, use `ControlHints` there.
 */
export const controlKindRegistry = z.registry<{ kind: ControlKind }>();

/** `#rgb` or `#rrggbb`, case-insensitive. No alpha: SVG editors handle it poorly. */
export const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}){1,2}$/;

export const colorSchema = z
  .string()
  .regex(HEX_COLOR_PATTERN, { message: "Expected a hex colour like #1e90ff" })
  .register(controlKindRegistry, { kind: "color" });

export const PALETTE_MIN = 2;
export const PALETTE_MAX = 10;

export const paletteSchema = z
  .array(colorSchema)
  .min(PALETTE_MIN)
  .max(PALETTE_MAX)
  .register(controlKindRegistry, { kind: "palette" });

export const TRANSPARENT = "transparent";

/** A solid colour or `"transparent"`. */
export const backgroundSchema = z
  .union([z.literal(TRANSPARENT), colorSchema])
  .register(controlKindRegistry, { kind: "background" });

/**
 * A user's own image (upload) held in a param of `kind: "image"`. Lives
 * only on the device (`ToolDefinition.localParams`), never in share links.
 *
 * - `svg`: the output of `@musterli/svg-sanitizer` (cropped already); tools
 *   must sanitise it again before use through `svgAssetFor` (svg-asset.ts:
 *   prepared in the editor's worker, a cache hit on render) and embed it
 *   only as an image, never as markup;
 * - `raster`: the cropped, downsampled picture as a PNG or JPEG data URI.
 *
 * `width`/`height` are the size of the (cropped) image in its own units.
 */
export const IMAGE_ASSET_MAX_SVG_LENGTH = 1_048_576;
/** About 4.5 MB of image data: a 1024 px PNG with alpha fits comfortably. */
export const IMAGE_ASSET_MAX_RASTER_LENGTH = 6_000_000;
/** Longest edge of a raster upload after downsampling. */
export const IMAGE_ASSET_RASTER_MAX_EDGE = 1024;

const assetDimension = z.number().positive().max(1_000_000);
const assetName = z.string().max(200);

/** Data URI of a re-encoded raster upload (PNG or JPEG, padded base64). */
export const RASTER_HREF_PATTERN = /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;

/**
 * Schema of an upload with its own raster limits (longest edge, data URI
 * length). Register the result with `controlKindRegistry` as `kind: "image"`.
 */
export function imageAssetSchemaWith(limits: { maxEdge: number; maxRasterLength: number }) {
  return z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("svg"),
      svg: z.string().min(1).max(IMAGE_ASSET_MAX_SVG_LENGTH),
      width: assetDimension,
      height: assetDimension,
      name: assetName,
    }),
    z.object({
      kind: z.literal("raster"),
      href: z.string().max(limits.maxRasterLength).regex(RASTER_HREF_PATTERN),
      width: z.int().min(1).max(limits.maxEdge),
      height: z.int().min(1).max(limits.maxEdge),
      name: assetName,
    }),
  ]);
}

export const imageAssetSchema = imageAssetSchemaWith({
  maxEdge: IMAGE_ASSET_RASTER_MAX_EDGE,
  maxRasterLength: IMAGE_ASSET_MAX_RASTER_LENGTH,
}).register(controlKindRegistry, { kind: "image" });

/** Longest edge of a background picture (`photoAssetSchema`). */
export const PHOTO_ASSET_RASTER_MAX_EDGE = 2048;
/** About 6.7 MB of JPEG: plenty for a 2048 px photo at quality 0.9. */
export const PHOTO_ASSET_MAX_RASTER_LENGTH = 9_000_000;

/**
 * A background picture (stage of Glass Effects, Bento backgrounds): up to
 * 2048 px, uploaded with `ImageHint` `{ maxEdge: 2048, photo: true }` so
 * rasters arrive as JPEG. Same shape as `ImageAsset`.
 */
export const photoAssetSchema = imageAssetSchemaWith({
  maxEdge: PHOTO_ASSET_RASTER_MAX_EDGE,
  maxRasterLength: PHOTO_ASSET_MAX_RASTER_LENGTH,
}).register(controlKindRegistry, { kind: "image" });

/** Placeholder file name of an upload in code exports (`your-image.jpg`, `.png`, `.svg`). */
export function assetPlaceholderName(base: string, asset: { kind: string; href?: string }): string {
  const ext =
    asset.kind === "svg" ? "svg" : asset.href?.startsWith("data:image/png") ? "png" : "jpg";
  return `${base}.${ext}`;
}

export type ImageAsset = z.output<typeof imageAssetSchema>;

/** Smallest and largest canvas edge in CSS pixels (8K is 7680). */
export const CANVAS_EDGE_MIN = 16;
export const CANVAS_EDGE_MAX = 8192;

export const canvasEdgeSchema = z.int().min(CANVAS_EDGE_MIN).max(CANVAS_EDGE_MAX);

export const canvasSizeSchema = z.object({
  width: canvasEdgeSchema,
  height: canvasEdgeSchema,
});

export const DEFAULT_CANVAS_SIZE: Readonly<CanvasSize> = { width: 1080, height: 1080 };

/** Unsigned 32-bit integer seed. */
export const seedSchema = z.uint32();

/** Params every visual tool shares. Spread into `z.object({ ...visualParamsShape, ... })`. */
export const visualParamsShape = {
  background: backgroundSchema,
  palette: paletteSchema,
} as const;

/** Base object schema for visual tools; extend with `.extend({ ... })`. */
export const visualParamsSchema = z.object(visualParamsShape);

/** Size-picker groups from docs/TOOLS.md (Social, Desktop, Mobile, A4). */
export type SizePresetGroup = "social" | "desktop" | "mobile" | "print";

export interface SizePreset extends CanvasSize {
  id: string;
  group: SizePresetGroup;
  /** i18n key of the display name. */
  nameKey: string;
}

function size(id: string, group: SizePresetGroup, width: number, height: number): SizePreset {
  return { id, group, width, height, nameKey: `sizes.${id}` };
}

/** Common output sizes. Values are public platform/paper dimensions (A4 at 300 dpi). */
export const SIZE_PRESETS: readonly SizePreset[] = [
  size("square", "social", 1080, 1080),
  size("portrait", "social", 1080, 1350),
  size("story", "social", 1080, 1920),
  size("landscape", "social", 1200, 630),
  size("banner", "social", 1500, 500),
  size("full-hd", "desktop", 1920, 1080),
  size("qhd", "desktop", 2560, 1440),
  size("uhd-4k", "desktop", 3840, 2160),
  size("phone", "mobile", 1170, 2532),
  size("tablet", "mobile", 2048, 2732),
  size("a4-portrait", "print", 2480, 3508),
  size("a4-landscape", "print", 3508, 2480),
];
