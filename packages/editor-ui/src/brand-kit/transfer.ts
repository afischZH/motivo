/**
 * Import of brand kit files (`motivo-brandkit` version 1, see
 * transfer-format.ts). Pure and DOM-free, so it runs in a worker
 * (transfer.worker.ts) and in Node tests.
 *
 * Every file is treated as hostile, with the same rigour as designs files:
 *  - size limit before parsing, entry count limits;
 *  - keys that could pollute prototypes (`__proto__`, `constructor`,
 *    `prototype`) reject the whole file;
 *  - every palette and asset is checked against the storage schema
 *    (colours normalised to `#rrggbb` first);
 *  - SVG images are sanitised again with `@musterli/svg-sanitizer` and
 *    replaced by its output; own shapes must stay SVG;
 *  - raster images must be the PNG or JPEG their data URI claims (magic
 *    bytes), within 1024 px per edge (header dimensions).
 * Entries that fail are skipped with a reason; the rest is imported.
 */
import {
  BRAND_LOGOS_MAX,
  BRAND_PALETTES_MAX,
  BRAND_SHAPES_MAX,
  BRAND_SVG_MAX_LENGTH,
  brandAssetSchema,
  brandPaletteSchema,
  normalizeBrandHex,
  type BrandAsset,
  type BrandPalette,
} from "@musterli/storage";
import { sanitizeSvg } from "@musterli/svg-sanitizer";
import * as z from "zod";
import { DESIGNS_FILE_FORMAT, isSafeRasterHref } from "../designs/transfer";
import { ForbiddenKeyError, fileFormatOf, parseUntrustedJson, utf8Length } from "../transfer/json";
import {
  BRAND_KIT_FILE_FORMAT,
  BRAND_KIT_FILE_MAX_BYTES,
  BRAND_KIT_FILE_VERSION,
  type BrandKitFileParseResult,
  type BrandSkipReason,
  type SkippedBrandEntry,
} from "./transfer-format";

export * from "./transfer-format";

const headerSchema = z.object({
  format: z.string(),
  version: z.int(),
  defaultPaletteId: z.string().max(64).nullable().optional(),
  palettes: z.array(z.unknown()).max(BRAND_PALETTES_MAX),
  assets: z.array(z.unknown()).max(BRAND_LOGOS_MAX + BRAND_SHAPES_MAX),
});

function readName(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const name = (value as { name?: unknown }).name;
  return typeof name === "string" ? name.slice(0, 80) : undefined;
}

function skip(
  type: SkippedBrandEntry["type"],
  index: number,
  value: unknown,
  reason: BrandSkipReason,
): SkippedBrandEntry {
  const name = readName(value);
  return name === undefined ? { type, index, reason } : { type, index, name, reason };
}

/** Normalises colours (`#ABC` to `#aabbcc`) before the strict schema check. */
function readPalette(value: unknown): BrandPalette | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const colors = (value as { colors?: unknown }).colors;
  const normalized = Array.isArray(colors)
    ? colors.map((c) => (typeof c === "string" ? (normalizeBrandHex(c) ?? c) : c))
    : colors;
  const parsed = brandPaletteSchema.safeParse({ ...value, colors: normalized });
  return parsed.success ? parsed.data : null;
}

/**
 * Re-checks an asset's image: SVG sanitised again (output replaces the
 * input), raster checked by magic bytes and size. `null` when unsafe.
 */
export function resanitizeBrandAsset(
  asset: BrandAsset,
): { asset: BrandAsset; removed: number } | null {
  const image = asset.image;
  if (image.kind === "raster") {
    if (asset.kind !== "logo" || !isSafeRasterHref(image.href)) return null;
    return { asset, removed: 0 };
  }
  const clean = sanitizeSvg(image.svg, { maxLength: BRAND_SVG_MAX_LENGTH });
  if (!clean.ok || clean.svg.length > BRAND_SVG_MAX_LENGTH) return null;
  const next: BrandAsset = { ...asset, image: { ...image, svg: clean.svg } };
  // The cleaned image must still satisfy the schema.
  const parsed = brandAssetSchema.safeParse(next);
  return parsed.success ? { asset: parsed.data, removed: clean.removed } : null;
}

/** Parses and validates a brand kit file. Never throws. */
export function parseBrandKitFile(text: string): BrandKitFileParseResult {
  if (typeof text !== "string") return { ok: false, error: "malformed" };
  if (text.length > BRAND_KIT_FILE_MAX_BYTES || utf8Length(text) > BRAND_KIT_FILE_MAX_BYTES) {
    return { ok: false, error: "too-large" };
  }
  if (text.trim() === "") return { ok: false, error: "empty" };
  let json: unknown;
  try {
    json = parseUntrustedJson(text);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof ForbiddenKeyError ? "forbidden-keys" : "malformed",
    };
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return { ok: false, error: "wrong-format" };
  }
  const format = fileFormatOf(json);
  if (format === DESIGNS_FILE_FORMAT) return { ok: false, error: "designs-file" };
  if (format !== BRAND_KIT_FILE_FORMAT) return { ok: false, error: "wrong-format" };
  const version = (json as { version?: unknown }).version;
  if (version !== BRAND_KIT_FILE_VERSION) {
    return {
      ok: false,
      error: typeof version === "number" ? "unsupported-version" : "wrong-format",
    };
  }
  const header = headerSchema.safeParse(json);
  if (!header.success) {
    // Only the lists count as "too many"; an oversized default id is just malformed.
    const tooMany = header.error.issues.some(
      (i) => i.code === "too_big" && (i.path[0] === "palettes" || i.path[0] === "assets"),
    );
    return { ok: false, error: tooMany ? "too-many" : "wrong-format" };
  }

  const skipped: SkippedBrandEntry[] = [];
  const palettes: BrandPalette[] = [];
  header.data.palettes.forEach((value, index) => {
    const palette = readPalette(value);
    if (palette) palettes.push(palette);
    else skipped.push(skip("palette", index, value, "invalid"));
  });

  const assets: BrandAsset[] = [];
  let removed = 0;
  header.data.assets.forEach((value, index) => {
    const parsed = brandAssetSchema.safeParse(value);
    if (!parsed.success) {
      skipped.push(skip("asset", index, value, "invalid"));
      return;
    }
    const clean = resanitizeBrandAsset(parsed.data);
    if (!clean) {
      skipped.push(skip("asset", index, value, "unsafe-image"));
      return;
    }
    removed += clean.removed;
    assets.push(clean.asset);
  });

  const defaultId = header.data.defaultPaletteId ?? null;
  return {
    ok: true,
    palettes,
    assets,
    defaultId: palettes.some((p) => p.id === defaultId) ? defaultId : null,
    skipped,
    removed,
  };
}
