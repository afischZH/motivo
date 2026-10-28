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
 * path) and are drawn again after the import. A later version may add a
 * `brandKit` key next to `designs` (M3-AP05).
 *
 * The import treats every file as hostile:
 *  - size limit before parsing, design count limit;
 *  - JSON keys that could pollute prototypes (`__proto__`, `constructor`,
 *    `prototype`) reject the whole file;
 *  - every design is checked against the envelope schema and then against
 *    its tool (`parseToolParams`: `migrateParams`, then the tool's Zod
 *    schema, which drops unknown keys);
 *  - uploaded SVGs (`kind: "image"` params) are sanitised again with
 *    `@motivo/svg-sanitizer` and replaced by the sanitizer's output; raster
 *    uploads must be PNG or JPEG by their magic bytes, matching the declared
 *    type, within the size limits.
 * Designs that fail are skipped with a reason; the rest is imported.
 */
import { sanitizeSvg } from "@motivo/svg-sanitizer";
import type { ImportedDesign } from "@motivo/storage";
import {
  designIdSchema,
  designNameSchema,
  paramsObjectSchema,
  seedValueSchema,
  sizeValueSchema,
  timestampSchema,
  toolIdSchema,
  toolVersionSchema,
} from "@motivo/storage";
import {
  IMAGE_ASSET_MAX_SVG_LENGTH,
  IMAGE_ASSET_RASTER_MAX_EDGE,
  controlKindRegistry,
  parseToolParams,
  type AnyToolDefinition,
  type ToolRegistry,
} from "@motivo/tool-registry";
import * as z from "zod";
import { imageDimensions } from "../image-input/dimensions";
import { sniffImageType } from "../image-input/sniff";
import {
  DESIGNS_FILE_FORMAT,
  DESIGNS_FILE_MAX_BYTES,
  DESIGNS_FILE_MAX_DESIGNS,
  DESIGNS_FILE_VERSION,
  type DesignsFileParseResult,
  type SkipReason,
  type SkippedDesign,
} from "./transfer-format";

/** Keys that never appear in our files and could pollute prototypes when copied. */
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

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

class ForbiddenKeyError extends Error {}

function parseJson(text: string): unknown {
  return JSON.parse(text, (key, value: unknown) => {
    if (FORBIDDEN_KEYS.has(key)) throw new ForbiddenKeyError(key);
    return value;
  });
}

/** Byte length of a string in UTF-8, without encoding it. */
function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

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

/** Whether a raster upload really is the PNG or JPEG it claims, within the size limit. */
export function isSafeRasterHref(href: string): boolean {
  const match = RASTER_HREF.exec(href);
  if (!match) return false;
  const declared = match[1];
  const bytes = base64Head(match[2] ?? "");
  if (!bytes) return false;
  const actual = sniffImageType(bytes);
  if (actual !== declared) return false;
  const dims = imageDimensions(bytes, actual);
  return (
    dims !== null &&
    dims.width <= IMAGE_ASSET_RASTER_MAX_EDGE &&
    dims.height <= IMAGE_ASSET_RASTER_MAX_EDGE
  );
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
    if (typeof value !== "object" || value === null) continue;
    const asset = value as { kind?: unknown; svg?: unknown; href?: unknown };
    if (asset.kind === "svg") {
      if (typeof asset.svg !== "string") return null;
      const clean = sanitizeSvg(asset.svg, { maxLength: IMAGE_ASSET_MAX_SVG_LENGTH });
      if (!clean.ok || clean.svg.length > IMAGE_ASSET_MAX_SVG_LENGTH) return null;
      if (clean.svg !== asset.svg) {
        out ??= { ...params };
        out[key] = { ...asset, svg: clean.svg };
      }
    } else if (asset.kind === "raster") {
      if (typeof asset.href !== "string" || !isSafeRasterHref(asset.href)) return null;
    }
  }
  return out ?? params;
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
    json = parseJson(text);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof ForbiddenKeyError ? "forbidden-keys" : "malformed",
    };
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return { ok: false, error: "wrong-format" };
  }
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
