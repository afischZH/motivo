/**
 * The brand kit file format (`motivo-brandkit` version 1) without the
 * import validation, so the page can export without loading the sanitizer.
 * See transfer.ts for the import rules.
 *
 *   {
 *     "format": "motivo-brandkit",
 *     "version": 1,
 *     "exportedAt": 1793000000000,
 *     "defaultPaletteId": "…" | null,
 *     "palettes": [{ id, name, colors: ["#rrggbb", …], createdAt, updatedAt }],
 *     "assets": [{ id, kind: "logo" | "shape", name, createdAt,
 *                  image: { kind: "svg", svg, width, height, name }
 *                       | { kind: "raster", href: "data:image/png;base64,…", width, height, name } }]
 *   }
 *
 * A file of its own (not part of the designs file): a brand kit is often
 * passed on to someone else without one's designs, and the designs format
 * stays as it is.
 */
import type { BrandAsset, BrandKitSnapshot, BrandPalette } from "@musterli/storage";
import { packIntoFiles, partFileName, stringifyEach } from "../transfer/json";

export const BRAND_KIT_FILE_FORMAT = "motivo-brandkit";
export const BRAND_KIT_FILE_VERSION = 1;
/** Largest accepted file (bytes): 50 raster logos of about 400 KB plus shapes. */
export const BRAND_KIT_FILE_MAX_BYTES = 30 * 1024 * 1024;

export type BrandKitFileError =
  | "too-large"
  | "empty"
  | "malformed"
  | "forbidden-keys"
  | "wrong-format"
  | "unsupported-version"
  | "too-many"
  /** A designs file (`motivo-designs`): it belongs on "Meine Designs". */
  | "designs-file";

export type BrandSkipReason = "invalid" | "unsafe-image";

export interface SkippedBrandEntry {
  type: "palette" | "asset";
  /** Position in its list, from 0. */
  index: number;
  name?: string;
  reason: BrandSkipReason;
}

export type BrandKitFileParseResult =
  | {
      ok: true;
      palettes: BrandPalette[];
      assets: BrandAsset[];
      defaultId: string | null;
      skipped: SkippedBrandEntry[];
      /** Unsafe parts the sanitizer removed from SVG images, summed. */
      removed: number;
    }
  | { ok: false; error: BrandKitFileError };

export interface BrandKitFile {
  format: typeof BRAND_KIT_FILE_FORMAT;
  version: typeof BRAND_KIT_FILE_VERSION;
  exportedAt: number;
  defaultPaletteId: string | null;
  palettes: BrandPalette[];
  assets: BrandAsset[];
}

/** The export file for a brand kit. */
export function buildBrandKitFile(kit: BrandKitSnapshot, exportedAt: number): BrandKitFile {
  return {
    format: BRAND_KIT_FILE_FORMAT,
    version: BRAND_KIT_FILE_VERSION,
    exportedAt,
    defaultPaletteId: kit.defaultId,
    palettes: kit.palettes.map((p) => ({
      id: p.id,
      name: p.name,
      colors: [...p.colors],
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
    assets: kit.assets.map((a) => ({
      id: a.id,
      kind: a.kind,
      name: a.name,
      image: { ...a.image },
      createdAt: a.createdAt,
    })),
  };
}

/**
 * The export as file texts, each at most `maxBytes` so that it can be
 * imported again. Palettes and the default mark go into the first file;
 * logos and shapes fill as many files as they need. Serialises in slices
 * so the page stays responsive.
 */
export async function brandKitFileTexts(
  kit: BrandKitSnapshot,
  exportedAt: number,
  maxBytes: number = BRAND_KIT_FILE_MAX_BYTES,
): Promise<string[]> {
  const { assets, ...first } = buildBrandKitFile(kit, exportedAt);
  const rest = { ...first, defaultPaletteId: null, palettes: [] };
  const head = (envelope: object) => `${JSON.stringify(envelope).slice(0, -1)},"assets":[`;
  const heads = [head(first), head(rest)] as const;
  return packIntoFiles(
    await stringifyEach(assets),
    (part, body) => `${part === 0 ? heads[0] : heads[1]}${body}]}`,
    maxBytes,
  );
}

/** `musterli-brandkit-v1-2026-10-28.json` (local date); several files get `-1`, `-2`. */
export function brandKitFileName(date: Date, part = 0, parts = 1): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return partFileName(`musterli-brandkit-v${BRAND_KIT_FILE_VERSION}-${day}`, part, parts);
}
