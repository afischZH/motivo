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

/** Longest edge of a screenshot (`screenshotAssetSchema`): 4K UHD width. */
export const SCREENSHOT_ASSET_RASTER_MAX_EDGE = 3840;
/**
 * About 18 MB of PNG: a 4K screenshot re-encoded by the browser stays well
 * below (uploads are at most 5 MB; re-encoding can grow them a little).
 */
export const SCREENSHOT_ASSET_MAX_RASTER_LENGTH = 24_000_000;

/**
 * A screenshot (Screenshot Beautifier): up to 3840 px and kept as PNG
 * (`ImageHint` `{ maxEdge: 3840 }`, no `photo`), so text stays sharp. Same
 * shape as `ImageAsset`.
 */
export const screenshotAssetSchema = imageAssetSchemaWith({
  maxEdge: SCREENSHOT_ASSET_RASTER_MAX_EDGE,
  maxRasterLength: SCREENSHOT_ASSET_MAX_RASTER_LENGTH,
}).register(controlKindRegistry, { kind: "image" });

/** Longest edge of a photo for the photo effects (`effectPhotoAssetSchema`): 12 MP fit. */
export const EFFECT_PHOTO_RASTER_MAX_EDGE = 4096;
/** About 18 MB of JPEG: a 4096 px photo at quality 0.9 stays well below. */
export const EFFECT_PHOTO_MAX_RASTER_LENGTH = 24_000_000;

/**
 * A photo for the photo effects (Duotone, ASCII art; later halftone and
 * dither): raster only, up to 4096 px (a 12 MP camera picture keeps its full
 * resolution), uploaded with `ImageHint` `{ photo: true, rasterOnly: true }`
 * so it arrives as JPEG. Same shape as a raster `ImageAsset`.
 */
export const effectPhotoAssetSchema = z
  .object({
    kind: z.literal("raster"),
    href: z.string().max(EFFECT_PHOTO_MAX_RASTER_LENGTH).regex(RASTER_HREF_PATTERN),
    width: z.int().min(1).max(EFFECT_PHOTO_RASTER_MAX_EDGE),
    height: z.int().min(1).max(EFFECT_PHOTO_RASTER_MAX_EDGE),
    name: assetName,
  })
  .register(controlKindRegistry, { kind: "image" });

export type EffectPhotoAsset = z.output<typeof effectPhotoAssetSchema>;

/** Largest raster edge any upload schema accepts (checks of imported designs). */
export const UPLOAD_RASTER_MAX_EDGE = Math.max(
  IMAGE_ASSET_RASTER_MAX_EDGE,
  PHOTO_ASSET_RASTER_MAX_EDGE,
  SCREENSHOT_ASSET_RASTER_MAX_EDGE,
  EFFECT_PHOTO_RASTER_MAX_EDGE,
);

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

/**
 * Size-picker groups in display order (docs/TOOLS.md "Grössen"). Group ids are
 * UI only; preset ids stay stable when a preset moves to another group.
 */
export const SIZE_PRESET_GROUPS = [
  "social",
  "desktop",
  "mobile",
  "tablet",
  "print",
  "ratio",
] as const;

export type SizePresetGroup = (typeof SIZE_PRESET_GROUPS)[number];

export interface SizePreset extends CanvasSize {
  /** Stable id: saved state, links and tests may refer to it. */
  id: string;
  group: SizePresetGroup;
  /** i18n key of the display name. */
  nameKey: string;
}

function size(id: string, group: SizePresetGroup, width: number, height: number): SizePreset {
  return { id, group, width, height, nameKey: `sizes.${id}` };
}

/**
 * Common output sizes, all within `CANVAS_EDGE_MAX`. The same size may appear
 * in two groups (e.g. YouTube thumbnail and 4K UHD); the picker remembers
 * which one was chosen.
 *
 * Sources (checked 2026-10-28):
 * - Instagram 1:1, 4:5, 3:4 and 9:16: help.instagram.com/1631821640426723
 *   (up to 1080 px wide); 3:4 grid format: gauravtiwari.org/instagram-post-size
 * - Open Graph 1200 x 630: Meta sharing best practices for webmasters
 * - Facebook cover: 851 x 315 recommended upload, offered at 2x (1702 x 630)
 *   for sharp display on high-density screens (contentstudio.io guide)
 * - X header 1500 x 500: help.x.com (common issues when uploading profile
 *   photo); X post 16:9 1600 x 900: skedsocial.com (no official figure)
 * - LinkedIn background 1584 x 396, post 1200 x 627: skedsocial.com
 *   LinkedIn size guide
 * - YouTube thumbnail 3840 x 2160: support.google.com/youtube/answer/72431;
 *   channel banner 2560 x 1440: developers.google.com/youtube/v3/docs/channelBanners/insert
 * - Pinterest 2:3 1000 x 1500: tailwindapp.com (Pinterest best practices)
 * - TikTok, Reels, Shorts 9:16 1080 x 1920: platform creative specs
 * - MacBook Air 13/15 (M5), MacBook Pro 14/16, iMac 24 (M6): apple.com/<model>/specs
 * - iPhone 17, 17 Pro, 18 Pro, 17 Pro Max, 18 Pro Max, Air, Duo:
 *   apple.com/iphone-17/specs, /iphone-17-pro/specs, /iphone-18-pro/specs,
 *   /iphone-air/specs, /iphone-duo/specs; iPhone 17e/16e: Wikipedia list of
 *   iPhone models
 * - Pixel 11 Pro / Pro XL: store.google.com pixel_11_pro_specs
 * - Galaxy S26: androidheadlines.com specs; S26 Ultra: phonearena.com
 * - iPad Pro 11/13 (M5): apple.com/ipad-pro/specs; iPad Air 11/13 (M4):
 *   apple.com/ipad-air/specs; iPad (A16): Wikipedia iPad (11th generation);
 *   iPad mini 8.3 inch: Vodafone device specifications
 * - Paper: ISO 216 (A3 to A6) and US Letter 8.5 x 11 in at 300 dpi, rounded
 *   to whole pixels (mm / 25.4 * 300)
 * Phones and tablets are portrait (as held), screens landscape; the picker
 * swaps the orientation.
 */
export const SIZE_PRESETS: readonly SizePreset[] = [
  // Social media
  size("square", "social", 1080, 1080),
  size("portrait", "social", 1080, 1350),
  size("instagram-3-4", "social", 1080, 1440),
  size("story", "social", 1080, 1920),
  size("landscape", "social", 1200, 630),
  size("facebook-cover", "social", 1702, 630),
  size("banner", "social", 1500, 500),
  size("x-post", "social", 1600, 900),
  size("linkedin-banner", "social", 1584, 396),
  size("linkedin-post", "social", 1200, 627),
  size("youtube-thumbnail", "social", 3840, 2160),
  size("youtube-banner", "social", 2560, 1440),
  size("pinterest-pin", "social", 1000, 1500),
  // Screens and wallpapers
  size("hd", "desktop", 1280, 720),
  size("full-hd", "desktop", 1920, 1080),
  size("qhd", "desktop", 2560, 1440),
  size("uhd-4k", "desktop", 3840, 2160),
  size("5k", "desktop", 5120, 2880),
  size("8k", "desktop", 7680, 4320),
  size("ultrawide-fhd", "desktop", 2560, 1080),
  size("ultrawide-qhd", "desktop", 3440, 1440),
  size("macbook-air-13", "desktop", 2560, 1664),
  size("macbook-air-15", "desktop", 2880, 1864),
  size("macbook-pro-14", "desktop", 3024, 1964),
  size("macbook-pro-16", "desktop", 3456, 2234),
  size("imac-24", "desktop", 4480, 2520),
  // Phones
  size("iphone-pro", "mobile", 1206, 2622),
  size("iphone-pro-max", "mobile", 1320, 2868),
  size("iphone-air", "mobile", 1260, 2736),
  size("phone", "mobile", 1170, 2532),
  size("iphone-duo", "mobile", 1878, 2670),
  size("pixel-pro", "mobile", 1280, 2856),
  size("pixel-pro-xl", "mobile", 1344, 2992),
  size("galaxy-s", "mobile", 1080, 2340),
  size("galaxy-s-ultra", "mobile", 1440, 3120),
  // Tablets
  size("ipad", "tablet", 1640, 2360),
  size("tablet", "tablet", 2048, 2732),
  size("ipad-pro-11", "tablet", 1668, 2420),
  size("ipad-pro-13", "tablet", 2064, 2752),
  size("ipad-mini", "tablet", 1488, 2266),
  // Print at 300 dpi
  size("a3-portrait", "print", 3508, 4961),
  size("a3-landscape", "print", 4961, 3508),
  size("a4-portrait", "print", 2480, 3508),
  size("a4-landscape", "print", 3508, 2480),
  size("a5-portrait", "print", 1748, 2480),
  size("a6-portrait", "print", 1240, 1748),
  size("letter-portrait", "print", 2550, 3300),
  size("letter-landscape", "print", 3300, 2550),
  // Aspect ratios (longer edge 2400 px; 21:9 needs 2520 for whole pixels)
  size("ratio-1-1", "ratio", 2400, 2400),
  size("ratio-4-5", "ratio", 1920, 2400),
  size("ratio-3-2", "ratio", 2400, 1600),
  size("ratio-2-3", "ratio", 1600, 2400),
  size("ratio-4-3", "ratio", 2400, 1800),
  size("ratio-16-9", "ratio", 2400, 1350),
  size("ratio-9-16", "ratio", 1350, 2400),
  size("ratio-21-9", "ratio", 2520, 1080),
];
