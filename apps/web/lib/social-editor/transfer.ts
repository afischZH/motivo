/**
 * Import checks of the social designs file (format in transfer-format.ts).
 * Runs in the import worker. Hostile files are expected:
 *  - size limit before parsing, JSON without `__proto__`, `constructor`,
 *    `prototype` keys (any depth);
 *  - envelope and every design per Zod, the scene with `sceneSchema`
 *    (limits on layers, sizes, text, colours, pictures);
 *  - the background with its tool's own schema (`parseToolParams`) and the
 *    uploads in its params checked like a designs import;
 *  - pictures of image and logo layers: SVG sanitised again (whitelist), raster
 *    data URIs checked by magic bytes and their real size against the
 *    declared one.
 * A design that fails is skipped with a reason; the others are imported.
 */
import { isSafeRasterHref, resanitizeUploads } from "@musterli/editor-ui/transfer";
import {
  BRAND_KIT_FILE_FORMAT,
  DESIGNS_FILE_FORMAT,
  ForbiddenKeyError,
  fileFormatOf,
  parseUntrustedJson,
  utf8Length,
} from "@musterli/editor-ui/transfer";
import {
  SCENE_IMAGE_MAX_EDGE,
  SCENE_IMAGE_MAX_SVG_LENGTH,
  sceneSchema,
  type Layer,
  type Scene,
  type SceneImage,
} from "@musterli/scene";
import type { ImportedSocialDesign } from "@musterli/storage";
import { sanitizeSvg } from "@musterli/svg-sanitizer";
import { parseToolParams, type ToolRegistry } from "@musterli/tool-registry";

import {
  SOCIAL_FILE_FORMAT,
  SOCIAL_FILE_MAX_BYTES,
  SOCIAL_FILE_MAX_DESIGNS,
  SOCIAL_FILE_VERSION,
  type SkippedSocialDesign,
  type SocialFileParseResult,
  type SocialSkipReason,
} from "./transfer-format";

const TIMESTAMP_MAX = 10_000_000_000_000;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const isTimestamp = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= TIMESTAMP_MAX;

interface Entry {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  scene: unknown;
}

/** The fields of one design around its scene (the scene is checked on its own). */
function readEntryFields(value: unknown): Entry | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || !ID_PATTERN.test(v.id)) return null;
  if (typeof v.name !== "string" || v.name.length > 120) return null;
  if (!isTimestamp(v.createdAt) || !isTimestamp(v.updatedAt)) return null;
  return { id: v.id, name: v.name, createdAt: v.createdAt, updatedAt: v.updatedAt, scene: v.scene };
}

/** A picture made safe again, or `null` when it is not. */
export function checkSceneImage(image: SceneImage): SceneImage | null {
  if (image.kind === "svg") {
    const clean = sanitizeSvg(image.svg, { maxLength: SCENE_IMAGE_MAX_SVG_LENGTH });
    if (!clean.ok || clean.svg.length > SCENE_IMAGE_MAX_SVG_LENGTH) return null;
    return clean.svg === image.svg ? image : { ...image, svg: clean.svg };
  }
  const declared = Math.max(image.width, image.height);
  if (declared > SCENE_IMAGE_MAX_EDGE) return null;
  return isSafeRasterHref(image.href, declared) ? image : null;
}

type LayerCheck = { ok: true; layer: Layer } | { ok: false; reason: SocialSkipReason };

function checkLayer(layer: Layer, lookup: Pick<ToolRegistry, "get">): LayerCheck {
  if (layer.kind === "background") {
    const tool = lookup.get(layer.toolId);
    if (!tool) return { ok: false, reason: "unknown-tool" };
    const parsed = parseToolParams(tool, layer.params);
    if (!parsed.success) return { ok: false, reason: "invalid-params" };
    const params = resanitizeUploads(tool, parsed.data as Record<string, unknown>);
    if (!params) return { ok: false, reason: "unsafe-upload" };
    if (params !== parsed.data && !tool.schema.safeParse(params).success) {
      return { ok: false, reason: "unsafe-upload" };
    }
    return { ok: true, layer: { ...layer, params } };
  }
  if (layer.kind === "image" || layer.kind === "logo") {
    const image = checkSceneImage(layer.image);
    if (!image) return { ok: false, reason: "unsafe-upload" };
    return { ok: true, layer: image === layer.image ? layer : { ...layer, image } };
  }
  return { ok: true, layer };
}

/** A scene from a file, checked like an import (also for drafts and handoffs). */
export function checkImportedScene(
  value: unknown,
  lookup: Pick<ToolRegistry, "get">,
): { ok: true; scene: Scene } | { ok: false; reason: SocialSkipReason } {
  const parsed = sceneSchema.safeParse(value);
  if (!parsed.success) return { ok: false, reason: "invalid-scene" };
  const layers: Layer[] = [];
  for (const layer of parsed.data.layers) {
    const checked = checkLayer(layer, lookup);
    if (!checked.ok) return checked;
    layers.push(checked.layer);
  }
  const scene = { ...parsed.data, layers };
  // The cleaned pictures must still satisfy the scene schema.
  const again = sceneSchema.safeParse(scene);
  return again.success ? { ok: true, scene: again.data } : { ok: false, reason: "unsafe-upload" };
}

function readName(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const name = (value as { name?: unknown }).name;
  return typeof name === "string" ? name.slice(0, 120) : undefined;
}

/** Parses and validates a social designs file. Never throws. */
export function parseSocialFile(
  text: string,
  lookup: Pick<ToolRegistry, "get">,
): SocialFileParseResult {
  if (typeof text !== "string") return { ok: false, error: "malformed" };
  if (text.length > SOCIAL_FILE_MAX_BYTES || utf8Length(text) > SOCIAL_FILE_MAX_BYTES) {
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
  if (format === BRAND_KIT_FILE_FORMAT) return { ok: false, error: "brand-kit-file" };
  const header = json as { version?: unknown; designs?: unknown };
  if (format !== SOCIAL_FILE_FORMAT || !Array.isArray(header.designs)) {
    return { ok: false, error: "wrong-format" };
  }
  if (header.version !== SOCIAL_FILE_VERSION) return { ok: false, error: "unsupported-version" };
  if (header.designs.length > SOCIAL_FILE_MAX_DESIGNS) return { ok: false, error: "too-many" };
  const list: unknown[] = header.designs;

  const designs: ImportedSocialDesign[] = [];
  const skipped: SkippedSocialDesign[] = [];
  list.forEach((value, index) => {
    const skip = (reason: SocialSkipReason) => {
      const name = readName(value);
      skipped.push(name === undefined ? { index, reason } : { index, name, reason });
    };
    const entry = readEntryFields(value);
    if (!entry) return skip("invalid");
    const checked = checkImportedScene(entry.scene, lookup);
    if (!checked.ok) return skip(checked.reason);
    designs.push({
      id: entry.id,
      name: entry.name,
      scene: checked.scene,
      createdAt: entry.createdAt,
      updatedAt: Math.max(entry.updatedAt, entry.createdAt),
    });
  });
  return { ok: true, designs, skipped };
}
