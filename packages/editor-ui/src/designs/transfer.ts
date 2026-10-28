/**
 * Moving saved designs between browsers (M3-AP03): one versioned JSON file,
 * `motivo-designs` version 1. Pure and DOM-free, so the import runs in a
 * worker (transfer.worker.ts) and in Node tests.
 *
 * File format (UTF-8 JSON):
 *   {
 *     "format": "motivo-designs",
 *     "version": 1,
 *     "exportedAt": 1793000000000,
 *     "designs": [{ id, toolId, toolVersion, name, seed, size: { width, height },
 *                   params, createdAt, updatedAt }]
 *   }
 * Thumbnails are not exported: they follow from the design (same render
 * path) and are drawn again after the import. The brand kit travels in a
 * file of its own (`motivo-brandkit`, see brand-kit/transfer-format.ts).
 *
 * The import treats every file as hostile:
 *  - size limit before parsing, design count limit;
 *  - JSON keys that could pollute prototypes (`__proto__`, `constructor`,
 *    `prototype`) reject the whole file;
 *  - every design is checked against the envelope schema and then against
 *    its tool (`parseToolParams`: `migrateParams`, then the tool's Zod
 *    schema, which drops unknown keys);
 *  - uploaded SVGs (`kind: "image"` params) are sanitised again with
 *    `@musterli/svg-sanitizer` and replaced by the sanitizer's output; raster
 *    uploads must be PNG or JPEG by their magic bytes, matching the declared
 *    type, within the size limits.
 * Designs that fail are skipped with a reason; the rest is imported.
 */
import { sanitizeSvg } from "@musterli/svg-sanitizer";
import type { ImportedDesign } from "@musterli/storage";
import {
  designIdSchema,
  designNameSchema,
  paramsObjectSchema,
  seedValueSchema,
  sizeValueSchema,
  timestampSchema,
  toolIdSchema,
  toolVersionSchema,
} from "@musterli/storage";
import {
  IMAGE_ASSET_MAX_SVG_LENGTH,
  IMAGE_ASSET_RASTER_MAX_EDGE,
  PHOTO_ASSET_RASTER_MAX_EDGE,
  controlKindRegistry,
  parseToolParams,
  type AnyToolDefinition,
  type ToolRegistry,
} from "@musterli/tool-registry";
import * as z from "zod";
import { BRAND_KIT_FILE_FORMAT } from "../brand-kit/transfer-format";
import { imageDimensions } from "../image-input/dimensions";
import { sniffImageType } from "../image-input/sniff";
import { ForbiddenKeyError, fileFormatOf, parseUntrustedJson, utf8Length } from "../transfer/json";
import {
  DESIGNS_FILE_FORMAT,
  DESIGNS_FILE_MAX_BYTES,
  DESIGNS_FILE_MAX_DESIGNS,
  DESIGNS_FILE_VERSION,
  type DesignsFileParseResult,
  type SkipReason,
  type SkippedDesign,
} from "./transfer-format";

export * from "./transfer-format";

const headerSchema = z.object({
  format: z.string(),
  version: z.int(),
  designs: z.array(z.unknown()),
});

const entrySchema = z.object({
  id: designIdSchema,
  toolId: toolIdSchema,
  toolVersion: toolVersionSchema,
  name: designNameSchema,
  seed: seedValueSchema,
  size: sizeValueSchema,
  params: paramsObjectSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

/** Param keys of a tool that hold user files (`kind: "image"`). */
export function imageParamKeys(tool: AnyToolDefinition): string[] {
  const keys = new Set<string>(tool.localParams ?? []);
  for (const [key, schema] of Object.entries(tool.schema.shape)) {
    if (controlKindRegistry.get(schema as z.ZodType)?.kind === "image") keys.add(key);
  }
  return [...keys];
}

const RASTER_HREF = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/;
/** Base64 characters decoded to read a raster header (48 KB; a multiple of 4). */
const RASTER_HEAD_CHARS = 65_536;

function base64Head(data: string): Uint8Array | null {
  try {
    const binary = atob(data.length <= RASTER_HEAD_CHARS ? data : data.slice(0, RASTER_HEAD_CHARS));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Whether a raster upload really is the PNG or JPEG it claims, within the
 * size limit. The base64 must be padded (as every encoder writes it): a
 * length of 4n + 1 passes the character check but makes `atob` throw when
 * the image is turned back into a file (brand kit, upload fields).
 */
export function isSafeRasterHref(
  href: string,
  maxEdge: number = IMAGE_ASSET_RASTER_MAX_EDGE,
): boolean {
  const match = RASTER_HREF.exec(href);
  if (!match) return false;
  const declared = match[1];
  const data = match[2] ?? "";
  if (data.length % 4 !== 0) return false;
  const bytes = base64Head(data);
  if (!bytes) return false;
  const actual = sniffImageType(bytes);
  if (actual !== declared) return false;
  const dims = imageDimensions(bytes, actual);
  return dims !== null && dims.width <= maxEdge && dims.height <= maxEdge;
}

/**
 * Re-checks the user files inside validated params: SVGs are sanitised again
 * and replaced by the sanitizer's output, rasters checked by magic bytes.
 * Returns the cleaned params, or `null` when a file is unsafe.
 */
export function resanitizeUploads(
  tool: AnyToolDefinition,
  params: Record<string, unknown>,
): Record<string, unknown> | null {
  let out: Record<string, unknown> | null = null;
  for (const key of imageParamKeys(tool)) {
    const value = params[key];
    const clean = resanitizeValue(value, 0);
    if (clean === UNSAFE) return null;
    if (clean !== value) {
      out ??= { ...params };
      out[key] = clean;
    }
  }
  return out ?? params;
}

const UNSAFE = Symbol("unsafe");
/** Nesting of uploads inside local params (record of tile -> { graphic, background }). */
const MAX_ASSET_DEPTH = 3;

/**
 * One upload, or a plain object or array holding uploads (e.g. the per-tile
 * images of the Bento grid): every SVG sanitised again, every raster checked.
 * Returns the value itself when nothing changed, `UNSAFE` for a bad file.
 * Rasters may be up to the largest edge any upload schema allows (2048 px);
 * the tool schema has already checked the declared size per param.
 */
function resanitizeValue(value: unknown, depth: number): unknown {
  if (typeof value !== "object" || value === null) return value;
  const asset = value as { kind?: unknown; svg?: unknown; href?: unknown };
  if (asset.kind === "svg") {
    if (typeof asset.svg !== "string") return UNSAFE;
    const clean = sanitizeSvg(asset.svg, { maxLength: IMAGE_ASSET_MAX_SVG_LENGTH });
    if (!clean.ok || clean.svg.length > IMAGE_ASSET_MAX_SVG_LENGTH) return UNSAFE;
    return clean.svg === asset.svg ? value : { ...asset, svg: clean.svg };
  }
  if (asset.kind === "raster") {
    return typeof asset.href === "string" &&
      isSafeRasterHref(asset.href, PHOTO_ASSET_RASTER_MAX_EDGE)
      ? value
      : UNSAFE;
  }
  if (depth >= MAX_ASSET_DEPTH) return value;
  let out: Record<string, unknown> | unknown[] | null = null;
  const entries = Array.isArray(value) ? value.entries() : Object.entries(value);
  for (const [k, v] of entries) {
    const clean = resanitizeValue(v, depth + 1);
    if (clean === UNSAFE) return UNSAFE;
    if (clean !== v) {
      out ??= Array.isArray(value) ? [...value] : { ...(value as Record<string, unknown>) };
      (out as Record<string | number, unknown>)[k] = clean;
    }
  }
  return out ?? value;
}

function readName(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const name = (value as { name?: unknown }).name;
  return typeof name === "string" ? name.slice(0, 120) : undefined;
}

/** Validates one design of a file. */
function readEntry(
  value: unknown,
  index: number,
  lookup: Pick<ToolRegistry, "get">,
): { ok: true; design: ImportedDesign } | { ok: false; skipped: SkippedDesign } {
  const skip = (reason: SkipReason) => {
    const name = readName(value);
    return {
      ok: false as const,
      skipped: name === undefined ? { index, reason } : { index, name, reason },
    };
  };
  const entry = entrySchema.safeParse(value);
  if (!entry.success) return skip("invalid");
  const e = entry.data;
  const tool = lookup.get(e.toolId);
  if (!tool) return skip("unknown-tool");
  const parsed = parseToolParams(tool, e.params);
  if (!parsed.success) return skip("invalid-params");
  const params = resanitizeUploads(tool, parsed.data as Record<string, unknown>);
  if (!params) return skip("unsafe-upload");
  // The cleaned SVG must still satisfy the tool.
  if (params !== parsed.data && !tool.schema.safeParse(params).success) {
    return skip("unsafe-upload");
  }
  return {
    ok: true,
    design: {
      id: e.id,
      toolId: tool.id,
      toolVersion: e.toolVersion,
      name: e.name,
      seed: e.seed,
      size: { width: e.size.width, height: e.size.height },
      params,
      createdAt: e.createdAt,
      updatedAt: Math.max(e.updatedAt, e.createdAt),
    },
  };
}

/** Parses and validates an import file. Never throws. */
export function parseDesignsFile(
  text: string,
  lookup: Pick<ToolRegistry, "get">,
): DesignsFileParseResult {
  if (typeof text !== "string") return { ok: false, error: "malformed" };
  if (text.length > DESIGNS_FILE_MAX_BYTES || utf8Length(text) > DESIGNS_FILE_MAX_BYTES) {
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
  // A brand kit file picked by mistake: say where it belongs.
  if (fileFormatOf(json) === BRAND_KIT_FILE_FORMAT) return { ok: false, error: "brand-kit-file" };
  const header = headerSchema.safeParse(json);
  if (!header.success || header.data.format !== DESIGNS_FILE_FORMAT) {
    return { ok: false, error: "wrong-format" };
  }
  if (header.data.version !== DESIGNS_FILE_VERSION) {
    return { ok: false, error: "unsupported-version" };
  }
  if (header.data.designs.length > DESIGNS_FILE_MAX_DESIGNS) {
    return { ok: false, error: "too-many" };
  }
  const designs: ImportedDesign[] = [];
  const skipped: SkippedDesign[] = [];
  header.data.designs.forEach((value, index) => {
    const result = readEntry(value, index, lookup);
    if (!result.ok) {
      skipped.push(result.skipped);
      return;
    }
    // The same id twice in one file: the store keeps both (new id for the second).
    designs.push(result.design);
  });
  return { ok: true, designs, skipped };
}
