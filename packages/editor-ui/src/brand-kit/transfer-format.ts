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
 *                       | { kind: "raster", href: "data:image/png;base64,…", width, height, name } }],
 *     "fonts": [{ id, name, format: "woff2" | "woff" | "ttf" | "otf", data: "<base64>", createdAt }]
 *   }
 *
 * `fonts` (M6-AP03) is optional: files from before have none, and the
 * version stays 1 because older readers simply ignore the list (their
 * palettes and logos still import). Each font is at most 2 MB.
 *
 * A file of its own (not part of the designs file): a brand kit is often
 * passed on to someone else without one's designs, and the designs format
 * stays as it is.
 */
import type {
  BrandAsset,
  BrandFont,
  BrandFontFormat,
  BrandKitSnapshot,
  BrandPalette,
} from "@musterli/storage";
import { bytesToBase64 } from "../transfer/base64";
import { partFileName, stringifyEach, utf8Length } from "../transfer/json";

export const BRAND_KIT_FILE_FORMAT = "motivo-brandkit";
export const BRAND_KIT_FILE_VERSION = 1;
/**
 * Largest accepted file (bytes): 50 raster logos of about 400 KB plus
 * shapes, or ten fonts of 2 MB (base64); larger kits are split on export.
 */
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

export type BrandSkipReason = "invalid" | "unsafe-image" | "unsafe-font";

export interface SkippedBrandEntry {
  type: "palette" | "asset" | "font";
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
      fonts: BrandFont[];
      defaultId: string | null;
      skipped: SkippedBrandEntry[];
      /** Unsafe parts the sanitizer removed from SVG images, summed. */
      removed: number;
    }
  | { ok: false; error: BrandKitFileError };

/** A font in the file: the bytes as base64. */
export interface BrandKitFileFont {
  id: string;
  name: string;
  format: BrandFontFormat;
  data: string;
  createdAt: number;
}

export interface BrandKitFile {
  format: typeof BRAND_KIT_FILE_FORMAT;
  version: typeof BRAND_KIT_FILE_VERSION;
  exportedAt: number;
  defaultPaletteId: string | null;
  palettes: BrandPalette[];
  assets: BrandAsset[];
  fonts: BrandKitFileFont[];
}

function fileFont(font: BrandFont): BrandKitFileFont {
  return {
    id: font.id,
    name: font.name,
    format: font.format,
    data: bytesToBase64(new Uint8Array(font.data)),
    createdAt: font.createdAt,
  };
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
    fonts: (kit.fonts ?? []).map(fileFont),
  };
}

/**
 * The export as file texts, each at most `maxBytes` so that it can be
 * imported again. Palettes and the default mark go into the first file;
 * logos, shapes and fonts fill as many files as they need (in that order).
 * Serialises in slices so the page stays responsive.
 */
export async function brandKitFileTexts(
  kit: BrandKitSnapshot,
  exportedAt: number,
  maxBytes: number = BRAND_KIT_FILE_MAX_BYTES,
): Promise<string[]> {
  const { assets, fonts, ...first } = buildBrandKitFile(kit, exportedAt);
  const rest = { ...first, defaultPaletteId: null, palettes: [] };
  const head = (envelope: object) => `${JSON.stringify(envelope).slice(0, -1)},"assets":[`;
  const heads = [head(first), head(rest)] as const;
  const wrap = (part: number, a: readonly string[], f: readonly string[]) =>
    `${part === 0 ? heads[0] : heads[1]}${a.join(",")}],"fonts":[${f.join(",")}]}`;
  const items = [
    ...(await stringifyEach(assets)).map((json) => ({ font: false, json })),
    ...(await stringifyEach(fonts)).map((json) => ({ font: true, json })),
  ];
  const files: string[] = [];
  let a: string[] = [];
  let f: string[] = [];
  let size = utf8Length(wrap(0, [], []));
  for (const item of items) {
    const bytes = utf8Length(item.json) + 1;
    if (a.length + f.length > 0 && size + bytes > maxBytes) {
      files.push(wrap(files.length, a, f));
      a = [];
      f = [];
      size = utf8Length(wrap(files.length, [], []));
    }
    size += bytes;
    (item.font ? f : a).push(item.json);
  }
  files.push(wrap(files.length, a, f));
  return files;
}

/** `musterli-brandkit-v1-2026-10-28.json` (local date); several files get `-1`, `-2`. */
export function brandKitFileName(date: Date, part = 0, parts = 1): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return partFileName(`musterli-brandkit-v${BRAND_KIT_FILE_VERSION}-${day}`, part, parts);
}
