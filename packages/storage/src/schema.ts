/**
 * Shapes of what Musterli keeps in the browser (docs/ARCHITECTURE.md
 * section 6). Records are validated on every read as well: browser storage
 * can be edited by hand, left behind by an older version or corrupted, and a
 * broken record must never break the page. Params are only checked to be a
 * plain object here; the tool's own schema (`parseToolParams`) validates
 * them when a design is opened, imported or rendered.
 */
// Namespace import keeps zod tree-shakable (see tool-registry/common.ts).
import * as z from "zod";

/** Longest design name in characters. */
export const DESIGN_NAME_MAX = 120;
/** Ids we create are 32 hex characters; imported files may bring other safe ids. */
export const DESIGN_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
/** Same bounds as `canvasSizeSchema` in the tool registry. */
export const SIZE_EDGE_MIN = 16;
export const SIZE_EDGE_MAX = 8192;
/** Thumbnails are about 400 px WebP (a PNG fallback is larger); anything bigger is dropped. */
export const THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;
/** Image types a stored thumbnail may have (shown via `<img>` only). */
export const THUMBNAIL_TYPES = ["image/webp", "image/png", "image/jpeg"] as const;

/** Latest plausible timestamp (year 2286): rejects absurd values without a clock. */
const TIMESTAMP_MAX = 10_000_000_000_000;

export const designIdSchema = z.string().regex(DESIGN_ID_PATTERN);
export const toolIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const toolVersionSchema = z.int().min(1).max(1_000_000);
export const designNameSchema = z.string().max(DESIGN_NAME_MAX);
export const seedValueSchema = z.int().min(0).max(0xffffffff);
export const timestampSchema = z.int().min(0).max(TIMESTAMP_MAX);
export const sizeValueSchema = z.object({
  width: z.int().min(SIZE_EDGE_MIN).max(SIZE_EDGE_MAX),
  height: z.int().min(SIZE_EDGE_MIN).max(SIZE_EDGE_MAX),
});

/**
 * A plain object of any realm (IndexedDB and workers clone into the page's
 * realm, test environments may not), not an array, class instance or null.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === null || Object.getPrototypeOf(proto) === null;
}

/** A plain JSON object (no array, no null). Contents are checked by the tool schema. */
export const paramsObjectSchema = z.custom<Record<string, unknown>>(isPlainObject, {
  message: "Expected a plain object",
});

export const storedThumbnailSchema = z.object({
  type: z.enum(THUMBNAIL_TYPES),
  bytes: z.custom<ArrayBuffer>(
    (value) =>
      Object.prototype.toString.call(value) === "[object ArrayBuffer]" &&
      (value as ArrayBuffer).byteLength <= THUMBNAIL_MAX_BYTES,
  ),
});

/** Row of the `designs` store: everything the overview needs, without params. */
export const storedDesignSchema = z.object({
  id: designIdSchema,
  toolId: toolIdSchema,
  toolVersion: toolVersionSchema,
  name: designNameSchema,
  seed: seedValueSchema,
  size: sizeValueSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  thumbnail: storedThumbnailSchema.nullable(),
});

/** Row of the `design-params` store (kept apart: uploads can make params large). */
export const storedParamsSchema = z.object({
  id: designIdSchema,
  params: paramsObjectSchema,
});

/** Row of the `drafts` store: the last editor state per tool (autosave). */
export const storedDraftSchema = z.object({
  toolId: toolIdSchema,
  toolVersion: toolVersionSchema,
  /** The saved design the draft belongs to, or `null` for an unsaved one. */
  designId: designIdSchema.nullable(),
  name: designNameSchema,
  params: paramsObjectSchema,
  seed: seedValueSchema,
  size: sizeValueSchema,
  updatedAt: timestampSchema,
});

export type StoredDesign = z.output<typeof storedDesignSchema>;
export type StoredParams = z.output<typeof storedParamsSchema>;
export type StoredDraft = z.output<typeof storedDraftSchema>;
export type DesignSize = z.output<typeof sizeValueSchema>;
