/**
 * Shapes of the brand kit (M3-AP05) as stored in IndexedDB and in brand kit
 * files. Validated on every read and write like the designs: browser storage
 * can be edited by hand, and a broken record must never break a page.
 *
 * Assets hold exactly what an upload param (`kind: "image"`, see
 * `imageAssetSchema` in `@musterli/tool-registry`) holds: sanitised SVG markup
 * or a re-encoded PNG/JPEG data URI of at most 1024 px. The limits mirror
 * the tool registry's (a test in `@musterli/editor-ui` keeps them equal); the
 * storage package stays free of the tools.
 */
// Namespace import keeps zod tree-shakable (see tool-registry/common.ts).
import * as z from "zod";
import { DESIGN_ID_PATTERN, timestampSchema } from "./schema";

/** Colours per palette, like the palette control of the tools. */
export const BRAND_PALETTE_MIN = 2;
export const BRAND_PALETTE_MAX = 10;
/** Longest palette or asset name in characters. */
export const BRAND_NAME_MAX = 80;
/** Most palettes in one browser. */
export const BRAND_PALETTES_MAX = 100;
/** Most logos in one browser. */
export const BRAND_LOGOS_MAX = 50;
/** Most own shapes in one browser. */
export const BRAND_SHAPES_MAX = 200;
/** Sanitised SVG markup, in characters (`IMAGE_ASSET_MAX_SVG_LENGTH`). */
export const BRAND_SVG_MAX_LENGTH = 1_048_576;
/** Raster data URI, in characters (`IMAGE_ASSET_MAX_RASTER_LENGTH`). */
export const BRAND_RASTER_MAX_LENGTH = 6_000_000;
/** Longest raster edge after re-encoding (`IMAGE_ASSET_RASTER_MAX_EDGE`). */
export const BRAND_RASTER_MAX_EDGE = 1024;

/** Brand colours are stored as lower-case `#rrggbb`. */
export const BRAND_HEX_PATTERN = /^#[0-9a-f]{6}$/;

export const BRAND_ASSET_KINDS = ["logo", "shape"] as const;
export type BrandAssetKind = (typeof BRAND_ASSET_KINDS)[number];

export const brandIdSchema = z.string().regex(DESIGN_ID_PATTERN);
export const brandNameSchema = z.string().max(BRAND_NAME_MAX);
export const brandHexSchema = z.string().regex(BRAND_HEX_PATTERN);

export const brandPaletteSchema = z.object({
  id: brandIdSchema,
  name: brandNameSchema,
  colors: z.array(brandHexSchema).min(BRAND_PALETTE_MIN).max(BRAND_PALETTE_MAX),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

const dimension = z.number().positive().max(1_000_000);

export const brandSvgAssetSchema = z.object({
  kind: z.literal("svg"),
  svg: z.string().min(1).max(BRAND_SVG_MAX_LENGTH),
  width: dimension,
  height: dimension,
  name: z.string().max(200),
});

export const brandRasterAssetSchema = z.object({
  kind: z.literal("raster"),
  href: z
    .string()
    .max(BRAND_RASTER_MAX_LENGTH)
    .regex(/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/),
  width: z.int().min(1).max(BRAND_RASTER_MAX_EDGE),
  height: z.int().min(1).max(BRAND_RASTER_MAX_EDGE),
  name: z.string().max(200),
});

export const brandImageSchema = z.discriminatedUnion("kind", [
  brandSvgAssetSchema,
  brandRasterAssetSchema,
]);

/** A logo (SVG or raster) or an own shape (SVG only, recoloured by the tools). */
export const brandAssetSchema = z
  .object({
    id: brandIdSchema,
    kind: z.enum(BRAND_ASSET_KINDS),
    name: brandNameSchema,
    image: brandImageSchema,
    createdAt: timestampSchema,
  })
  .refine((a) => a.kind === "logo" || a.image.kind === "svg", {
    message: "Shapes must be SVG",
    path: ["image"],
  });

export type BrandPalette = z.output<typeof brandPaletteSchema>;
export type BrandImage = z.output<typeof brandImageSchema>;
export type BrandAsset = z.output<typeof brandAssetSchema>;

/** Most entries of a kind. */
export function brandAssetLimit(kind: BrandAssetKind): number {
  return kind === "logo" ? BRAND_LOGOS_MAX : BRAND_SHAPES_MAX;
}

/** Trimmed, at most `BRAND_NAME_MAX` characters, without control characters. */
export function normalizeBrandName(name: string): string {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is removed
  const clean = name.replace(/[\u0000-\u001f\u007f]/g, " ");
  return clean.trim().slice(0, BRAND_NAME_MAX).trim();
}

/** `#abc`/`#AABBCC` to `#aabbcc`; `null` for anything that is not a hex colour. */
export function normalizeBrandHex(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return null;
}
